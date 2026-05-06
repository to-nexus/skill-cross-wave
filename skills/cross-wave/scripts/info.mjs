#!/usr/bin/env node
// info.mjs — emit CROSS WAVE service metadata + registry capture status.
//
// Outputs service info, route map, social links, the resolved API base,
// and which read-path subcommands are confirmed alive vs. behind auth.

import 'dotenv/config';
import { getService, getEndpoints, listSlots, registryVersion } from './_registry.mjs';
import { loadSession } from './_session.mjs';

const parsedIntent = { command: 'info' };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  const service = getService();
  const endpoints = getEndpoints();
  const slots = listSlots();
  const captured = slots.filter((k) => endpoints[k] !== null && endpoints[k] !== undefined && endpoints[k] !== '');
  const missing = slots.filter((k) => !captured.includes(k));

  const session = loadSession();
  const sessionStatus = session?.token
    ? {
        loggedIn: true,
        source: session._path,
        expiresAt: session.expiresAt ?? null,
      }
    : { loggedIn: false };

  emit({
    ok: true,
    parsedIntent,
    registryVersion: registryVersion(),
    service: {
      name: service.name,
      operator: service.operator,
      homepage: service.homepage,
      tagline: service.tagline,
      rewardToken: service.rewardToken,
      rewardChainId: service.rewardChainId,
    },
    routes: service.routes,
    socials: service.socials,
    apiBase: endpoints.apiBase,
    capturedSlots: captured,
    missingSlots: missing,
    captureStatus: missing.length === 0 ? 'complete' : 'partial',
    subcommands: {
      info:        { auth: false, status: 'alive' },
      missions:    { auth: false, status: 'alive' },
      campaigns:   { auth: false, status: 'alive (derived from /missions; back-end /campaigns is broken)' },
      login:       { auth: 'paste', status: 'alive (paste access_token from browser DevTools)' },
      whoami:      { auth: true,  status: 'alive' },
      referral:    { auth: true,  status: 'alive' },
      submit:      { auth: true,  status: 'alive (body shape inferred; first real call may need adjustment)' },
      claim:       { auth: false, status: 'no-op (CROSS WAVE has no user-initiated claim)' },
    },
    session: sessionStatus,
  });
}

main().catch((err) => {
  if (process.env.DEBUG) process.stderr.write(String(err?.stack || err) + '\n');
  emit({
    ok: false,
    parsedIntent,
    error: err?.code || 'unknown_error',
    message: err?.message || String(err),
  });
  process.exit(err?.exitCode ?? 1);
});
