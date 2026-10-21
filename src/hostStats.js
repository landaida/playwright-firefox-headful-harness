'use strict';

/** Aggregates request count and transferred bytes per host. */
class HostStats {
  constructor() {
    this.hosts = new Map();
  }

  /** Record one finished request. `bytes` is headers + body as sent over the wire when known. */
  add(url, bytes = 0, failed = false) {
    let host;
    try {
      host = new URL(url).host;
    } catch {
      host = '(invalid)';
    }
    const h = this.hosts.get(host) || { requests: 0, bytes: 0, failed: 0 };
    h.requests += 1;
    h.bytes += Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    if (failed) h.failed += 1;
    this.hosts.set(host, h);
  }

  totals() {
    let requests = 0;
    let bytes = 0;
    for (const h of this.hosts.values()) {
      requests += h.requests;
      bytes += h.bytes;
    }
    return { requests, bytes };
  }

  /** Plain object sorted by bytes descending. */
  toJSON() {
    return Object.fromEntries([...this.hosts.entries()].sort((a, b) => b[1].bytes - a[1].bytes));
  }
}

module.exports = { HostStats };
