// _registry.mjs — load the wave back-end adapter from references/wave.json.
//
// Endpoint slots discovered via JS-bundle reverse-engineering + anonymous
// probing of wave-client-api.crosstoken.io. The full set is captured in
// the registry; auth-required calls additionally need a token (see _session.mjs).

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '..', 'references', 'wave.json');

let _cache = null;

export function loadRegistry() {
  if (_cache !== null) return _cache;
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const json = JSON.parse(raw);
  if (!json || typeof json !== 'object' || !json.endpoints) {
    const err = new Error('references/wave.json missing top-level "endpoints" key');
    err.code = 'bad_registry';
    throw err;
  }
  _cache = json;
  return _cache;
}

export function getService() {
  const reg = loadRegistry();
  return reg.service ?? {};
}

export function getEndpoints() {
  const reg = loadRegistry();
  return reg.endpoints ?? {};
}

export function requireSlot(key) {
  const ep = getEndpoints();
  const v = ep[key];
  if (v === null || v === undefined || v === '') {
    const err = new Error(
      `registry slot "endpoints.${key}" not present — expected for v0.2`
    );
    err.code = 'unknown_slot';
    err.missing = key;
    err.exitCode = 1;
    throw err;
  }
  return v;
}

export function listSlots() {
  return [
    'apiBase',
    'missionsPath',
    'missionsEndedPath',
    'missionDetailPath',
    'gamesPath',
    'faqsPath',
    'whoamiPath',
    'referralPath',
    'participatePath',
    'sessionHeader',
    'extraHeaders',
  ];
}

export function registryVersion() {
  const reg = loadRegistry();
  return reg.version ?? null;
}
