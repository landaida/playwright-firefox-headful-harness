# playwright-firefox-headful-harness

A compact, production-style harness for running **Playwright + Firefox in headful mode** on a virtual display (Xvfb) inside Docker, with persistent profiles, an optional upstream proxy per session, a "quiet Firefox" preference set, and a worker that consumes URL jobs and writes results as JSONL.

## Why headful Firefox on a virtual display

- **Headless browsers are trivially fingerprinted.** Differences in rendering, window metrics, media and API surface give them away. Browser-based QA, monitoring and data collection are more reliable with a real, headed browser on a virtual display. This harness never launches headless and refuses to start without a `DISPLAY`.
- **Firefox is a deliberate choice**: Playwright drives it through its own juggler protocol, profiles are plain directories that are easy to inspect, back up and reuse, and `user.js` preferences give full control over background traffic.
- **A persistent profile keeps cookies and sessions** between runs: one profile directory per session id, mounted from the host.
- **Quiet prefs stop Firefox's own background traffic** (telemetry, remote settings, updates, captive-portal probes, safe browsing, GMP downloads, OCSP, speculative connects). Proxy bandwidth is then spent only on the target, and request logs show only what you asked for.

## Architecture

```
 +------------------------------ container ------------------------------+
 |                                                                       |
 |  Xvfb :99 (1600x1000x24) --- x11vnc :5900 ---> VNC viewer (optional)  |
 |        ^                                                              |
 |        | renders                                                      |
 |  Firefox (Playwright, headful, persistent profile per session)        |
 |        ^                                                              |
 |        | drives                    optional upstream proxy ---> web   |
 |  src/worker.js                                                        |
 |        ^                      |                                       |
 +--------|----------------------|---------------------------------------+
   jobs.json (or stdin)     results.jsonl + <jobId>.png   (./out volume)
                            profiles/<session>/           (./profiles volume)
```

## Quick start

```bash
echo 'VNC_PASSWORD=change-me' > .env
docker compose up --build -d
docker compose exec harness node src/worker.js --jobs jobs.example.json
cat out/results.jsonl
```

Jobs from stdin:

```bash
echo '[{"id":"a","url":"https://example.com"}]' | docker compose exec -T harness node src/worker.js --jobs -
```

CLI flags: `--jobs file.json|-`, `--out results.jsonl` (default `$OUT_DIR/results.jsonl`), `--concurrency N`.

A job is `{ "id": "...", "url": "...", "session": "default" }`. Jobs sharing a `session` share one persistent Firefox context (and one profile directory).

Each result line contains: `id, ok, url, finalUrl, status, htmlBytes, screenshot, networkIdle, timings{loadMs,totalMs}, bytesTotal, requestsTotal, hosts, requestLog, attempts, finishedAt`. Failures are written as `{id, ok:false, url, error}`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DISPLAY` | `:99` | X display Firefox renders into. The harness exits if unset on Linux. |
| `PROXY_SERVER` | unset | Upstream proxy, e.g. `http://proxy.example:8000`. Unset means direct. |
| `PROXY_USERNAME` / `PROXY_PASSWORD` | unset | Proxy credentials. |
| `PROXY_PIN_SESSION` | unset | `1` appends `-session-<sessionId>` to the username (see below). |
| `PROFILE_DIR` | `./profiles` (`/app/profiles` in Docker) | Root for per-session profiles. |
| `OUT_DIR` | `./out` | Screenshots and default results file. |
| `USER_AGENT` | Firefox default | Override the UA string. |
| `VIEWPORT` | `1440x900` | `WIDTHxHEIGHT`. |
| `CONCURRENCY` | `2` | Parallel jobs (also `--concurrency`). |
| `PER_HOST_DELAY_MS` | `1000` | Minimum spacing between navigations to the same host. |
| `NAV_TIMEOUT_MS` | `45000` | Navigation timeout. |
| `NETWORKIDLE_CAP_MS` | `10000` | Max wait for `networkidle` after load (pages that never idle still return). |
| `MAX_ATTEMPTS` | `3` | Attempts per job; exponential backoff 1s, 2s, 4s... |
| `VNC_PASSWORD` | required | Password for x11vnc. |

