# cross-wave

A Claude Code skill that drives **CROSS WAVE** (`https://wave.crosstoken.io`) — the "Open Streamer Economy" rewards platform run by NEXUS Co., Ltd. that pays $CROSS (and per-game coupons) for completing video missions.

- **API host:** `https://wave-client-api.crosstoken.io` (Spring Boot)
- **Stack:** raw HTTPS via Node 20 fetch (no wallet signing — auth is browser-only OAuth)
- **Subcommands:** `info`, `missions`, `campaigns`, `login`, `whoami`, `referral`, `submit`, `claim`
- **Distribution:** standalone Claude skill (or bundle into the CROSS Skills Suite)

> **v0.2 — read-path live, auth-path paste-token model.**
>
> - **Read-path is alive against the live API today**: `info`, `missions [id] [--status …] [--ended] [--grouped]`, `campaigns [id] [--status …]`. No setup, no auth.
> - **Auth-path uses paste-the-token**: `login`, `whoami`, `referral`, `submit`. CROSS WAVE's auth is CROSSx wallet OAuth, browser-only. Capture an `Authorization: Bearer …` value from `wave.crosstoken.io` DevTools and paste it via `login.mjs --token <jwt>`.
> - **`claim` is a `no_op`** by design — CROSS WAVE has no user-initiated claim. Operator review approves submissions, then rewards auto-distribute at each mission's `rewardScheduledAt`.

---

## Install — Standalone

```bash
git clone <this-repo> /tmp/skill-cross-wave
bash /tmp/skill-cross-wave/install.sh
```

Or manually:
```bash
cp -r skills/cross-wave ~/.claude/skills/
cd ~/.claude/skills/cross-wave && npm install
```

---

## Activation

Activate when the user wants to:

- **Inspect** what CROSS WAVE is, what's wired, and whether they're logged in
- **List** active or ended missions (flat or grouped) and view a single mission's detail
- **List** active or ended campaigns (= mission groups) and view a single campaign with its missions
- **Authenticate** by pasting a JWT access_token captured from `wave.crosstoken.io` DevTools
- **Read** their own profile (`whoami`): wallet address, accrued CROSS, submitted missions
- **Submit** a Shorts/TikTok video URL to a mission — host allow-list + already-submitted guard
- **Get** their referral link and read referee count + 5% commission stats

Trigger phrases:
- "CROSS WAVE 미션 목록", "종료된 미션", "캠페인 5 상세"
- "WAVE 토큰 저장", "내 referral 링크", "내 wave 프로필"
- "Shorts 링크로 미션 21 제출"
- "list CROSS WAVE campaigns", "submit my Shorts video to a CROSS WAVE mission"

Direct CLI:
```bash
cd ~/.claude/skills/cross-wave

# Read-path — works today, no setup
node scripts/info.mjs
node scripts/missions.mjs --size 5
node scripts/missions.mjs --status ENDED
node scripts/missions.mjs --grouped
node scripts/missions.mjs 21
node scripts/campaigns.mjs
node scripts/campaigns.mjs 5

# Auth-path — paste your access_token first
node scripts/login.mjs --token <jwt-from-DevTools>
node scripts/whoami.mjs
node scripts/referral.mjs
node scripts/submit.mjs 21 --url https://www.youtube.com/shorts/XXXX

# No-op
node scripts/claim.mjs
```

All commands emit a single JSON object on stdout.

---

## Prerequisites

- Node ≥ 20 (`node --version`)
- Deps installed: `cd ~/.claude/skills/cross-wave && npm install` (only `dotenv`)

---

## Auth — guided paste-the-token

CROSS WAVE login is CROSSx-wallet OAuth at `cross-auth.crosstoken.io`. The flow uses cross-device WebAuthn passkeys (phone-based 2FA) which crashes Playwright-bundled chromium on macOS (`NSBluetoothAlwaysUsageDescription` missing → TCC SIGKILL). Headless OAuth automation is fragile in general, so we don't try.

Instead: the user logs in with their normal browser, captures their JWT from DevTools, pastes it. The chat agent walks them through every step.

```bash
node scripts/login.mjs                # GUIDANCE: emits step-by-step instructions
# (chat agent shows steps, user pastes JWT)
node scripts/login.mjs --token <jwt>  # PASTE: verifies via /users/me + persists (chmod 600)
```

