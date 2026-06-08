#!/usr/bin/env node
// missions.mjs — list / detail CROSS WAVE missions.
//
// The back-end groups missions by mission-group; the list response is:
//   { content: [ { id, name, missions: [ {id, title, ...}, ... ], game, ... }, ... ],
//     pageable, ..., numberOfElements, empty }
//
// We FLATTEN by default — each row is a single mission with its parent
// group's `name` attached as `groupName`. Pass `--grouped` to get the
// raw mission-group tree.
//
// Usage:
//   node scripts/missions.mjs                       # list active (default)
//   node scripts/missions.mjs --status ENDED        # filter ACTIVE | ENDED | COMPLETED
//   node scripts/missions.mjs --grouped             # raw group tree
//   node scripts/missions.mjs --size 50 --page 0    # pagination
//   node scripts/missions.mjs <id>                  # detail one mission

import 'dotenv/config';
import { waveFetch } from './_api.mjs';
import { loadSession } from './_session.mjs';

function parseArgs(argv) {
  const out = { id: null, status: 'ACTIVE', grouped: false, size: 20, page: 0, ended: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--status') out.status = String(argv[++i] ?? '').toUpperCase();
    else if (a.startsWith('--status=')) out.status = a.slice('--status='.length).toUpperCase();
    else if (a === '--grouped') out.grouped = true;
    else if (a === '--ended') out.ended = true;
    else if (a === '--size') out.size = Number(argv[++i] ?? '20');
    else if (a === '--page') out.page = Number(argv[++i] ?? '0');
    else if (!a.startsWith('--')) out.id = out.id ?? a;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = {
  command: 'missions',
  id: args.id,
  status: args.id ? null : args.status,
  grouped: args.grouped,
  page: args.page,
  size: args.size,
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

function flattenGroups(groups) {
  const flat = [];
  for (const g of groups || []) {
    const groupMeta = {
      groupId: g.id,
      groupName: g.name,
      gameTitle: g?.game?.title ?? null,
    };
    for (const m of g.missions || []) {
      flat.push({
        id: m.id,
        title: m.title,
        rewardType: m.rewardType,
        rewardAmount: m.rewardAmount,
        minimumViewCount: m.minimumViewCount,
        maxParticipants: m.maxParticipants,
        approvedCount: m.approvedCount,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        rewardScheduledAt: m.rewardScheduledAt,
        status: m.status,
        participationStatus: m.participationStatus,
        gameCouponName: m.gameCouponName,
        ...groupMeta,
      });
    }
  }
  return flat;
}

async function main() {
  // If user has a session, send it — back-end may decorate rows with
  // user-specific `participationStatus`. Read-path otherwise works anonymously.
  const session = loadSession();
  const sessionToken = session?.token ?? null;

  if (args.id) {
    const m = await waveFetch('missionDetailPath', {
      method: 'GET',
      pathParams: { id: args.id },
      sessionToken,
    });
    emit({
      ok: true,
      parsedIntent,
      mission: m,
    });
    return;
  }

  const slot = args.ended ? 'missionsEndedPath' : 'missionsPath';
  const data = await waveFetch(slot, {
    method: 'GET',
    query: args.ended
      ? { page: args.page, size: args.size }
      : { status: args.status, page: args.page, size: args.size },
    sessionToken,
  });

  const groups = data?.content ?? [];
  if (args.grouped) {
    emit({
      ok: true,
      parsedIntent,
      pagination: {
        page: data?.number ?? 0,
        size: data?.size ?? args.size,
        first: data?.first ?? null,
        last: data?.last ?? null,
        numberOfElements: data?.numberOfElements ?? groups.length,
      },
      groupCount: groups.length,
      groups,
    });
    return;
  }

  const flat = flattenGroups(groups);
  emit({
    ok: true,
    parsedIntent,
    pagination: {
      page: data?.number ?? 0,
      size: data?.size ?? args.size,
      first: data?.first ?? null,
      last: data?.last ?? null,
      numberOfElements: data?.numberOfElements ?? groups.length,
    },
    groupCount: groups.length,
    missionCount: flat.length,
    missions: flat,
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
    bodyJson: err?.bodyJson ?? null,
  });
  process.exit(err?.exitCode ?? 1);
});
