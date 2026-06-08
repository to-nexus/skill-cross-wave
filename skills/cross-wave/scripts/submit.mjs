#!/usr/bin/env node
// submit.mjs — blocked account-private CROSS WAVE submission path.
//
// Endpoint would be POST /missions/{id}/participate, but the distributable
// skill does not execute account-private WAVE actions until a chat-safe auth
// path exists.
//
// Safety rails (enforced regardless of capture state):
//   1. URL allow-list   — host must be youtube.com / youtu.be / tiktok.com /
//      vt.tiktok.com (or env CROSS_WAVE_SUBMIT_HOSTS). HTTPS only.
//   2. Mission existence — fetch /missions/{id}, abort if 404.
//   3. Once-per-account guard — if mission detail returns
//      participationStatus != null, abort with `already_submitted`.
//
// Usage:
//   node scripts/submit.mjs <missionId> --url <https://...>

import 'dotenv/config';
import { waveFetch } from './_api.mjs';
import { requireSession } from './_session.mjs';
import { assertVideoUrl } from './_guard.mjs';

function parseArgs(argv) {
  const out = { missionId: null, url: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = String(argv[++i] ?? '');
    else if (a.startsWith('--url=')) out.url = a.slice('--url='.length);
    else if (!a.startsWith('--')) out.missionId = out.missionId ?? a;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = {
  command: 'submit',
  missionId: args.missionId,
  url: args.url,
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  if (!args.missionId) {
    const err = new Error('usage: submit.mjs <missionId> --url <https://...>');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }
  if (!args.url) {
    const err = new Error('usage: submit.mjs <missionId> --url <https://...>');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }

  // Rail 1: URL allow-list + HTTPS.
  const parsedUrl = assertVideoUrl(args.url);
  parsedIntent.host = parsedUrl.hostname;

  const session = requireSession();

  // Rail 2 + 3: mission existence + already-submitted guard. Mission detail
  // returns participationStatus per-user when called with a session token.
  let detail;
  try {
    detail = await waveFetch('missionDetailPath', {
      method: 'GET',
      pathParams: { id: args.missionId },
      sessionToken: session.token,
    });
  } catch (err) {
    if (err.status === 404) {
      const e = new Error(`unknown_mission: ${args.missionId} not found`);
      e.code = 'unknown_mission';
      e.exitCode = 2;
      throw e;
    }
    throw err;
  }
  parsedIntent.missionTitle = detail?.title ?? null;
  parsedIntent.rewardType = detail?.rewardType ?? null;
  parsedIntent.rewardAmount = detail?.rewardAmount ?? null;

  if (detail?.participationStatus) {
    const err = new Error(`already_submitted: missionId ${args.missionId} has participationStatus=${detail.participationStatus}`);
    err.code = 'already_submitted';
    err.exitCode = 2;
    err.participationStatus = detail.participationStatus;
    throw err;
  }
  if (detail?.status && detail.status !== 'ACTIVE') {
    const err = new Error(`mission_not_active: status=${detail.status}`);
    err.code = 'mission_not_active';
    err.exitCode = 2;
    err.missionStatus = detail.status;
    throw err;
  }

  // Submit.
  const resp = await waveFetch('participatePath', {
    method: 'POST',
    pathParams: { id: args.missionId },
    body: { videoUrl: args.url },
    sessionToken: session.token,
  });

  emit({
    ok: true,
    parsedIntent,
    submissionId: resp?.id ?? resp?.submissionId ?? null,
    videoUrl: args.url,
    status: resp?.status ?? resp?.participationStatus ?? 'submitted',
    raw: resp,
  });
}

main().catch((err) => {
  if (process.env.DEBUG) process.stderr.write(String(err?.message || err) + '\n');
  emit({
    ok: false,
    parsedIntent,
    error: err?.code || 'unknown_error',
    message: err?.message || String(err),
    hint: err?.hint ?? null,
    rejected: err?.rejected ?? null,
    allowList: err?.allowList ?? null,
    participationStatus: err?.participationStatus ?? null,
    missionStatus: err?.missionStatus ?? null,
    bodyJson: err?.bodyJson ?? null,
  });
  process.exit(err?.exitCode ?? 1);
});
