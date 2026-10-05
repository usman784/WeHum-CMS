# WeHum CMS (React · TypeScript · Vite · Tailwind)

The admin panel for WeHum. The full specification is `WeHum_CMS_Spec.md`: read §0 and §0.1 first, then build phase by phase (§15). Every screen has a screenshot in `design/screens/` and its exact source in `design/source/`. `starter/` is the original starter code, kept for reference.

## Run it

Needs Node 22+ and pnpm 9 (`npm i -g pnpm@9`, or put `npx pnpm@9` in front of each command).

```bash
cp .env.example .env      # point VITE_API_URL at the backend (default http://localhost:3000)
pnpm install
pnpm dev                  # http://localhost:5173
VITE_MOCKS=1 pnpm dev     # same, against the built-in mock API (no backend needed)
```

Until sign-in is built (phase P2), open the shell as a demo admin with `?as=owner`, `?as=admin`, `?as=editor` or `?as=moderator`, for example `http://localhost:5173/?as=owner`. The component gallery is at `/kit?as=owner`. Neither works in a production build (`VITE_ENV=prod`).

## Commands

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm format` | ESLint (no warnings allowed) / Prettier |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm test` | Unit and component tests (Vitest + Testing Library + MSW) |
| `pnpm build` then `pnpm size` | Production build, then the 250 KB gzip budget for the initial load |
| `pnpm e2e` | Playwright against the production build. Run `pnpm build` first. `PW_CHANNEL=chrome` uses the installed Chrome. |
| `pnpm stories` | Ladle: every UI primitive as a story, with a theme switch. `pnpm stories:build` builds it. |
| `pnpm api:sync` | Copies `openapi.yaml` and `socket-events.ts` from `../backend` |
| `pnpm api:types` | Regenerates `src/lib/api-types.ts` from `openapi/openapi.yaml`. Never edit that file by hand. |

## Backend contract

`openapi/openapi.yaml` and `src/lib/socket-events.ts` are copies from the backend repo. When the backend changes them, run `pnpm api:sync && pnpm api:types` and commit the result. CI fails if the generated types do not match the committed contract.

## Secrets

Never commit `.env` files. `VITE_*` values are public (they end up in the browser bundle), so no secret may go in them.
