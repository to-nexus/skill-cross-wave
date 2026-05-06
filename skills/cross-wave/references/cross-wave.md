# cross-wave — v0.2 endpoint reference

> **Status (2026-05-04):** Read-path slots populated via JS-bundle reverse-engineering (https://wave.crosstoken.io Next.js chunks) + anonymous probing of `wave-client-api.crosstoken.io`. Auth-path slots verified at the 401 boundary. The v0.1 skeleton's SIWE login plan was **abandoned** because CROSS WAVE auth is CROSSx-wallet OAuth (browser-only).

---

## 1. API host

```
https://wave-client-api.crosstoken.io
```

Spring Boot back-end, AWS ELB-fronted. Every request must carry:

- `X-Domain: <any>` — the server 400s with `{"message": "Missing X-Domain Header"}` without it. The skill registers `wave.crosstoken.io` as the value.
- `Origin: https://wave.crosstoken.io` — implicit from CORS but accepted on direct curl.

Auth-required endpoints additionally need:

- `Authorization: Bearer <jwt>` — JWT from CROSSx wallet OAuth (browser-only; see §3 for capture).

---

## 2. Endpoint inventory (v0.2)

| Path | Method | Auth | Scripted by | Notes |
|---|---|---|---|---|
| `/missions` | GET | no | `missions.mjs`, `campaigns.mjs` | Spring paginated. Query: `status=ACTIVE\|ENDED\|COMPLETED`, `page`, `size`. Response: groups (each w/ embedded missions). |
| `/missions/ended` | GET | no | `missions.mjs --ended`, `campaigns.mjs --status ENDED` | Same shape; convenience filter. |
| `/missions/{id}` | GET | no (decorated when authed) | `missions.mjs <id>`, `submit.mjs` | When called with a session, includes `participationStatus`. |
| `/games` | GET | no | (not surfaced as a subcommand yet) | Catalog of supported games. |
| `/faqs` | GET | no | (not surfaced yet) | Paginated FAQ entries. |
| `/users/me` | GET | yes | `whoami.mjs`, `login.mjs` | Returns the logged-in user's profile. Used by login.mjs as the token verifier. |
| `/referrals/me` | GET | yes | `referral.mjs` | Referral link + stats. |
| `/missions/{id}/participate` | POST | yes | `submit.mjs` | Submit a mission. Body: `{videoUrl}` (inferred — see §4 if it 400s). |

**Endpoints we explicitly do NOT use:**

- `/campaigns` — returns 500 on the live back-end. The "campaign" UI concept is a mission-group; we derive it from `/missions` instead.
- `/api/auth-login`, `/api/auth-refresh` (Next.js front-end proxies) — they 405 without a wallet-signed body that we cannot mint outside a browser.
- `cross-auth.crosstoken.io/cross-auth/social/{login,refresh}` — CORS-locked + needs a CROSSx wallet OAuth dance.

---

## 3. Auth — capturing a JWT

CROSS WAVE login is CROSSx wallet OAuth via `cross-auth.crosstoken.io`. Programmatic replication would require a full headless browser + maintaining the OAuth client config; out of scope for v0.2.

### Capture procedure

1. Log in to `https://wave.crosstoken.io` with your CROSSx wallet.
2. Open DevTools → **Network** tab.
3. Click any request to `wave-client-api.crosstoken.io` (e.g. `/users/me` fires automatically on page load).
4. **Headers** → **Request Headers** → copy the value after `Authorization: Bearer `.
5. (Alternative path: DevTools → **Application** → Cookies / Local Storage; look for keys `accessToken` / `access_token`.)

The token is a standard JWT (3 dot-separated base64url segments). Its `exp` claim governs expiry (typically 1–24 hours).

### Persist

```bash
node scripts/login.mjs --token <jwt>
```

This:
1. Validates the JWT format (3-part shape).
2. Hits `GET /users/me` with `Authorization: Bearer <jwt>` + `X-Domain` to confirm the token is valid.
3. Decodes `exp` and writes the file at `~/.claude/skills/cross-wave/.sessions/wave.json` mode `0600`.

When the JWT expires, every auth-required call returns `{"ok":false, "error":"unauthorized"}`. Re-capture and re-paste.

### Refresh

CROSS WAVE supports a refresh path (`/api/auth-refresh` on the Next.js front, proxying to cross-auth). v0.2 doesn't implement it because the refresh cookie is `HttpOnly` and bound to the browser session — same blocker as login. The user simply re-pastes a fresh access_token when needed.

---

## 4. Spring response shapes

### List endpoints

```jsonc
{
  "content": [
    // mission-group row
    {
      "id": 5,
      "name": "Prove Your Level (Seal M)",
      "description": "",
      "displayOrder": 10000,
      "status": "ACTIVE",
      "image": { "url": "https://contents.crosstoken.io/mission-groups/...jpg", ... },
      "thumbnailImage": { "url": "...", ... },
      "game": { "id": 9, "title": "Seal M on CROSS", ... },
      "missionCount": 1,
      "missions": [
        {
          "id": 21,
          "title": "Upload Lv.30+ Gameplay Video",
          "participationMethod": "...rules markdown...",
          "rewardType": "GAME_COUPON" | "CROSS",
          "rewardAmount": 1.0 | 250.0,
          "minimumViewCount": 5,
          "maxParticipants": 100,
          "approvedCount": 97,
          "startedAt": "2026-03-26T09:00:00Z",
          "endedAt": "2026-05-25T00:00:00Z",
          "rewardScheduledAt": "2026-06-02T00:00:00Z",
          "kycExpiredAt": "2026-05-25T01:00:00Z",
          "rewardedAt": null | "2026-04-28T...",
          "status": "ACTIVE",
          "participationStatus": null | "SUBMITTED" | "APPROVED" | "REJECTED",
          "gameCouponId": 1, "gameCouponName": "Pet Pickup Summon Ticket (×5)"
        }
      ]
    }
  ],
  "pageable": { "pageNumber": 0, "pageSize": 20, ... },
  "first": true, "last": true,
  "size": 20, "number": 0,
  "numberOfElements": 5,
  "empty": false
}
```

### Error envelope

```json
{"timestamp":"2026-05-04T...","status":401,"error":"UNAUTHORIZED","code":"COMMON_002","message":"Unauthorized"}
```

The skill maps `status:401` → `error:"unauthorized"` and adds a hint to re-run `login.mjs`.

### Mission detail

`/missions/{id}` returns the mission object directly (not wrapped in `content`). When called with a session token, it includes `participationStatus` (and may include user-specific submission metadata).

---

## 5. Submit body shape — inferred

`POST /missions/{id}/participate` is confirmed at the 401 boundary but we have not observed a successful body. Based on the front-end button label ("Upload & Claim") + the mission's `participationMethod` text, the most likely shape is:

```json
{ "videoUrl": "https://www.youtube.com/shorts/abc" }
```

If the back-end 400s with a field-validation error, **DO NOT** retry with random shapes. Instead:

1. Capture the live request from DevTools when you submit a real mission in the browser.
2. Compare the body to what `submit.mjs` sends.
3. Adjust the body construction in `scripts/submit.mjs#main()` (search for `body: { videoUrl: args.url }`).

The script's safety rails (`bad_url`, `unknown_mission`, `already_submitted`, `mission_not_active`) will protect you from ever re-submitting the same mission while debugging.

---

## 6. Reward distribution — why `claim` is a no-op

CROSS WAVE has no `/claim` endpoint. The reward lifecycle is:

1. User submits a mission (`POST /missions/{id}/participate`).
2. Mission `participationStatus` flips to `SUBMITTED`.
3. Operator reviews → flips to `APPROVED` or `REJECTED`.
4. At each mission's `rewardScheduledAt` timestamp, the back-end auto-distributes the reward (CROSS to the wallet, or game coupon to the in-game inventory).
5. `mission.rewardedAt` flips from `null` to the distribution timestamp.

There is nothing for the user (or the skill) to do between steps 4 and 5. `claim.mjs` returns a `no_op` envelope explaining this.

---

## 7. Provenance — how this reference was assembled

| What | How |
|---|---|
| API host (`wave-client-api.crosstoken.io`) | Found in JS chunk `4a51956bd20896ab.js` (`https://wave-client-api.crosstoken.io`) |
| OAuth provider (`cross-auth.crosstoken.io`) | Found in JS chunk `b33f4af3019047d4.js` (`/api/auth-login` proxy route) and `da91714b63fb7c60.js` (`${t}/cross-auth/social/login`) |
| `X-Domain` requirement | Discovered by curling `/users/me` with `Authorization: Bearer fake` and getting `{"message":"Missing X-Domain Header"}` 400 |
| `/missions`, `/missions/{id}`, `/games`, `/faqs` | Anonymous probe — all returned 200 |
| `/users/me`, `/referrals/me`, `/missions/{id}/participate` | Anonymous probe — all returned 401 with the canonical Spring error envelope |
| `/campaigns` | Anonymous probe — returned 500. Treating as broken / unused. |
| Spring response shape | Direct inspection of `/missions?size=5` and `/missions/ended?size=1` payloads |
| Reward distribution model | Inferred from per-mission fields: `rewardScheduledAt`, `rewardedAt`, `kycExpiredAt`, `participationStatus`, `approvedCount` — no claim endpoint exists in the JS bundle |

To reproduce: see `/tmp/wave-chunks/*` (delete after debugging — they're large) and the curl probes in the bash history of the skill build session.

---

## 8. Future work

- v0.3: capture the `submit` body shape from a live browser submission and remove the "inferred" caveat in §5.
- v0.3: surface `/games` and `/faqs` as subcommands if there's user demand.
- v0.4 (speculative): if the OAuth flow ever exposes a non-`HttpOnly` refresh path, implement programmatic refresh so the user doesn't have to re-paste daily.
