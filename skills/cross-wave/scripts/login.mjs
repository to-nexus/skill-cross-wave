#!/usr/bin/env node
// login.mjs — log into CROSS WAVE.
//
// CROSS WAVE auth is CROSSx wallet OAuth at cross-auth.crosstoken.io.
// That flow is browser-driven and cannot be reliably automated:
//   - SIWE / EOA-only sign-in is not supported (no /nonce/verify endpoints).
//   - WebAuthn cross-device passkey ("phone auth") triggers macOS TCC checks
//     that crash Playwright's bundled chromium (no NSBluetoothAlwaysUsageDescription
//     in Info.plist of Chrome for Testing).
//   - Any future entitlement gap can break a headless OAuth attempt.
//
// So login is a two-step process: the user logs in with their normal browser
// (where CROSSx OAuth works perfectly), then pastes the access_token here.
//
// Two modes:
//
//   GUIDANCE MODE  (no args)
//     Emits a structured envelope describing the capture steps. The chat
//     agent reads the `instructions` array and walks the user through each
//     step in chat. When the user pastes their token, the agent re-runs
//     this script with `--token <jwt>`.
//
//   PASTE MODE     (--token <jwt>)
//     Verifies the token by hitting GET /users/me, decodes its `exp` claim,
//     and persists to ~/.claude/skills/cross-wave/.sessions/wave.json (chmod 600).
//     The token is never echoed back to the transcript.
//
// Env shortcut: setting CROSS_WAVE_ACCESS_TOKEN works as if --token were passed.

import 'dotenv/config';
import { waveFetch } from './_api.mjs';
import { saveSession, decodeJwtExp } from './_session.mjs';

function parseArgs(argv) {
  const out = { token: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token') out.token = String(argv[++i] ?? '');
    else if (a.startsWith('--token=')) out.token = a.slice('--token='.length);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const envToken = process.env.CROSS_WAVE_ACCESS_TOKEN || '';
const haveToken = Boolean(args.token || envToken);
const parsedIntent = {
  command: 'login',
  mode: haveToken ? 'paste' : 'guidance',
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

function emitGuidance() {
  emit({
    ok: true,
    parsedIntent,
    needsAction: 'paste_access_token',
    summary: 'CROSS WAVE login requires a JWT access_token captured from your browser. Follow the steps below, then re-run login with --token <pasted-value>.',
    instructions: [
      {
        step: 1,
        title: 'Open CROSS WAVE in your browser',
        detail: 'Navigate to https://wave.crosstoken.io/campaign and log in with your CROSSx wallet (any 2FA method works — this is your normal browser, no Playwright restrictions).',
      },
      {
        step: 2,
        title: 'Open DevTools',
        detail: 'macOS: Cmd+Option+I, Windows/Linux: F12. Switch to the "Network" tab.',
      },
      {
        step: 3,
        title: 'Trigger any authenticated request',
        detail: 'Reload the page (Cmd+R / Ctrl+R). The SPA will fire requests like /users/me to wave-client-api.crosstoken.io.',
      },
      {
        step: 4,
        title: 'Copy the bearer token',
        detail: 'Click any wave-client-api row in Network → Headers tab → Request Headers → copy the value AFTER "Authorization: Bearer " (the long JWT, NOT the word "Bearer").',
      },
      {
        step: 5,
        title: 'Paste it here',
        detail: 'Send the token in chat. The skill will run `node scripts/login.mjs --token <pasted-value>` to verify and persist it (chmod 600). The token will never be echoed back.',
      },
    ],
    fallbackEnv: 'You can also set CROSS_WAVE_ACCESS_TOKEN=<jwt> in env for one-shot calls without persisting.',
    persistedTo: '~/.claude/skills/cross-wave/.sessions/wave.json',
    expiryNote: 'JWTs typically expire in 1–24 hours. When auth-required calls return `unauthorized`, repeat steps 1–5 with a fresh token.',
    securityNote: 'The token is treated as a credential — never echoed back, never written into the transcript.',
  });
}

async function verifyAndPersist(token) {
  if (token.split('.').length !== 3) {
    const err = new Error('token does not look like a JWT (expected three dot-separated parts; copy ONLY the value after "Bearer ", not "Bearer xxx")');
    err.code = 'bad_token_format';
    err.exitCode = 2;
    throw err;
  }

  // Verify by hitting whoami. 401 → token bad/expired; 200 → good.
  const me = await waveFetch('whoamiPath', {
    method: 'GET',
    sessionToken: token,
  });

  const expiresAt = decodeJwtExp(token);
  saveSession({ token, expiresAt });

  emit({
    ok: true,
    parsedIntent,
    address: me?.walletAddress ?? me?.address ?? null,
    nickname: me?.nickname ?? null,
    expiresAt,
    persistedAt: '~/.claude/skills/cross-wave/.sessions/wave.json',
    note: 'token persisted (chmod 600); not echoed back',
  });
}

async function main() {
  if (!haveToken) {
    emitGuidance();
    return;
  }
  await verifyAndPersist(args.token || envToken);
}

main().catch((err) => {
  if (process.env.DEBUG) process.stderr.write(String(err?.stack || err) + '\n');
  emit({
    ok: false,
    parsedIntent,
    error: err?.code || 'unknown_error',
    message: err?.message || String(err),
    hint: err?.hint ?? null,
    bodyJson: err?.bodyJson ?? null,
  });
  process.exit(err?.exitCode ?? 1);
});
