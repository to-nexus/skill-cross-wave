---
name: cross-wave
description: This skill should be used when the user asks to drive the CROSS WAVE service (https://wave.crosstoken.io) — the "Open Streamer Economy" rewards platform run by NEXUS Co., Ltd. that pays $CROSS (and game coupons) for completing missions like uploading a Shorts/TikTok gameplay video. v0.2 is fully wired against wave-client-api.crosstoken.io — read-path (`info`, `missions`, `campaigns`) works with no auth; auth-path (`login`, `whoami`, `referral`, `submit`) works after pasting a JWT access_token captured from the user's browser DevTools (CROSS WAVE auth is CROSSx-wallet OAuth, browser-only). Triggers on phrases like "CROSS WAVE 캠페인 목록", "wave.crosstoken.io 미션", "Shorts 미션 제출", "CROSS WAVE 로그인", "내 referral 링크", "list CROSS WAVE campaigns", "submit my Shorts video to a CROSS WAVE mission", "get my CROSS WAVE referral link".
version: 0.3.0
license: MIT
---

# CROSS WAVE — Streamer-Economy Driver

A distributable skill that lets Claude drive the **CROSS WAVE** service at `https://wave.crosstoken.io` — the "Open Streamer Economy" rewards platform operated by NEXUS Co., Ltd. that pays $CROSS (and per-game coupons) for completing video missions and referrals.

> **v0.2 — what works today**
>
> - **Read-path is live, anonymous, no setup**: `info`, `missions [id] [--status]`, `campaigns [id] [--status]`. Hits `wave-client-api.crosstoken.io` directly.
> - **Auth-path is live, paste-token model**: `login`, `whoami`, `referral`, `submit`. CROSS WAVE auth is CROSSx wallet OAuth (browser-only); we don't replicate the OAuth flow — instead the user pastes the JWT they captured in DevTools.
> - **`claim` is a `no_op`** by design — CROSS WAVE has no user-initiated claim path. Operator review approves submissions, then rewards auto-distribute at each mission's `rewardScheduledAt`.

> **API host:** `https://wave-client-api.crosstoken.io` (Spring Boot back-end). Every request must carry `X-Domain: wave.crosstoken.io` (handled automatically). Auth-required calls additionally need `Authorization: Bearer <jwt>`.

> Deeper protocol details (verified endpoint table, Spring response shapes, capture provenance, OAuth-replication risks) live in `references/cross-wave.md`. Read it only when an endpoint returns an unexpected shape or when refreshing slots.

---

## 1. Activation

Activate when the user wants to:

- **Inspect** what CROSS WAVE is, what's wired, and whether they're logged in
- **List** active or ended missions (flat or grouped) and view a single mission's detail
- **List** active or ended campaigns (= mission groups) and view a single campaign with its missions
- **Authenticate** by pasting a JWT access_token captured from `wave.crosstoken.io` (verified by hitting `/users/me`)
- **Read** their own profile (`whoami`): wallet address, accrued CROSS, submitted missions
- **Submit** a Shorts/TikTok video URL to a mission — host allow-list + already-submitted guard
- **Get** their referral link and read referee count + accrued 5% commission

Trigger phrases (Korean + English, ≥ 6 each):

- KR:
  - `"CROSS WAVE 캠페인 목록"` / `"wave 캠페인 보여줘"`
  - `"CROSS WAVE 미션 목록"` / `"내가 참여 가능한 미션"`
  - `"종료된 미션 목록"` / `"미션 42 상세"`
  - `"Shorts 영상 미션에 제출"` / `"TikTok 링크로 미션 제출"`
  - `"CROSS WAVE 로그인"` / `"wave 토큰 저장"`
  - `"내 wave 프로필"` / `"내 referral 링크"`
- EN:
  - `"list CROSS WAVE campaigns"` / `"show wave.crosstoken.io campaigns"`
  - `"list missions on CROSS WAVE"` / `"show ended WAVE missions"`
  - `"submit my Shorts video to a CROSS WAVE mission"`
  - `"login to CROSS WAVE with my token"` / `"persist my wave access token"`
  - `"check my CROSS WAVE rewards"` / `"show my WAVE profile"`
  - `"get my CROSS WAVE referral link"` / `"how many people did I refer"`

The skill operates **only on the user's own wallet and the user's own WAVE account**. It does not batch-submit, scrape, or auto-share referral links.

---

## 2. Prerequisites — verify before doing anything else

```bash
node --version          # require >= 20
SKILL_DIR="$HOME/.claude/skills/cross-wave"
[ -d "$SKILL_DIR/node_modules" ] || (cd "$SKILL_DIR" && npm install --silent)
```

Read-path needs nothing else. For auth-required subcommands the user must paste a JWT (see §3).

---

## 3. Auth — guided paste-the-token (chat-only UX)

CROSS WAVE login is **CROSSx wallet OAuth** at `cross-auth.crosstoken.io`. The flow uses cross-device WebAuthn passkeys for "phone authentication", which crashes Playwright's bundled chromium on macOS (TCC SIGKILL on `IOBluetoothDevice.pairedDevices` because Chrome for Testing's Info.plist lacks `NSBluetoothAlwaysUsageDescription`). Even social-login methods can hit similar entitlement gaps. So we don't try to automate the browser — we have the user paste the token from their normal browser and the chat agent walks them through it.

