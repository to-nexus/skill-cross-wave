// _session.mjs — load/save the cross-wave session.
//
// CROSS WAVE auth is CROSSx wallet OAuth, which is browser-driven and not
// programmatically reproducible. So the "session" stored here is a JWT
// access_token the user captured from their browser's DevTools after
// logging into wave.crosstoken.io. Store path:
//   ~/.claude/skills/cross-wave/.sessions/wave.json
//
// Stored fields:
//   { token, expiresAt, savedAt }
//
// Permissions: written with chmod 600.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SESSION_DIR = path.join(os.homedir(), '.claude', 'skills', 'cross-wave', '.sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'wave.json');

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadSession() {
  // Env var shortcut — useful for one-shot calls where the user pastes a
  // token without persisting it.
  if (process.env.CROSS_WAVE_ACCESS_TOKEN) {
    return {
      token: process.env.CROSS_WAVE_ACCESS_TOKEN,
      expiresAt: null,
      _path: '<env:CROSS_WAVE_ACCESS_TOKEN>',
    };
  }
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    const st = fs.statSync(SESSION_FILE);
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
      const err = new Error(`session file ${SESSION_FILE} not owned by current user (uid mismatch)`);
      err.code = 'session_file_alien';
      throw err;
    }
    const txt = fs.readFileSync(SESSION_FILE, 'utf8');
    const json = JSON.parse(txt);
    return { ...json, _path: SESSION_FILE };
  } catch (err) {
    if (err.code === 'session_file_alien') throw err;
    const e = new Error(`failed to read session file ${SESSION_FILE}: ${err.message}`);
    e.code = 'session_read_failed';
    throw e;
  }
}

export function saveSession({ token, expiresAt }) {
  if (!token) {
    const err = new Error('saveSession: token required');
    err.code = 'bad_session';
    throw err;
  }
  ensureSessionDir();
  const payload = {
    token,
    expiresAt: expiresAt ?? null,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.chmodSync(SESSION_FILE, 0o600);
  return { ...payload, _path: SESSION_FILE };
}

export function deleteSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  return SESSION_FILE;
}

export function requireSession() {
  const s = loadSession();
  if (!s || !s.token) {
    const err = new Error(
      'no persisted session — run `node scripts/login.mjs --token <…>` with an access_token captured from wave.crosstoken.io DevTools'
    );
    err.code = 'not_logged_in';
    err.exitCode = 2;
    err.hint = 'see references/cross-wave.md §3 for how to capture a token';
    throw err;
  }
  return s;
}

/**
 * Decode a JWT's `exp` claim (best-effort, no signature verification).
 * Returns null if the token is malformed or has no exp.
 */
export function decodeJwtExp(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number') return null;
    return new Date(payload.exp * 1000).toISOString();
  } catch {
    return null;
  }
}
