#!/usr/bin/env node
// claim.mjs — historically intended to claim accrued $CROSS rewards.
//
// CROSS WAVE has NO user-initiated claim. Mission rewards are operator-
// reviewed (status flips to APPROVED) and then auto-distributed at
// `mission.rewardScheduledAt`. There is no /claim endpoint and the
// ecosystem-wide reward distribution is on the back-end's schedule.
//
// This script remains in the skill for two reasons:
//   1. SKILL.md still routes "claim CROSS WAVE rewards" → here, so we can
//      give the user a precise, non-hand-wavy explanation of what they're
//      observing.
//   2. If wave adds a real claim path in a future release, this is where
//      it'd live.
//
// Output: a `no_op` envelope explaining the situation and pointing at
// /users/me + the per-mission `rewardScheduledAt`.

import 'dotenv/config';

const parsedIntent = { command: 'claim' };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

emit({
  ok: true,
  parsedIntent,
  result: 'no_op',
  reason: 'CROSS WAVE has no user-initiated claim endpoint as of v0.2.',
  explanation: [
    'Each mission has a `rewardScheduledAt` field — that is the date the',
    'back-end auto-distributes the reward (CROSS or game coupon) to all',
    'participants whose submission was operator-APPROVED.',
    'Run `node scripts/missions.mjs <id>` to inspect rewardScheduledAt and',
    'rewardedAt for a specific mission.',
    'Run `node scripts/whoami.mjs` after login to read your accrued total.',
  ].join(' '),
  hint: 'No on-chain or off-chain action needed; nothing for the skill to do.',
});
