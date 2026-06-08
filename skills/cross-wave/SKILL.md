---
name: cross-wave
description: This skill should be used when the user asks to inspect public CROSS WAVE data at https://wave.crosstoken.io — list active or ended missions, list campaign groups, inspect mission details, and explain the no-op reward claim model. The distributable skill is anonymous/read-only only; account actions such as profile, referral, and submission are intentionally blocked until CROSS WAVE exposes a chat-safe auth flow. Triggers on phrases like "CROSS WAVE 캠페인 목록", "wave.crosstoken.io 미션", "Shorts 미션 확인", "list CROSS WAVE campaigns", "show WAVE missions", "CROSS WAVE rewards".
version: 0.3.1
license: MIT
---

# CROSS WAVE — Public Mission Reader

A distributable skill that lets Claude inspect the public **CROSS WAVE** service at `https://wave.crosstoken.io`.

> **v0.3.1 security posture:** anonymous read-path only. `info`, `missions`, `campaigns`, and `claim` are supported. Account actions (`login`, `whoami`, `referral`, `submit`) are intentionally blocked in the skill because the current CROSS WAVE account flow is browser-only and does not expose a chat-safe auth path.

> **API host:** `https://wave-client-api.crosstoken.io`. Every request carries `X-Domain: wave.crosstoken.io` automatically.

---

## 1. Activation

Activate when the user wants to:

- Inspect what CROSS WAVE is and which public endpoints are wired
- List active or ended missions and view a single mission's detail
- List active or ended campaign groups and view a campaign with its missions
- Understand why there is no user-initiated WAVE claim action

Do **not** activate this skill for account mutation or account-private data. If the user asks to submit a video, view their profile, get a referral link, or manage account login, tell them that those actions must be completed directly on the CROSS WAVE website until an official chat-safe auth path exists.

Trigger phrases:

- KR: `"CROSS WAVE 캠페인 목록"`, `"wave 캠페인 보여줘"`, `"CROSS WAVE 미션 목록"`, `"내가 참여 가능한 미션"`, `"종료된 미션 목록"`, `"미션 42 상세"`, `"WAVE 보상 클레임"`
- EN: `"list CROSS WAVE campaigns"`, `"show wave.crosstoken.io campaigns"`, `"list missions on CROSS WAVE"`, `"show ended WAVE missions"`, `"mission 42 detail"`, `"claim WAVE rewards"`

---

## 2. Prerequisites

```bash
node --version          # require >= 20
SKILL_DIR="$HOME/.claude/skills/cross-wave"
[ -d "$SKILL_DIR/node_modules" ] || (cd "$SKILL_DIR" && npm install --silent)
```

Read-path needs no account setup.

---

## 3. Account Actions

The following subcommands are blocked in the distributable skill:

- `login`
- `whoami`
- `referral`
- `submit`

When one is requested, run the relevant script only if you need its structured `auth_out_of_scope` envelope, then tell the user to complete the action directly at `https://wave.crosstoken.io`. Do not ask the user to capture browser request headers, session files, cookies, or bearer values.

---

## 4. Safety Rails

1. **Anonymous by default** — supported commands do not require account credentials.
2. **No web-login state reuse** — the skill does not load browser storage, cookies, or saved sessions.
3. **No credential paste flow** — the skill does not request access tokens or other browser-derived auth material from the user.
4. **No batch behavior** — every script is single-call by design.
5. **Reward action is informational** — the reward script returns `no_op`; CROSS WAVE rewards are distributed after operator review.

---

## 5. Execution

All subcommands run via Bash and emit a single JSON object on stdout.

```bash
cd "$HOME/.claude/skills/cross-wave"
node scripts/<subcommand>.mjs [args]
```

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | runtime error |
| 2 | user/action error such as `unknown_mission`, `mission_not_active`, or `auth_out_of_scope` |

### NL To Subcommand Map

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
| "WAVE 보상 클레임" / "claim WAVE rewards" | `node scripts/claim.mjs` |
| "로그인 / 프로필 / referral / 제출" | blocked; direct the user to the website |

### Subcommand Cheat Sheet

- `info` — service metadata + public route map.
- `missions [<id>] [--status ACTIVE|ENDED|COMPLETED] [--grouped] [--ended] [--page N --size N]` — mission list or detail.
- `campaigns [<id>] [--status ACTIVE|ENDED] [--page N --size N]` — derived from mission-group rows in `/missions`.
- `claim` — informational `no_op`.
- `login`, `whoami`, `referral`, `submit` — return `auth_out_of_scope`.

---

## 6. Reporting Back

After every supported action, surface:

- `parsedIntent`
- For `info`: `apiBase`, `subcommands`, and account-action block status
- For `missions`: `missionCount`, `groupCount`, and representative `{id, title, rewardType, rewardAmount, groupName, gameTitle, status}` rows
- For `missions <id>`: mission detail including participation rules, reward, dates, and mission group
- For `campaigns`: `count` and campaign summary rows
- For `campaigns <id>`: campaign metadata and the mission list
- For `claim`: the `explanation` field

For blocked account actions, be direct: "이 작업은 현재 AI 채팅 스킬 범위 밖입니다. CROSS WAVE 웹사이트에서 직접 진행해야 합니다."

---

## 7. Distribution

This skill folder is the unit of distribution. Recipients:

1. Copy the whole `cross-wave/` folder into `~/.claude/skills/`, OR run `install.sh` to symlink it.
2. `npm install` once.
3. Use anonymous read commands. Do not add browser-derived auth files to the package.

Cross-link: deeper public endpoint details live in `references/cross-wave.md`.
