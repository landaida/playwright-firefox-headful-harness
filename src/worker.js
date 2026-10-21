#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { launchSession } = require('./browser');
const { HostStats } = require('./hostStats');

function parseArgs(argv) {
  const a = { jobs: null, out: null, concurrency: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--jobs') a.jobs = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--concurrency') a.concurrency = Number(argv[++i]);
    else if (argv[i] === '-h' || argv[i] === '--help') a.help = true;
  }
  return a;
}

function readJobs(src) {
  const raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  const jobs = JSON.parse(raw);
  if (!Array.isArray(jobs)) throw new Error('jobs must be a JSON array');
  return jobs.map((j, i) => ({ id: j.id || `job-${i + 1}`, session: 'default', ...j }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.jobs) {
    console.log('Usage: node src/worker.js --jobs <file.json|-> [--out results.jsonl] [--concurrency N]');
    process.exit(args.help ? 0 : 2);
  }
  const outDir = process.env.OUT_DIR || './out';
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = args.out || path.join(outDir, 'results.jsonl');
  const concurrency = Math.max(1, args.concurrency || Number(process.env.CONCURRENCY) || 2);
  const hostDelay = Number(process.env.PER_HOST_DELAY_MS ?? 1000);
  const navTimeout = Number(process.env.NAV_TIMEOUT_MS || 45000);
  const idleCap = Number(process.env.NETWORKIDLE_CAP_MS || 10000);
  const maxAttempts = Number(process.env.MAX_ATTEMPTS || 3);

  const queue = readJobs(args.jobs);
  const contexts = new Map(); // sessionId -> Promise<BrowserContext>
  const nextSlot = new Map(); // host -> earliest timestamp for next navigation
  let stopping = false;

  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      console.error(`${sig} received: finishing in-flight jobs, not starting new ones`);
      stopping = true;
    });
  }

  const getContext = (id) => {
    if (!contexts.has(id)) contexts.set(id, launchSession(id));
    return contexts.get(id);
  };

  // Reserve a time slot per host so concurrent workers stay polite.
  async function throttle(url) {
    if (!hostDelay) return;
    const host = new URL(url).host;
    const now = Date.now();
    const at = Math.max(now, nextSlot.get(host) || 0);
    nextSlot.set(host, at + hostDelay);
    if (at > now) await sleep(at - now);
  }

  async function attempt(job) {
    const ctx = await getContext(job.session);
    const page = await ctx.newPage();
    const stats = new HostStats();
    const log = [];
    const t0 = Date.now();

    page.on('request', (req) => log.push({ t: Date.now() - t0, ev: 'request', method: req.method(), url: req.url(), type: req.resourceType() }));
    page.on('response', (res) => log.push({ t: Date.now() - t0, ev: 'response', status: res.status(), url: res.url() }));
    page.on('requestfinished', async (req) => {
      try {
        const s = await req.sizes();
        stats.add(req.url(), s.requestHeadersSize + s.requestBodySize + s.responseHeadersSize + s.responseBodySize);
      } catch {
        stats.add(req.url(), 0);
      }
    });
    page.on('requestfailed', (req) => {
      stats.add(req.url(), 0, true);
      log.push({ t: Date.now() - t0, ev: 'failed', url: req.url(), error: req.failure()?.errorText });
    });

    try {
      await throttle(job.url);
      const tNav = Date.now();
      const resp = await page.goto(job.url, { timeout: navTimeout, waitUntil: 'load' });
      const loadMs = Date.now() - tNav;
      let networkIdle = true;
      await page.waitForLoadState('networkidle', { timeout: idleCap }).catch(() => { networkIdle = false; });
      const html = await page.content();
      const shot = path.join(outDir, `${job.id}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      // Let in-flight requestfinished handlers settle before reading totals.
      await sleep(100);
      return {
        id: job.id, ok: true, url: job.url, finalUrl: page.url(),
        status: resp ? resp.status() : null, htmlBytes: Buffer.byteLength(html),
        screenshot: shot, networkIdle,
        timings: { loadMs, totalMs: Date.now() - t0 },
        bytesTotal: stats.totals().bytes, requestsTotal: stats.totals().requests,
        hosts: stats.toJSON(), requestLog: log,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async function runJob(job) {
    let lastErr;
    for (let n = 1; n <= maxAttempts && !stopping; n++) {
      try {
        const r = await attempt(job);
        r.attempts = n;
        return r;
      } catch (e) {
        lastErr = e;
        console.error(`[${job.id}] attempt ${n}/${maxAttempts} failed: ${e.message.split('\n')[0]}`);
        if (n < maxAttempts) await sleep(1000 * 2 ** (n - 1));
      }
    }
    return { id: job.id, ok: false, url: job.url, error: lastErr ? lastErr.message.split('\n')[0] : 'aborted before start' };
  }

  async function loop() {
    while (!stopping) {
      const job = queue.shift();
      if (!job) return;
      const result = await runJob(job);
      result.finishedAt = new Date().toISOString();
      fs.appendFileSync(outFile, JSON.stringify(result) + '\n');
      if (result.ok) {
        const top = Object.entries(result.hosts).map(([h, s]) => `${h}=${s.bytes}B/${s.requests}req`).join(' ');
        console.log(`[${job.id}] ${result.status} ${result.finalUrl} html=${result.htmlBytes}B ${result.timings.totalMs}ms | ${top}`);
      } else {
        console.log(`[${job.id}] FAILED ${result.error}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, loop));
  if (queue.length) console.error(`${queue.length} job(s) not started due to shutdown`);

  await Promise.all([...contexts.values()].map((p) => p.then((c) => c.close()).catch(() => {})));
  console.log(`done -> ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
