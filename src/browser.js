'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { firefox } = require('playwright');
const quietPrefs = require('./firefoxPrefs');

function parseViewport(s = '1440x900') {
  const m = /^(\d+)x(\d+)$/.exec(s);
  return m ? { width: +m[1], height: +m[2] } : { width: 1440, height: 900 };
}

/** Build the proxy option. With PROXY_PIN_SESSION=1 the session id is appended to the username. */
function proxyFor(sessionId, env = process.env) {
  if (!env.PROXY_SERVER) return undefined;
  const proxy = { server: env.PROXY_SERVER };
  if (env.PROXY_USERNAME) {
    const pin = ['1', 'true'].includes(String(env.PROXY_PIN_SESSION).toLowerCase());
    proxy.username = pin ? `${env.PROXY_USERNAME}-session-${sessionId}` : env.PROXY_USERNAME;
    proxy.password = env.PROXY_PASSWORD || '';
  }
  return proxy;
}

/**
 * Launch a HEADFUL Firefox with a persistent profile dedicated to `sessionId`.
 * Requires a display (DISPLAY=:99 inside the container).
 */
async function launchSession(sessionId, env = process.env) {
  if (!env.DISPLAY && process.platform === 'linux') {
    throw new Error('DISPLAY is not set: this harness never runs headless. Start Xvfb first.');
  }
  const safeId = String(sessionId).replace(/[^\w.-]/g, '_');
  const userDataDir = path.join(env.PROFILE_DIR || './profiles', safeId);
  fs.mkdirSync(userDataDir, { recursive: true });

  const opts = {
    headless: false, // never headless
    viewport: parseViewport(env.VIEWPORT),
    firefoxUserPrefs: quietPrefs,
    proxy: proxyFor(safeId, env),
  };
  if (env.USER_AGENT) opts.userAgent = env.USER_AGENT;
  return firefox.launchPersistentContext(userDataDir, opts);
}

module.exports = { launchSession, proxyFor, parseViewport };
