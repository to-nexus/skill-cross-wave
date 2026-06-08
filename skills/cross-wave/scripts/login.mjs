#!/usr/bin/env node
// login.mjs — account auth is intentionally disabled in the distributable skill.

const parsedIntent = { command: 'login', mode: 'blocked' };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

emit({
  ok: false,
  parsedIntent,
  error: 'auth_out_of_scope',
  message: 'CROSS WAVE account login is outside this AI chat skill until an official chat-safe auth flow exists.',
  userAction: 'Open https://wave.crosstoken.io directly for login, profile, referral, and mission submission actions.',
  supportedHere: ['info', 'missions', 'campaigns', 'claim'],
});

process.exit(2);