The chat-onboarding contract lives in SKILL.md §3.2 and is the BLOCKING flow when the user asks to log in. Day-to-day re-login is the same five-step loop and takes ~30 seconds.

**Token expiry**: JWTs expire in 1–24 hours. When auth-required calls return `unauthorized`, repeat the capture.

**One-shot env**: `CROSS_WAVE_ACCESS_TOKEN=<jwt> node scripts/whoami.mjs` works without persisting.

---

## Configuration

```bash
cp skills/cross-wave/.env.example skills/cross-wave/.env
chmod 600 skills/cross-wave/.env
```

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CROSS_WAVE_ACCESS_TOKEN` | for auth-path one-shots | — | JWT pasted from DevTools; alternative to `login.mjs --token` |
| `CROSS_WAVE_API_BASE` | optional | `https://wave-client-api.crosstoken.io` | Debug override |
| `CROSS_WAVE_SUBMIT_HOSTS` | optional | `youtube.com,youtu.be,tiktok.com,vt.tiktok.com` | Comma-separated host suffix allow-list for `submit --url` |

---

## Safety rails

1. **Submit URL allow-list** — `submit.mjs --url <U>` aborts with `bad_url` unless host is in the allow-list. HTTPS-only.
2. **Mission existence guard** — `submit.mjs` calls `GET /missions/{id}` first; `unknown_mission` on 404.
3. **Already-submitted guard** — if mission detail returns `participationStatus != null`, abort with `already_submitted`. Same path catches `mission_not_active` if `status != "ACTIVE"`.
4. **No referral spamming** — `referral` only **reads** the link/stats.
5. **No batch behavior** — every script is single-call; no `--watch` looping.
6. **Token never echoed** — JWT lives in process memory or `0600` file; never repeated to the transcript.
7. **`X-Domain` header always sent** — registry-driven; back-end 400s without it.

---

## Subcommands

| Subcommand | Auth | Status |
|---|---|---|
| `info` | no | alive — service metadata + capture status + login status |
| `missions [<id>] [--status A\|E\|C] [--ended] [--grouped] [--page N --size N]` | no | alive — flat or grouped mission list / single detail |
| `campaigns [<id>] [--status ACTIVE\|ENDED] [--page N --size N]` | no | alive — derived from mission-groups in `/missions` |
| `login --token <jwt>` | paste | alive — verifies via `/users/me` and persists |
| `whoami` | yes | alive — `GET /users/me` |
| `referral` | yes | alive — `GET /referrals/me` |
| `submit <missionId> --url <URL>` | yes | alive — body shape inferred (see references/cross-wave.md §5) |
| `claim` | no | `no_op` — CROSS WAVE has no claim endpoint |

Exit codes: `0` success, `1` runtime/network error, `2` user error (`bad_args`, `unauthorized`, `not_logged_in`, `unknown_mission`, `already_submitted`, `mission_not_active`, `bad_url`, `missing_token`, `bad_token_format`, `unknown_campaign`).

---

## Layout

```
skill-cross-wave/                     # repo root
├── install.sh                        # symlink installer
├── README.md
├── LICENSE
└── skills/
    └── cross-wave/                   # the skill itself
        ├── SKILL.md
        ├── package.json
        ├── .env.example
        ├── scripts/
        │   ├── _api.mjs              # waveFetch, X-Domain header, Spring response shape
        │   ├── _registry.mjs         # loads references/wave.json
        │   ├── _session.mjs          # ~/.claude/skills/cross-wave/.sessions/wave.json + env shortcut
        │   ├── _guard.mjs            # URL allow-list guard
        │   ├── info.mjs              # service + registry + login status
        │   ├── missions.mjs          # flat/grouped mission list, detail
        │   ├── campaigns.mjs         # mission-groups view
        │   ├── login.mjs             # paste-and-persist JWT
        │   ├── whoami.mjs            # GET /users/me
        │   ├── referral.mjs          # GET /referrals/me
        │   ├── submit.mjs            # POST /missions/{id}/participate
        │   └── claim.mjs             # no_op (no claim endpoint)
        └── references/
            ├── wave.json             # endpoint registry (v0.2 captured)
            └── cross-wave.md         # endpoint reference + auth notes + provenance
```

---

## License

[MIT](LICENSE) — but read the disclaimer at the bottom of the LICENSE file before using.
