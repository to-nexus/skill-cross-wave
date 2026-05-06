// _guard.mjs — input validation rails for cross-wave.
//
// Currently the only non-trivial guard is `assertVideoUrl()` — the submit
// URL allow-list + HTTPS-only check. (The mission-existence and
// already-submitted guards live inside submit.mjs because they need a
// fresh round-trip.)

const DEFAULT_SUBMIT_HOSTS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'vt.tiktok.com',
];

function allowedHosts() {
  const env = process.env.CROSS_WAVE_SUBMIT_HOSTS;
  if (!env) return DEFAULT_SUBMIT_HOSTS;
  return env.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Throws { code: 'bad_url', exitCode: 2 } if the URL is not HTTPS or its
 * host (or a dotted suffix of its host) is not in the allow-list.
 * Returns the parsed URL on success.
 */
export function assertVideoUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    const err = new Error(`bad_url: not a parseable URL: ${raw}`);
    err.code = 'bad_url';
    err.exitCode = 2;
    err.rejected = raw;
    err.allowList = allowedHosts();
    throw err;
  }
  if (parsed.protocol !== 'https:') {
    const err = new Error(`bad_url: HTTPS required, got ${parsed.protocol}`);
    err.code = 'bad_url';
    err.exitCode = 2;
    err.rejected = raw;
    err.allowList = allowedHosts();
    throw err;
  }
  const host = parsed.hostname.toLowerCase();
  const ok = allowedHosts().some((h) => host === h || host.endsWith(`.${h}`));
  if (!ok) {
    const err = new Error(`bad_url: host ${host} not in allow-list`);
    err.code = 'bad_url';
    err.exitCode = 2;
    err.rejected = raw;
    err.allowList = allowedHosts();
    throw err;
  }
  return parsed;
}

export { allowedHosts };