## Proxy sessions

Some proxy providers offer "sticky sessions" that keep one exit IP for a session encoded in the username, commonly `username-session-<id>`. With `PROXY_PIN_SESSION=1` the harness builds the username as `${PROXY_USERNAME}-session-${sessionId}`, where `sessionId` is the job's `session` field. Every job in a session therefore keeps the same exit IP and the same profile (cookies), which is what most login-dependent flows need. Check your provider's documentation for its exact convention; if it differs, adjust `proxyFor()` in `src/browser.js`.

## Watching the browser over VNC

Port 5900 is published on `127.0.0.1` only. Connect a VNC viewer to `localhost:5900` with `VNC_PASSWORD`. On a remote host, tunnel it: `ssh -L 5900:127.0.0.1:5900 user@host`. This is also how you solve a challenge by hand: the profile is persistent, so the result is kept.

## Observability

- Every request and response is logged through `page.on('request')` and `page.on('response')` into `requestLog` (relative timestamp, method, URL, resource type, status). Failed requests are logged with the error text.
- On `requestfinished`, `request.sizes()` provides headers and body bytes, which `src/hostStats.js` aggregates **per host**. The worker prints a one-line summary per job (`host=bytes/requests`) and stores the full table in `hosts`, with `bytesTotal` and `requestsTotal`.
- Because quiet prefs remove Firefox's own traffic, the table should list only the target and its subresource hosts. Anything else is worth investigating.

## Quiet prefs

Defined in `src/firefoxPrefs.js` (one comment per pref in the source). Summary:

| Group | Why |
|---|---|
| `toolkit.telemetry.*`, `datareporting.*`, `app.shield.*`, `app.normandy.*` | No telemetry, health reports, studies or experiments. |
| `services.settings.server`, `extensions.getAddons.*`, `extensions.update/blocklist` | Remote settings and add-on metadata sync point at a dead localhost URL or are off. |
| `app.update.*` | No update checks or downloads. |
| `network.captive-portal-service`, `network.connectivity-service` | No connectivity or captive-portal probes. |
| `network.prefetch-next`, `network.dns.disablePrefetch*`, `network.predictor.*`, speculative connect prefs | No speculative DNS or connections to hosts you did not request. |
| `browser.safebrowsing.*` | No safe-browsing list downloads or lookups. |
| `media.gmp-*` | No codec/CDM plugin downloads. |
| `security.OCSP.enabled=0` | No certificate-revocation lookups to third-party responders. |
| `browser.newtabpage.*`, `browser.region.*`, `geo.*`, welcome/what's-new pages | No content feed, region lookup or first-run pages. |
| `network.trr.mode=5`, `doh-rollout.*` | No DNS-over-HTTPS rollout probes. |

Trade-offs: disabling OCSP and safe browsing lowers protection against revoked certificates and malicious pages. Use this only for automation against sites you have chosen.

## Limitations

- Headful with a virtual display is harder to detect than headless, not undetectable. This is not a stealth tool and does not alter fingerprints beyond the optional UA.
- Jobs sharing a session share one browser context; concurrency within a session means several tabs in the same profile.
- `request.sizes()` reports transferred sizes as seen by the browser; proxy-level accounting can differ slightly.
- Retries cover navigation errors only; HTTP error statuses are reported in `status`, not retried.
- Only Firefox is wired up; the Docker image pins Playwright 1.49.1 and `package.json` pins the same version.
- Respect the terms of service and robots policies of the sites you visit.

## Development

```bash
npm install
npm run check       # node --check on every source file
```

## Responsible use

Run this only against sites you own, sites you are authorized to test, or public pages whose terms allow automated access. Respect `robots.txt`, rate limits and the per-host delay. The harness is a QA and monitoring tool, not a way around access controls.

## License

MIT, see [LICENSE](LICENSE).
