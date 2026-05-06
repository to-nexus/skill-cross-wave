#!/usr/bin/env node
// referral.mjs — read the user's CROSS WAVE referral link and stats.
//
// Hits GET /referrals/me. Requires a persisted session.
// Per the SKILL.md no-spamming rail: this subcommand only READS.

import 'dotenv/config';
import { waveFetch } from './_api.mjs';
import { requireSession } from './_session.mjs';

const parsedIntent = { command: 'referral' };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  const session = requireSession();
  const data = await waveFetch('referralPath', {
    method: 'GET',
    sessionToken: session.token,
  });

  emit({
    ok: true,
    parsedIntent,
    referralLink: data?.referralLink ?? data?.link ?? null,
    referralCode: data?.referralCode ?? data?.code ?? null,
    refereeCount: data?.refereeCount ?? data?.refereesCount ?? null,
    accruedCROSS_5pct: data?.accruedCommission ?? data?.accruedCommissionCross ?? null,
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
