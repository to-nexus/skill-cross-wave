#!/usr/bin/env node
// info.mjs — emit CROSS WAVE service metadata + registry capture status.
//
// Outputs service info, route map, social links, the resolved API base,
// and which read-path subcommands are confirmed alive vs. behind auth.

import 'dotenv/config';
import { getService, getEndpoints, listSlots, registryVersion } from './_registry.mjs';

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

  const sessionStatus = {
    loggedIn: false,
    accountActions: 'blocked_until_chat_safe_auth_exists',
  };

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
      login:       { auth: true,  status: 'blocked (auth_out_of_scope)' },
      whoami:      { auth: true,  status: 'blocked (auth_out_of_scope)' },
      referral:    { auth: true,  status: 'blocked (auth_out_of_scope)' },
      submit:      { auth: true,  status: 'blocked (auth_out_of_scope)' },
      claim:       { auth: false, status: 'no-op (CROSS WAVE has no user-initiated claim)' },
    },
    session: sessionStatus,
  });
}

main().catch((err) => {
  if (process.env.DEBUG) process.stderr.write(String(err?.message || err) + '\n');
  emit({
    ok: false,
    parsedIntent,
    error: err?.code || 'unknown_error',
    message: err?.message || String(err),
  });
  process.exit(err?.exitCode ?? 1);
});