### 3.1 The two-mode contract

```bash
node scripts/login.mjs                    # GUIDANCE mode: emits step-by-step instructions
node scripts/login.mjs --token <jwt>      # PASTE mode: verifies + persists the token
```

### 3.2 Chat-onboarding script (BLOCKING — follow this exactly)

When the user asks to log in to CROSS WAVE (or runs any auth-required command without a session), do this **in chat**:

1. **Run `node ~/.claude/skills/cross-wave/scripts/login.mjs`** (no args).
2. Parse the returned envelope. It will have `needsAction: "paste_access_token"` and an `instructions` array.
3. **Surface the steps to the user in chat** — render the `instructions` array as a numbered list, exactly as returned. Do not paraphrase aggressively; the steps are tuned for the platform.
4. **Wait for the user to paste a token.** When they do, validate it has the JWT shape (`xxx.yyy.zzz`).
5. **Run `node ~/.claude/skills/cross-wave/scripts/login.mjs --token <pasted-value>`**. The script will:
   - Validate the JWT format
   - Verify the token by calling `GET /users/me`
   - Persist to `~/.claude/skills/cross-wave/.sessions/wave.json` (chmod 600)
   - Return `{ok: true, address, nickname, expiresAt, ...}`
6. **Confirm to the user** with their wallet address + token expiry. **Never echo the token back.**

If step 5 returns `error: "unauthorized"`, the user copied wrong (often included the `Bearer ` prefix). Surface the hint and ask them to paste again — value AFTER `Bearer `.

If they paste something not in JWT shape, surface `bad_token_format` and remind them to copy only the JWT (3 dot-separated base64 segments).

### 3.3 Profile location

```
~/.claude/skills/cross-wave/.sessions/wave.json      # captured JWT (chmod 600)
```

To "log out": delete `.sessions/wave.json`.

### 3.4 Token expiry

JWTs expire in 1–24 hours. When they do, every auth-required call returns `{"ok":false,"error":"unauthorized"}`. Repeat the chat-onboarding script above — the user goes back to their browser, captures a fresh JWT, pastes, done.

### 3.5 Why we don't auto-launch a browser

We tried Playwright + chromium auto-launch (v0.3 attempt). Result on macOS 26.x: crash on `IOBluetoothDevice.pairedDevices` the moment the user picked phone-based 2FA, because cross-device passkey OAuth touches Bluetooth and Chrome for Testing lacks the entitlement. Falling back to social/email login risks similar TCC traps. The paste model is robust against every OAuth method and every macOS version because it never automates the browser at all.

**Never echo the token back to the user, never write it into the conversation transcript, never log it.**

---

## 4. Safety rails — apply every time

1. **Submit URL allow-list** — `submit.mjs --url <U>` aborts with `bad_url` unless `<U>`'s host is in the allow-list (default: `youtube.com`, `youtu.be`, `tiktok.com`, `vt.tiktok.com`; override via env `CROSS_WAVE_SUBMIT_HOSTS`).
2. **Submit URL HTTPS-only** — `http://` aborts with `bad_url`.
3. **Mission existence guard** — `submit.mjs` first calls `GET /missions/{id}`; aborts with `unknown_mission` on 404.
4. **Already-submitted guard** — if the mission detail returns `participationStatus != null`, abort with `already_submitted`. Same data also exposes `mission_not_active` when `status != "ACTIVE"`.
5. **No referral spamming** — `referral` only **reads** the link/stats. It does not broadcast, share, or auto-DM.
6. **No batch behavior** — every script is single-call by design (`--watch` is not implemented). The skill never iterates over missions to mass-submit.
7. **Token never echoed** — the JWT is held in process memory or in a `0600` file; SKILL.md never repeats it back to the user.
8. **`X-Domain` header** — always sent (registry-driven). The back-end 400s the request without it; the user never has to touch this.

---

## 5. Execution

All subcommands run via Bash and emit a **single JSON object on stdout**. Parse the envelope and report key fields back. Stderr stays empty unless `DEBUG=1`.

