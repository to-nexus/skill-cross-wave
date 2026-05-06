#!/usr/bin/env node
// whoami.mjs — read the authenticated user's CROSS WAVE profile.
//
// Requires a persisted session (run login first with a captured access_token).
//
// Usage:
//   node scripts/whoami.mjs

import 'dotenv/config';
import { waveFetch } from './_api.mjs';
import { requireSession } from './_session.mjs';

const parsedIntent = { command: 'whoami' };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  const session = requireSession();
  const data = await waveFetch('whoamiPath', {
    method: 'GET',
    sessionToken: session.token,
  });

  // Field names below are best-effort projections; full payload is in `raw`.
  emit({
    ok: true,
    parsedIntent,
    address: data?.walletAddress ?? data?.address ?? null,
    nickname: data?.nickname ?? null,
    accruedCROSS: data?.accruedCross ?? data?.pendingCross ?? null,
    submittedMissionCount: data?.submittedMissionCount ?? data?.missionCount ?? null,
    raw: data,
  });
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
