# WeHum CMS (React · TypeScript · Vite · Tailwind)

## Versions

The CMS has no store release of its own. Its tags follow the app: `v<name>+<build>` marks the last CMS commit made on or before that app release day, and says which CMS the app build was used with. If the CMS needs data from an older build, check out that tag. `package.json` stays `0.1.0`; the tags are the version.

### Unreleased (after 1.0.2+5)
- Nothing yet.

### 1.0.2+5 (29 Oct 2026) · tag `v1.0.2+5`
- Online now: green/grey dots on Users, an Online now tab, a live world map on the Dashboard.
- Dashboard: "Silence Room right now" card, live by country from `dashboard:kpis`.
- Local time previews and Global meditation time field fit narrow cards.

### 1.0.1+4 (27 Oct 2026) · tag `v1.0.1+4`
- Group meditation settings: every N hours, plus the weekly Global meditation; once-a-day start time shown only in that mode.
- Dedications can be posted by `sessionId` and written at any time.
- Today screen warns when today or the next two days have no Meditation of the Day or a missing length; push "Opens" list has Meditation of the Day.

### 1.0.1+3 (15 Oct 2026) · tag `v1.0.1+3`
- Stitch CMS: feature flags, App content (sit times, silence, downloads, crisis directory), group cadence and intentions, transcripts, branding and notification-limit settings, delivery report, scheduled daily messages, usernames.
- Newsletter settings, YouTube description and link warnings in the session editor, bio in user detail, password show/hide.
- CD: builds and publishes to the demo server after CI is green.

### 1.0.0+2 (9 Oct 2026) · tag `v1.0.0+2`
- Phases P0 to P9: foundation, UI kit, auth with two-step sign-in, content (themes, teachers, sessions, programs, challenges, uploads), daily experience, live Dashboard, Subscriptions and Users, moderation and push, analytics and settings, "coming soon" screens.
- Settings: latest app version and store links for the update prompt.

The admin panel for WeHum. The full specification is `WeHum_CMS_Spec.md`: read §0 and §0.1 first, then build phase by phase (§15). Every screen has a screenshot in `design/screens/` and its exact source in `design/source/`. `starter/` is the original starter code, kept for reference.

> **Oct 12 — Stitch redesign.** New CMS controls are listed in `WeHum_CMS_Spec.md` §9b; the screen-by-screen app map is `../stitch-export/SCREEN_MAP.md`. `design/screens/` holds the original 19 screens plus `S*` screens rendered from the new pages.

## Run it

Needs Node 22+ and pnpm 9 (`npm i -g pnpm@9`, or put `npx pnpm@9` in front of each command).

```bash
cp .env.example .env      # point VITE_API_URL at the backend (default http://localhost:3000)
pnpm install
pnpm dev                  # http://localhost:5173
VITE_MOCKS=1 pnpm dev     # same, against the built-in mock API (no backend needed)
```

**Signing in**

- With the real backend: use the owner account from the backend's `.env` (`SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`). The first sign-in asks you to set up two-step sign-in with an authenticator app.
- With the mock API (`VITE_MOCKS=1`): `owner@wehum.app`, `admin@wehum.app`, `editor@wehum.app` or `moderator@wehum.app`, password `correct-horse-battery`, code `123456`. `new@wehum.app` walks through the two-step setup.

The component gallery is at `/kit` after signing in (not in a production build, `VITE_ENV=prod`).

## Commands

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm format` | ESLint (no warnings allowed) / Prettier |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm test` | Unit and component tests (Vitest + Testing Library + MSW) |
| `pnpm build` then `pnpm size` | Production build, then the 250 KB gzip budget for the initial load |
| `pnpm e2e` | Playwright against the production build. Run `pnpm build` first. `PW_CHANNEL=chrome` uses the installed Chrome. |
| `pnpm e2e:backend` | Playwright against the **real backend** (sign-in, two-step codes, roles, lockout, token refresh, reset, invite). See below. |
| `pnpm stories` | Ladle: every UI primitive as a story, with a theme switch. `pnpm stories:build` builds it. |
| `pnpm api:sync` | Copies `openapi.yaml` and `socket-events.ts` from `../backend` |
| `pnpm api:types` | Regenerates `src/lib/api-types.ts` from `openapi/openapi.yaml`. Never edit that file by hand. |

## Tests against the real backend

`pnpm e2e:backend` starts the backend itself and stops it at the end. It needs:

- the backend repo next to this one (`../backend`, with `npm install` done), or `E2E_BACKEND_DIR`;
- Postgres and Redis from the backend's `docker compose up -d`;
- port 3000 free, and a build made with `VITE_API_URL=http://localhost:3000 pnpm build`.

It creates its own database `wehum_e2e` (dropped and recreated on every run) and uses Redis DB 14, so development data is not touched. If your ports differ from the compose defaults, set `E2E_DATABASE_URL` and `E2E_REDIS_URL`, for example:

```bash
E2E_DATABASE_URL=postgresql://wehum:wehum@localhost:5433/wehum_e2e E2E_REDIS_URL=redis://localhost:6380/14 pnpm e2e:backend
```

The run takes about two minutes: one test waits for a real access token to expire. The backend log, including the "emails" with reset and invite links, is in `test-results/backend.log`.

## Backend contract

`openapi/openapi.yaml` and `src/lib/socket-events.ts` are copies from the backend repo. When the backend changes them, run `pnpm api:sync && pnpm api:types` and commit the result. CI fails if the generated types do not match the committed contract.

## Secrets

Never commit `.env` files. `VITE_*` values are public (they end up in the browser bundle), so no secret may go in them.