```bash
cd "$HOME/.claude/skills/cross-wave"
node scripts/<subcommand>.mjs [args]
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | runtime error (network, parse, http_5xx) |
| 2 | user error (bad_args, unauthorized, not_logged_in, unknown_mission, already_submitted, mission_not_active, bad_url, missing_token, bad_token_format, unknown_campaign) |

### NL → subcommand map

| User says (KR / EN) | Subcommand |
|---|---|
| "CROSS WAVE 정보" / "wave info" | `node scripts/info.mjs` |
| "CROSS WAVE 미션 목록" / "list active WAVE missions" | `node scripts/missions.mjs` |
| "종료된 미션" / "list ended WAVE missions" | `node scripts/missions.mjs --ended` |
| "미션 그룹 별로" / "grouped missions" | `node scripts/missions.mjs --grouped` |
| "미션 21 상세" / "mission 21 detail" | `node scripts/missions.mjs 21` |
| "캠페인 목록" / "list campaigns" | `node scripts/campaigns.mjs` |
| "종료된 캠페인" / "ended campaigns" | `node scripts/campaigns.mjs --status ENDED` |
| "캠페인 5 상세" / "show campaign 5" | `node scripts/campaigns.mjs 5` |
| "WAVE 로그인" / "log into wave" | `node scripts/login.mjs` (emits guidance — run chat-onboarding §3.2) |
| (after user pastes token in chat) | `node scripts/login.mjs --token <jwt>` |
| "내 WAVE 프로필" / "show my WAVE profile" | `node scripts/whoami.mjs` |
| "내 referral 링크" / "get my referral link" | `node scripts/referral.mjs` |
| "Shorts 링크로 미션 N 제출" / "submit <url> to mission N" | `node scripts/submit.mjs <missionId> --url <video-url>` |
| "WAVE 보상 클레임" / "claim WAVE rewards" | `node scripts/claim.mjs` (returns `no_op`) |

### Subcommand cheat-sheet

- `info` — service metadata + capture status + login status. No auth.
- `missions [<id>] [--status ACTIVE|ENDED|COMPLETED] [--grouped] [--ended] [--page N --size N]` — flat or grouped mission list / single mission detail.
- `campaigns [<id>] [--status ACTIVE|ENDED] [--page N --size N]` — derived from mission-group rows in `/missions`.
- `login` (default — guidance mode) — emits a structured envelope with step-by-step instructions for the chat agent to walk the user through capturing their JWT.
- `login --token <jwt>` — paste mode: verifies + persists.
- `whoami` — `GET /users/me` (auth required).
- `referral` — `GET /referrals/me` (auth required).
- `submit <missionId> --url <URL>` — `POST /missions/{id}/participate` (auth + URL allow-list + already-submitted guard).
- `claim` — informational `no_op` (no claim endpoint exists).

---

## 6. Reporting back

After every action, surface to the user:

- Echo `parsedIntent` so they can audit it
- For `info`: `apiBase`, `subcommands` table (auth + status), `session.loggedIn`
- For `missions`: `missionCount`, `groupCount`, the first few `{id, title, rewardType, rewardAmount, groupName, gameTitle, status}` rows
- For `missions <id>`: full detail incl. `participationMethod` (rules), `rewardType`, `rewardAmount`, `startedAt`/`endedAt`, `rewardScheduledAt`, `missionGroup`
- For `campaigns`: `count`, per-row `{id, name, missionCount, game.title, status, thumbnailImage}`
- For `campaigns <id>`: campaign meta + flat list of its missions
- For `login`: `address`, `nickname` (if returned), `expiresAt` (decoded from JWT), confirmation that token persisted. **Never the token itself.**
- For `whoami`: `address`, `nickname`, `accruedCROSS`, `submittedMissionCount`
- For `referral`: `referralLink`, `referralCode`, `refereeCount`, `accruedCROSS_5pct`
- For `submit`: `submissionId`, `videoUrl` (echoed), `status`, mission title + reward
- For `claim`: surface the `explanation` field — tell the user why nothing happens

For `unauthorized` (token expired): tell the user to re-capture from DevTools and run `login --token <…>` again. Don't proceed with stale state.

For `already_submitted` / `mission_not_active`: surface the field that tripped (`participationStatus` / `missionStatus`) and offer to look at another mission.

For `bad_url`: surface the rejected host and the allow-list. Ask for a Shorts/TikTok URL or override via `CROSS_WAVE_SUBMIT_HOSTS`.

---

## 7. Distribution

This skill folder is the unit of distribution. Recipients:

1. Copy the whole `cross-wave/` folder into `~/.claude/skills/`, OR run `install.sh` to symlink it.
2. `npm install` once (the install.sh does this).
3. Capture an access_token from `wave.crosstoken.io` DevTools per §3 and run `login.mjs --token <jwt>` (only required for auth subcommands).

Cross-link: deeper details (response shape provenance, OAuth-replication risks, list of v0.2 verified slots) live in `references/cross-wave.md`. The registry at `references/wave.json` is data, not code; re-pointing to a different host or moved path needs no script change.
