#!/usr/bin/env node
// campaigns.mjs — list / detail CROSS WAVE *campaigns*.
//
// The back-end's /campaigns endpoint returns 500 — campaigns as a top-level
// concept don't exist. The front-end UI renders "campaigns" as the
// mission-groups surfaced in the /missions response (one card per group,
// with a count + game thumbnail). So we derive campaigns by:
//   - hitting /missions?status=… or /missions/ended
//   - dropping the per-mission detail
//   - returning the group rows
//
// Usage:
//   node scripts/campaigns.mjs                       # active campaigns (default)
//   node scripts/campaigns.mjs --status ENDED        # ACTIVE | ENDED
//   node scripts/campaigns.mjs <id>                  # one campaign with its missions

import 'dotenv/config';
import { waveFetch } from './_api.mjs';
import { loadSession } from './_session.mjs';

function parseArgs(argv) {
  const out = { id: null, status: 'ACTIVE', size: 20, page: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--status') out.status = String(argv[++i] ?? '').toUpperCase();
    else if (a.startsWith('--status=')) out.status = a.slice('--status='.length).toUpperCase();
    else if (a === '--size') out.size = Number(argv[++i] ?? '20');
    else if (a === '--page') out.page = Number(argv[++i] ?? '0');
    else if (!a.startsWith('--')) out.id = out.id ?? a;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = {
  command: 'campaigns',
  id: args.id,
  status: args.status,
  page: args.page,
  size: args.size,
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

function projectGroup(g) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    status: g.status,
    displayOrder: g.displayOrder,
    missionCount: g.missionCount ?? (g.missions?.length ?? 0),
    game: g.game ? { id: g.game.id, title: g.game.title } : null,
    image: g?.image?.url ?? null,
    thumbnailImage: g?.thumbnailImage?.url ?? null,
  };
}

async function main() {
  const session = loadSession();
  const sessionToken = session?.token ?? null;

  // Detail: fetch /missions and find the group with this id.
  if (args.id) {
    // Pull active + ended in parallel and merge — back-end has no
    // /mission-groups/{id}, so we filter from the same list endpoints.
    const [active, ended] = await Promise.all([
      waveFetch('missionsPath', { method: 'GET', query: { status: 'ACTIVE', size: 100 }, sessionToken }),
      waveFetch('missionsEndedPath', { method: 'GET', query: { size: 100 }, sessionToken }),
    ]);
    const all = [...(active?.content ?? []), ...(ended?.content ?? [])];
    const found = all.find((g) => String(g.id) === String(args.id));
    if (!found) {
      const err = new Error(`unknown_campaign: ${args.id} not in active+ended mission groups`);
      err.code = 'unknown_campaign';
      err.exitCode = 2;
      throw err;
    }
    emit({
      ok: true,
      parsedIntent,
      campaign: {
        ...projectGroup(found),
        missions: (found.missions || []).map((m) => ({
          id: m.id,
          title: m.title,
          rewardType: m.rewardType,
          rewardAmount: m.rewardAmount,
          status: m.status,
          startedAt: m.startedAt,
          endedAt: m.endedAt,
          maxParticipants: m.maxParticipants,
          approvedCount: m.approvedCount,
        })),
      },
    });
    return;
  }

  if (!['ACTIVE', 'ENDED'].includes(args.status)) {
    const err = new Error(`bad_args: --status must be ACTIVE or ENDED`);
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }

  const slot = args.status === 'ENDED' ? 'missionsEndedPath' : 'missionsPath';
  const data = await waveFetch(slot, {
    method: 'GET',
    query: args.status === 'ENDED'
      ? { page: args.page, size: args.size }
      : { status: 'ACTIVE', page: args.page, size: args.size },
    sessionToken,
  });

  const groups = (data?.content ?? []).map(projectGroup);
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
    count: groups.length,
    campaigns: groups,
    note: 'Derived from mission-groups in /missions response (the back-end has no /campaigns endpoint).',
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
