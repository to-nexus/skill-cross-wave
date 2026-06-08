# CROSS WAVE Public Endpoint Notes

> **Status (2026-06-04):** The distributable skill is anonymous/read-only only. Account-private actions are intentionally blocked until CROSS WAVE exposes an official chat-safe auth flow.

## 1. Host And Headers

Base API:

```text
https://wave-client-api.crosstoken.io
```

Required header:

- `X-Domain: wave.crosstoken.io`

The scripts add this header automatically through `scripts/_api.mjs`.

## 2. Supported Public Routes

| Purpose | Method | Route | Script |
|---|---|---|---|
| Mission list | GET | `/missions` | `missions.mjs` |
| Mission detail | GET | `/missions/{id}` | `missions.mjs <id>` |
| Campaign groups | derived | `/missions` grouped by mission group | `campaigns.mjs` |
| Claim explanation | local no-op | none | `claim.mjs` |

`/missions/{id}` can include additional user-specific fields when called from the official logged-in website, but this skill treats the endpoint as public-only and does not request account credentials.

## 3. Blocked Account Routes

These actions require the user to be logged in to CROSS WAVE and are outside the AI chat skill:

- Profile lookup
- Referral lookup
- Mission submission
- Account login/session management

If a user asks for one of these actions, direct them to `https://wave.crosstoken.io` and do not request browser request headers, cookies, local storage, session files, or bearer values.

## 4. Data Shape Notes

Mission list responses are Spring-style page envelopes. The scripts normalize:

- `content[]` for list rows
- `page`, `size`, `totalElements`, `totalPages` when present
- mission group metadata for campaign grouping

`campaigns.mjs` is intentionally derived from `/missions` because the public campaign surface has historically moved more often than mission list rows.
