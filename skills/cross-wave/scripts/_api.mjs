// _api.mjs — fetch wrapper for the CROSS WAVE backend
// (https://wave-client-api.crosstoken.io). The back-end is a Spring Boot
// service that:
//   - requires `X-Domain` header on every request (any value)
//   - account-private calls remain blocked by the distributable skill
//   - returns Spring paginated responses for list endpoints:
//     {content: [...], pageable, first, last, size, number, sort,
//      numberOfElements, empty}
//   - returns Spring error envelope for failures:
//     {timestamp, status, error, code, message}
//
// Body+query are passed through as-is (no snake↔camel conversion) — the
// back-end already speaks camelCase consistently.

import { getEndpoints, requireSlot } from './_registry.mjs';

const REQUEST_TIMEOUT_MS = 15_000;

function buildQuery(query) {
  if (!query || Object.keys(query).length === 0) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function waveApiBase() {
  if (process.env.CROSS_WAVE_API_BASE) {
    return process.env.CROSS_WAVE_API_BASE.replace(/\/$/, '');
  }
  const v = requireSlot('apiBase');
  return String(v).replace(/\/$/, '');
}

/**
 * waveFetch(key, options)
 *   key      : endpoint slot key (e.g. 'missionsPath') OR a literal '/...' path
 *   options  : { method, body, query, sessionToken, pathParams }
 *
 * Always emits structured errors:
 *   - request_timeout  (exit 1)
 *   - http_<status>    (exit 1) — bodyText preserved
 *   - For 401: surfaces error.code = 'unauthorized' so callers can prompt re-login.
 */
export async function waveFetch(key, opts = {}) {
  const { method = 'GET', body, query, sessionToken, pathParams = {} } = opts;

  const base = waveApiBase();
  let pathPart;
  if (typeof key === 'string' && key.startsWith('/')) {
    pathPart = key;
  } else {
    pathPart = String(requireSlot(key));
    if (!pathPart.startsWith('/')) pathPart = `/${pathPart}`;
  }

  for (const [k, v] of Object.entries(pathParams)) {
    pathPart = pathPart.replace(`{${k}}`, encodeURIComponent(String(v)));
  }

  const url = `${base}${pathPart}${buildQuery(query)}`;

  const ep = getEndpoints();
  const headers = { Accept: 'application/json' };

  // Always-on extra headers (e.g. X-Domain).
  if (ep.extraHeaders) {
    for (const [k, v] of Object.entries(ep.extraHeaders)) {
      headers[k] = v;
    }
  }

  if (sessionToken) {
    const sh = ep.sessionHeader ?? { kind: 'bearer' };
    if (sh.kind === 'bearer') headers.Authorization = `Bearer ${sessionToken}`;
    else if (sh.kind === 'cookie') headers.Cookie = `${sh.name}=${sessionToken}`;
    else if (sh.kind === 'header') headers[sh.name] = sessionToken;
  }

  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers, body: payload, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = text.length > 0 ? JSON.parse(text) : null; } catch { /* leave as text */ }
    if (!res.ok) {
      const err = new Error(`${method} ${url} HTTP ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      err.bodyText = text;
      err.bodyJson = json;
      if (res.status === 401) {
        err.code = 'unauthorized';
        err.exitCode = 2;
        err.hint = 'account-private CROSS WAVE actions are outside this AI chat skill; use https://wave.crosstoken.io directly';
      } else {
        err.code = `http_${res.status}`;
      }
      throw err;
    }
    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error(`${method} ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      e.code = 'request_timeout';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
