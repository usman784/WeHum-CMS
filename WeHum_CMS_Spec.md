# WeHum — Admin CMS Build Spec (React · TypeScript · Vite · Tailwind CSS · REST + Socket.IO)

> This file is the single source of truth for the WeHum admin panel (CMS).
> **Backend:** Node.js + PostgreSQL + Redis + Socket.IO, specified in `../backend/WeHum_Backend_Spec.md`. **No Firebase.**
> **Design reference:** `cms/design/` has a screenshot and the exact HTML source for the 19 screens, plus sign-in and the sidebar (§0.1). Frames are 1440 px desktop.
> **Contracts:**
> - REST: `../backend/starter/openapi/openapi.yaml`. Generate TS types with `openapi-typescript`.
> - Sockets: backend spec §7.3 and `../backend/starter/src/realtime/socket-events.ts` (copy into `src/lib/`).
>
> **Starter code:** `cms/starter/` contains:
> - Tailwind config and tokens;
> - the API client with silent refresh;
> - the socket client;
> - the live query hook;
> - routes and `ui` examples.

---

## 0. How to use this file (instructions for the builder / AI agent)

1. Work **phase by phase** (§15). Do not start the next phase until the current one is green.
2. After every phase:
   1. Run the phase test checklist (unit, component, e2e, a11y).
   2. Fix all failures and re-run.
   3. Update **§17 Phase reports** (what was built, commands and results, bugs fixed, decisions, open issues, evidence).
   4. Then continue.
3. Everything in the CMS is **real-time**. Lists, counters and dashboards update live without a refresh, through socket events that invalidate TanStack Query caches (§6.3).
4. No hard-coded colors, spacing or copy in components. Use the Tailwind tokens (§3–5) and the `ui` primitives.
5. Use a component-based structure only. Pages compose feature components, which compose `ui` primitives.
6. Never trust the UI for permissions. The UI hides what a role can't do, and the API enforces it.
7. Until a backend endpoint exists, use **MSW mocks** with the payloads from backend spec §5. Switching to real data needs no code change in features.

---

## 0.1 Design reference files (READ BEFORE BUILDING ANY SCREEN)

The visual design ships in this folder (`cms/design/`). You cannot see the design canvas, so use these files as the source of truth for how every screen looks:

```
cms/
  WeHum_CMS_Spec.md                 ← this file
  design/screens/NN_Name.png        ← rendered screenshot of every screen (what it must look like)
  design/source/Name.dc.html        ← exact design source: every color (hex), size (px), radius, gap, font size/weight and all copy, as inline CSS
  design/source/img/*.jpg           ← placeholder images used in the design
  design/source/canvas.json         ← screen order, titles and frame sizes
  starter/                          ← starter code (Tailwind tokens, api/socket clients, live query hook, routes, ui examples)
```

**How to use them for each screen:**
1. Open the **PNG** to see layout, hierarchy and look.
2. Open the matching **`.dc.html`** and copy exact values from its inline `style="…"`: px values are CSS px at a 1440 px wide desktop (the CMS is fluid; keep the same paddings/gaps). Text inside the markup is the final copy (except obvious demo data like names and numbers, which come from the backend).
3. `{{ hole }}` values and lists (`<sc-for>`) are filled by the `<script>` block at the bottom of each file — read it to see the demo data and the different states (e.g. `room: busy|quiet`, `viewer: free|member`, `program: started|none`). Each `data-props` enum is a **state the real screen must support**.
4. `<a href="X.dc.html">` = navigation target (the route of screen X in §9).
5. The screenshots use a fallback system font because the render machine had no internet; the real font is **Inter** (bundle it). Screenshots show the **dark** theme (designed); build light from the tokens in §3.
6. Where the PNG and this spec disagree, **this spec wins** (it holds the client's latest decisions); log it in the phase report.

Live design canvas (for humans): https://claude.ai/artifact/MhS7qCWGuYwcw51mEtyyAc

| # | Screen | Screenshot | Source |
|---|---|---|---|
| 01 | Dashboard | `design/screens/01_Main.png` | `design/source/Main.dc.html` |
| 02 | Analytics | `design/screens/02_Analytics.png` | `design/source/Analytics.dc.html` |
| 03 | Sessions | `design/screens/03_Sessions.png` | `design/source/Sessions.dc.html` |
| 04 | Session editor | `design/screens/04_SessionEditor.png` | `design/source/SessionEditor.dc.html` |
| 05 | Programs | `design/screens/05_Programs.png` | `design/source/Programs.dc.html` |
| 06 | Challenges (coming soon) | `design/screens/06_Challenges.png` | `design/source/Challenges.dc.html` |
| 07 | Daily Messages | `design/screens/07_DailyMessages.png` | `design/source/DailyMessages.dc.html` |
| 08 | Today screen | `design/screens/08_TodayScreen.png` | `design/source/TodayScreen.dc.html` |
| 09 | Themes | `design/screens/09_Disciplines.png` | `design/source/Disciplines.dc.html` |
| 10 | Teachers | `design/screens/10_Teachers.png` | `design/source/Teachers.dc.html` |
| 11 | Sounds & building blocks | `design/screens/11_Sounds.png` | `design/source/Sounds.dc.html` |
| 12 | SoS · How can I help? | `design/screens/12_SOS.png` | `design/source/SOS.dc.html` |
| 13 | Group meditation | `design/screens/13_GroupSits.png` | `design/source/GroupSits.dc.html` |
| 14 | Dedications & gratitude | `design/screens/14_Moderation.png` | `design/source/Moderation.dc.html` |
| 15 | Subscriptions (new) | `design/screens/15_Subscriptions.png` | `design/source/Subscriptions.dc.html` |
| 16 | Users & members | `design/screens/16_Users.png` | `design/source/Users.dc.html` |
| 17 | User detail | `design/screens/17_UserDetail.png` | `design/source/UserDetail.dc.html` |
| 18 | Push notifications | `design/screens/18_Notifications.png` | `design/source/Notifications.dc.html` |
| 19 | Settings | `design/screens/19_Settings.png` | `design/source/Settings.dc.html` |
| 00 | Sign in (before Dashboard) | `design/screens/00_Login.png` | `design/source/Login.dc.html` |

Shared sidebar component: `design/source/Sidebar.dc.html` (imported into every page via `<dc-import name="Sidebar">`).


---

## 1. Product context (what the CMS controls)

WeHum is a meditation app by Raphael Reiter. The CMS lets Raphael's team manage everything the app shows and see live activity:

- Meditations (audio, video, free online-library/YouTube links), themes, teachers, programs, challenges (coming soon)
- **Meditation of the Day** calendar with **3 lengths (10 / 30 / 45 min)** per day
- **Group meditation** = the MOTD starting for everyone at one configured time
- Daily messages (audio / video / text, optional image, archive)
- Today screen rules (one-decision hero, empty-room threshold, free-user layout)
- Sounds & building blocks for Build your own (openings, core blocks, closings, sounds, bells, OM/mantra loops) with loudness check
- SoS sessions ("How can I help?") + "Book a personal session with Raphael" card
- Dedications moderation (read free, post by members, after a finished meditation; report/block; gratitude feed coming soon)
- Subscriptions (RevenueCat): $59 Founding 1,000 cap, $79/yr, $9.99/mo, 7-day trial on both
- Users & members (guest/free/trial/annual/monthly), user detail, data export, account deletion
- Push notifications (daily nudge at user time, group warning 10 min before, announcements)
- Settings (team & roles, app/releases, legal, feature flags)
- Dashboard & analytics — all live

Latest client rules (Oct 5): wording "meditation(s)/meditating" (never "sit"); no streaks/grace days; no previews; Silence Room is premium; "Free for you" label only for free users; premium labelled "Premium"; disciplines renamed **Themes**; no "for life" wording.


---

## 2. Tech stack

### 2.1 Project
```
wehum-cms/
  src/
    main.tsx
    app/ (router.tsx, providers.tsx, layout/AppShell.tsx, layout/Sidebar.tsx, guards/RequireRole.tsx)
    lib/
      api.ts            // fetch wrapper: access token in memory, silent refresh via httpOnly cookie, CSRF, error mapping (starter/)
      api-types.ts      // generated from openapi.yaml (openapi-typescript) — never edit by hand
      socket.ts         // /admin namespace client (starter/)
      socket-events.ts  // copied from backend
      query.ts          // QueryClient + key factory (starter/)
      rbac.ts  format.ts  tz.ts  sentry.ts  analytics.ts  upload.ts (S3 multipart)
    hooks/ (useLiveQuery, useSubscribe, useEditingPresence, useServerTime, useUpload, useRole, useConfirm)
    ui/        (primitives §5 — Button, Card, DataTable, …)
    features/
      auth/ dashboard/ analytics/ sessions/ programs/ challenges/ daily-messages/ today-screen/
      themes/ teachers/ sounds/ sos/ group-meditation/ moderation/ subscriptions/
      users/ notifications/ settings/ audit/
        each: components/ hooks/ api.ts (query + mutation hooks) schema.ts (zod) Page.tsx
    styles/ (tokens.css, globals.css)
    mocks/ (msw handlers)
  tailwind.config.ts  vite.config.ts  index.html
```
Use **pnpm** as the package manager. TypeScript runs in strict mode.

### 2.2 Libraries
| Need | Library |
|---|---|
| Build | **Vite 6** + React 19 (or 18) + TypeScript 5 |
| Styling | **Tailwind CSS 3.4** with CSS-variable tokens (dark/light), `clsx` + `tailwind-merge` (`cn()`), `class-variance-authority` for variants |
| Routing | `react-router` 7 (data routers, lazy routes per feature) |
| Server state | **TanStack Query 5** (cache, dedupe, background refetch, optimistic updates) |
| Realtime | **`socket.io-client` 4** (`/admin` namespace, websocket only) → invalidates / patches Query cache |
| Forms | `react-hook-form` + `zod` (`@hookform/resolvers`) — schemas mirror backend DTOs |
| Tables | **TanStack Table 8** + `@tanstack/react-virtual` (virtualized rows) |
| Charts | Recharts |
| Drag & drop | `@dnd-kit` (themes, SoS tiles, program days, MOTD dates, sound blocks) |
| Dates | `date-fns` + `date-fns-tz` |
| Uploads | Direct-to-S3 multipart with presigned part URLs (from API), parallel parts (4), retry per part, pause/resume, progress |
| Primitives | Radix UI (`dialog`, `dropdown-menu`, `popover`, `switch`, `tabs`, `tooltip`, `select`, `toast`) styled with Tailwind |
| Icons | `lucide-react` (stroke icons match the design) |
| Errors / perf | **Sentry** React SDK (errors, replay on error only, performance) |
| Usage analytics | `POST /v1/admin/…` audit is automatic; optional PostHog for CMS usage |
| Tests | Vitest + Testing Library, **MSW** (API + socket mocks), Playwright (e2e vs local backend), axe-core, Ladle (component stories) |
| Lint | ESLint (typescript-eslint, react-hooks, jsx-a11y, tailwindcss plugin), Prettier |

---

## 3. Design tokens — colors (`tailwind.config.ts` + `src/styles/tokens.css`, see starter)

Use CSS variables so dark/light switch at runtime: `:root[data-theme="dark"]` and `[data-theme="light"]`. Tailwind colors map to `rgb(var(--c-xxx) / <alpha-value>)`. **Dark is the designed default.** Light is derived — verify WCAG AA.

| Token (Tailwind) | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0B0D0E` | `#F7F5F2` | App background |
| `surface` | `#17191B` | `#FFFFFF` | Cards, sidebar items active bg alt |
| `surface-alt` | `#1E2124` | `#F1EEEA` | Secondary buttons, rows |
| `input` | `#0F1112` | `#F4F1ED` | Inputs, inner tiles, selects |
| `border` | `#23262A` | `#E4E0DA` | Card borders, table dividers |
| `border-strong` | `#2A2D30` | `#D6D1CA` | Inputs |
| `outline` | `#3A3E42` | `#BDB6AE` | Outline buttons, dashed |
| `text` | `#F2F2F2` | `#141618` | Primary text |
| `text-body` | `#D9DBDD` | `#2B2F33` | Paragraphs |
| `text-soft` | `#C9CCCF` | `#3E4348` | Labels |
| `text-muted` | `#A0A4A8` | `#5C6166` | Meta, subtitles |
| `text-faint` | `#858A8F` / `#6E7378` | `#8A8F94` | Table headers, hints |
| `ember` | `#FF7A45` | `#E8622C` | Primary buttons, active nav, charts primary |
| `ember-text` | `#FF9B70` | `#C2471A` | Links, overlines, active nav text |
| `ember-soft` | `#FFB99A` | `#D9693A` | Hover |
| `on-ember` | `#2A0E02` | `#FFFFFF` | Text on ember |
| `ember-tint` | `rgba(255,122,69,0.12–0.16)` | `rgba(232,98,44,0.10)` | Active nav bg, selected rows, premium chip |
| `teal` | `#123C3A` | `#DDF3EF` | Info cards, avatars, login hero |
| `teal-text` | `#9FE3D6` | `#0F5E55` | |
| `success` | `#4ADE80` | `#16A34A` | Live, OK, "Uploaded" |
| `warning` | `#FF9B70` | `#B45309` | "Missing", "Audio missing" |
| `danger` | `#D9483B` (text `#FF8A75`, tint `rgba(220,70,50,0.10)`, border `#7A2E22`) | `#C53030` / `#FDECEA` / `#F5B5AE` | Delete |
| `info` | `#1E2A3A` / `#A9C4E8` | `#E3ECF7` / `#2C5282` | Video type |
| `lilac` | `#2A1F33` / `#CDB6E6` | `#EEE6F5` / `#5B3E7A` | Loops, outros |
| Chart series | ember `#FF7A45`, green `#4ADE80`, teal `#9FE3D6`, blue `#A9C4E8`, lilac `#CDB6E6` | darker equivalents | Validate colorblind-safe |
| World Vibration | gradient `#3A2A22 → #FF7A45 → #E5D96B → #4ADE80` | same | |

Logo: client ring logo (orange arc `#FF7A45` dasharray 52/18, green disc `#4ADE80`, dark centre) — `src/assets/logo.svg` (starter).

---

## 4. Typography (Inter, self-hosted woff2)
| Class | Size/line | Weight | Use |
|---|---|---|---|
| `text-h1` | 26/32, −0.4 | 700 | Page title |
| `text-h2` | 18/24 | 700 | Section title in settings |
| `text-h3` | 16/22 | 600 | Card title |
| `text-kpi` | 30/36 (24 in small tiles) | 700 | KPI numbers (tabular) |
| `text-body` | 14/21 | 400–600 | Default |
| `text-sm` | 13/19 | 400–600 | Meta, helper |
| `text-xs` | 12/17 | 600 | Table headers (letter-spacing 0.8, uppercase), chips |
| `text-overline` | 11–12/14, ls 1.2, uppercase | 700 | "EDIT THEME", "LIVE" |

---

## 5. Layout & components
- Frame: sidebar **248 px** fixed (logo, sections, user card), content `padding 28px 32px`, `gap 20px`, max fluid width; responsive down to 1024 px (sidebar collapses to icons < 1200 px). Tablet usable; phone read-only views for Dashboard + Moderation.
- Radii: cards 16, tiles 12–14, inputs 10–12, chips 999, buttons 10–12. Buttons height 40–44.
- **`ui` components** (each with stories in Ladle/Storybook and tests): `Button` (primary/secondary/outline/danger/ghost, loading), `IconButton`, `Card`, `KpiTile`, `Badge` (status colors), `Chip`/`TabPills`, `Tabs` (underline), `Segmented`, `Switch`, `Checkbox`, `Select`, `Input`, `Textarea` (counter), `NumberInput`, `TimeInput` (UTC + local preview), `DatePicker`, `FileDrop` (progress, retry, cancel), `AudioPreview` (play sample), `ImagePicker` (crop 1:1), `DataTable` (sort, filter, column visibility, pagination/virtual, row click), `EmptyState`, `ErrorState`, `Skeleton`, `ConfirmDialog` (typed confirmation for destructive), `Drawer`, `Toast`, `Tooltip`, `PhonePreview` (renders app card preview), `LiveDot`, `Sparkline`, `StatBar`, `SidebarNav`, `PageHeader`, `SectionCard`, `DragList`, `AuditStamp` ("edited by X · 2 min ago").


---

## 6. CMS architecture

### 6.1 Data flow rules
- **Reads:** TanStack Query hooks per feature (`useSessions(filters)`, `useSession(id)`, …). The key factory lives in `lib/query.ts`: `qk.sessions.list(filters)`, `qk.sessions.detail(id)`.
- **Writes:** mutation hooks.
  - Edits send `If-Match: "v{version}"`.
  - On `409 CONFLICT_VERSION`, show a diff dialog (theirs or mine) with the current entity from the error details.
- **Optimistic UI** for toggles, reorders and moderation actions. On error, roll back and show a toast.
- **Live** (§6.3): socket events never carry full lists. They **invalidate** the matching query keys, or **patch** small fields (counts, job progress) with `queryClient.setQueryData`.
- Forms validate with zod schemas that mirror the API, and field errors from `VALIDATION_FAILED.details.fields[]` map back onto the form.
- One `api.ts` per feature. Components never call `fetch` directly.
- Route-level code splitting. Each feature page is `lazy()`.
- All dates are shown in the admin's timezone, with a UTC tooltip. Group meditation and MOTD times are shown in **UTC plus local previews** (Berlin, New York, Lahore, Sydney).

### 6.2 Auth & roles
**Sign in (00)**
1. Email + password calls `POST /v1/admin/auth/login`.
2. The **TOTP code** calls `/mfa/verify`. First login (or after an invite) uses `/mfa/enroll`, which shows a QR code and 10 recovery codes.
3. The result is an **access token in memory** (TTL 10 min) and an **httpOnly refresh cookie** `wh_rt` (12 h idle).

**Tokens and CSRF**
- `api.ts` refreshes silently on `TOKEN_EXPIRED` (single-flight) and on page load (`POST /v1/admin/auth/refresh`).
- CSRF double-submit: a readable `wh_csrf` cookie, sent as the `X-CSRF` header.
- Nothing is ever stored in localStorage.

**Lockouts and sessions**
- Lockout after 5 failures: show "Too many attempts. Try again in 15 minutes."
- When a role is revoked or an admin is disabled, the socket sends `force:logout`, which signs the admin out.
- Idle timeout: 12 h, plus a warning dialog at 11 h 55 min.

| Capability | Owner | Admin | Editor | Moderator |
|---|---|---|---|---|
| Dashboard, Analytics | ✔ | ✔ | ✔ | Moderation stats only |
| Sessions, Programs, Daily messages, Today screen, Themes, Teachers, Sounds, SoS, Group meditation, Challenges | ✔ | ✔ | ✔ | ✖ |
| Moderation | ✔ | ✔ | ✖ | ✔ |
| Subscriptions, Users, User detail | ✔ | ✔ | read-only | ✖ |
| Delete user / export data / gift premium | ✔ | ✔ | ✖ | ✖ |
| Push notifications | ✔ | ✔ | draft only | ✖ |
| Settings: team & roles, legal, releases, feature flags, audit log | ✔ | ✔ (cannot change owners) | ✖ | ✖ |

`lib/rbac.ts` exports `can(role, action)`. It drives the sidebar items, buttons (hidden or disabled with a tooltip) and route guards (`RequireRole`). A route the admin can't access shows the **"No permission"** state.

### 6.3 Real-time everywhere (Socket.IO `/admin`)
- **Connection.** `lib/socket.ts` connects after login:
  - `io(API + '/admin', { transports: ['websocket'], auth: { token } })`;
  - reconnect with backoff;
  - on `TOKEN_EXPIRED` → refresh → reconnect;
  - on `auth:expiring` → refresh → `auth:refresh`.
- **Subscriptions.** `useSubscribe(channels)` emits `subscribe` on mount and `unsubscribe` on unmount, and re-subscribes after a reconnect.
- **Connection status.** A pill in the top bar shows "Live" (green), "Reconnecting…" (amber after 5 s) or "Offline" (grey). While not live, list pages fall back to refetch every 30 s.

| Screen | Channels | Socket event → action |
|---|---|---|
| Sidebar (always) | role room (auto) | `moderation:count` → badge; `entity:changed{type:admin}` (own role changed) → refetch `/me` |
| 00 Sign in hero | — (public `GET /v1/live` every 15 s) | live "meditated together today" counter |
| 01 Dashboard | `dashboard` | `dashboard:kpis` → `setQueryData(qk.dashboard)`; `live:agg` → "Meditating right now" + countries; `entity:changed{motd,dailyMessage}` → invalidate "Needs attention" |
| 02 Analytics | — | refetch on focus (rollups hourly); "Updated N min ago" |
| 03 Sessions list | `entities` | `entity:changed{type:session}` → invalidate `qk.sessions.list*` (debounced 500 ms); row highlight 2 s |
| 04 Session editor | `entity:session:{id}`, `jobs` | `editing:presence` → "Raphael is editing" banner; `entity:changed` by someone else → "This session changed — reload" (no silent overwrite); `job:progress` → upload/processing bar |
| 05 Programs, 06 Challenges, 09 Themes, 10 Teachers, 11 Sounds, 12 SoS | `entities` | `entity:changed{type}` → invalidate |
| 07 Daily messages, 08 Today screen | `entities` | `entity:changed{dailyMessage|motd|config}` → invalidate; MOTD variant upload via `job:progress` |
| 13 Group meditation | `dashboard` | `live:agg` + lobby counts in `dashboard:kpis`; `entity:changed{config}` |
| 14 Moderation | `moderation` | `moderation:new` → prepend to queue (if it matches filter) + toast; `entity:changed` from other moderators → remove handled items |
| 15 Subscriptions | `subscriptions`, `dashboard` | `subs:event` → prepend to feed + invalidate KPIs; founding counter from `dashboard:kpis.founding` |
| 16 Users | `users` | `users:new` → "N new users" pill → click to refetch page 1 |
| 17 User detail | `entity:user:{id}` | `entity:changed{user}` (entitlement, deletion) → refetch; deleted → banner |
| 18 Push notifications | `entities` | `notification:stats` → patch delivered/opened; `entity:changed{notification}` |
| 19 Settings | `entities` | `entity:changed{config|admin}` → invalidate; `job:progress` for exports |

---

## 7. Data contract (what the CMS reads and writes)

The backend owns the data. The PostgreSQL schema is in `../backend/starter/prisma/schema.prisma`, and all admin endpoints are listed in backend spec §5.5. Each screen uses:

| # | Screen | Endpoints |
|---|---|---|
| 00 | Sign in | `POST /v1/admin/auth/login`, `/mfa/verify`, `/mfa/enroll`, `/refresh`, `/forgot`, `/reset`, `/accept-invite`, `GET /v1/admin/me` |
| 01 | Dashboard | `GET /v1/admin/dashboard` |
| 02 | Analytics | `GET /v1/admin/analytics`, `/funnel`, `/retention`, `/export` |
| 03–04 | Sessions / editor | `GET/POST /v1/admin/sessions`, `GET/PATCH /v1/admin/sessions/{id}`, `/publish`, `/schedule`, `/archive`, `/duplicate`, `/bulk`, `POST /v1/admin/youtube/resolve`, `POST /v1/admin/media/uploads` (+ `/complete`), `GET /v1/admin/media/{id}` |
| 05 | Programs | `/v1/admin/programs*` |
| 06 | Challenges | `/v1/admin/challenges*` |
| 07 | Daily messages | `GET /v1/admin/daily-messages?from&to`, `PUT/DELETE /v1/admin/daily-messages/{date}` |
| 08 | Today screen | `GET /v1/admin/motd?from&to`, `PUT /v1/admin/motd/{date}`, `PUT …/variants/{len}`, `POST /v1/admin/motd/swap`, `GET/PUT /v1/admin/config/today` |
| 09 | Themes | `/v1/admin/themes*` (+ `PUT /order`) |
| 10 | Teachers | `/v1/admin/teachers*` |
| 11 | Sounds | `/v1/admin/sound-blocks*` (+ `PUT /order`) |
| 12 | SoS | `GET/PUT /v1/admin/sos`, `PUT /v1/admin/sos/order` (tiles are sessions with `isSos`) |
| 13 | Group meditation | `GET/PUT /v1/admin/group` |
| 14 | Moderation | `GET /v1/admin/moderation`, `POST …/{id}/hide|keep`, `/bulk`, `POST /v1/admin/users/{id}/mute`, `GET/PUT /v1/admin/moderation/rules` |
| 15 | Subscriptions | `GET /v1/admin/subscriptions/summary|members|events`, `POST /v1/admin/offers/founding/close` |
| 16–17 | Users / detail | `GET /v1/admin/users`, `GET /v1/admin/users/{id}`, `POST …/gift`, `POST …/export`, `DELETE …/{id}`, `GET /v1/admin/users/export` |
| 18 | Push notifications | `/v1/admin/notifications*`, `/automatic*` |
| 19 | Settings | `GET /v1/admin/config`, `PUT /v1/admin/config/{key}` (`main`, `legal`, …), `/v1/admin/team*`, `GET /v1/admin/audit` |
| all | Jobs | `GET /v1/admin/jobs/{id}` + `job:progress` |

**Shared conventions** (backend §5.1):
- Envelope `{data, meta}`.
- Errors `{error:{code,message,details,traceId}}`. The UI shows `traceId` in error states for support.
- Cursor pagination.
- `ETag`/`If-Match` on edits.

---

## 8. Backend

The backend is a separate service with its own spec: `../backend/WeHum_Backend_Spec.md`. It covers:
- the PostgreSQL schema;
- the REST API;
- the Socket.IO contract;
- jobs (media processing, push, rollups), RevenueCat webhooks and performance budgets.

The CMS **never** talks to the database, S3 (except presigned uploads), RevenueCat or FCM directly. Everything goes through `/v1/admin/*`.

---

## 9. CMS screen catalogue (all screens)

Legend: every screen has loading skeleton, empty state, error state with retry, "no permission" state, offline banner (CMS keeps working read-only from cache; mutations disabled).

| # | Screen | Purpose | Key UI & fields | Actions | Live data | Edge cases |
|---|---|---|---|---|---|---|
| 00 | Sign in | Admin login | Left teal hero (logo, live "meditated together today" counter), email, password, keep me signed in, forgot, Google | Sign in → TOTP code → Dashboard | live counter | wrong password lockout (5 tries/15 min), 2-step not enrolled → enroll flow (QR + recovery codes), role revoked |
| — | Sidebar (shared) | Navigation | Logo; CONTENT: Dashboard, Analytics, Sessions, Programs, Challenges, Daily Messages, Today screen, Themes, Teachers, Sounds, SoS, Group meditation; COMMUNITY: Dedications & gratitude; AUDIENCE & REVENUE: Subscriptions, Users, Push notifications; Settings; user card + sign out | — | moderation badge count | hide items by role |
| 01 | Dashboard | Daily overview | KPIs: **Meditating right now**, Meditations today, Paying members (600 · 112 in trial · $/month), Library size; Daily messages this week; Top meditations (plays, completion); **Needs attention** (reported dedications, missing daily message, MOTD missing a length variant, Founding counter); Next group meditations | quick links | all KPIs live | no data day; partial aggregates |
| 02 | Analytics | Trends | Period 7/30/90; meditations per day (solo vs group), KPIs (active users, meditations, minutes meditated, avg length, new paying); **Funnel**: Installed → Finished intro → Finished first meditation (beta focus) → Continued free → Started trial → Saved account → Paid; Retention D1/D7/D30; Minutes by theme; Members by country | export CSV | daily aggregates | timezone of report (UTC vs Berlin toggle) |
| 03 | Sessions | All meditations | Tabs: All / Free for you / Premium / Scheduled / Drafts / SoS; search; filters (theme, type, teacher); table: thumbnail, title, THEME, TYPE (Audio/Video/YouTube), LENGTH, ACCESS, GOES LIVE, plays, status | New, bulk upload (multi-file drop → drafts), bulk publish/archive | live | 1,000+ rows virtualized; publish without media blocked |
| 04 | Session editor | Create/edit | Type radio Audio / Video / YouTube link (paste → auto title, length, thumbnail; always "Free for you"); title, description, theme, teacher, tags; media upload (progress, loudness result); cover (1:1 ≥1200px, YouTube thumb default); **Access** Free/Premium; downloadable; Publishing: date, MOTD link, group meditation, programs using it, dedications link; SoS settings (feeling, subtitle) | Save draft, Schedule, Publish, Archive, Duplicate | job status live | YouTube private/removed; file too large (500 MB); unsupported codec; loudness out of range (warn) |
| 05 | Programs | Multi-day programs | List (status LIVE/DRAFT), editor: title, description, unlock rule (next day 07:00 local / after previous / all at once), access, cohort start; KPIs enrolled/reach day 4/finish; day schedule drag list | Add day, Change session, Save | live | **no grace days / rest days** |
| 06 | Challenges (coming soon) | Habit challenges | Table: name, days, what counts, in it now, finish rate, status; side editor: length, what counts, members only, show on You | New | live | hidden in app while flag off |
| 07 | Daily Messages | Calendar | Month calendar, type Audio/Video/Text, text body, optional image, theme chips + add theme, status, archive note; **no meditation link** | Save, schedule, duplicate | live | missing day warning |
| 08 | Today screen | Home rules | **Meditation of the Day** week list (drag to swap dates, Change, Move date); **Three lengths** card for selected day (10/30/45: Uploaded/Missing, Upload/Replace); "One decision on Today" explainer + show daily message toggle (off by default); Sections: progress card, live counter, world map; **Empty-room rule** threshold input (10); **For free users**: premium MOTD on top + "Free for you" (random/newest) + Silence Room premium; phone preview | Save | live | date with no MOTD → fallback chip |
| 09 | Themes | Theme taxonomy | List with drag reorder, icon picker (12 icons) + upload SVG, name, subtitle, description (shown on theme page), visibility, counts | New theme, Save | live | delete theme with sessions → reassign dialog |
| 10 | Teachers | Voices | List, profile: photo, name, role, specialty, YouTube, Instagram, website, bio, signature quote, visible, can lead group meditations, has CMS login | Add, Save | live | only one teacher → app hides teacher filter |
| 11 | Sounds & building blocks | Build-your-own assets | Tabs: Openings, Core blocks, Closings, Sounds, Bells, OM & mantra loops; table: play sample, name, length, used in, access, order; **Loudness check** card (target −16 LUFS, too loud/quiet flags); timeline explainer (opening → core → silence padding → closing) | Upload block, reorder | job live | loops must be seamless (start/end match warning) |
| 12 | SoS · How can I help? | SoS content | Tiles table: order (drag), feeling, subtitle, session it plays, length, status (Live/Audio missing); header text fields (title "How can I help?", subtitle); **"Need more help?" card**: booking link, contact email | New SoS session, Save | live | max 8 tiles per screen |
| 13 | Group meditation | One group start | Start time (UTC) + length used (10/30/45), local time preview (Berlin, New York, Lahore, Sydney); history table (day, MOTD, in the group, on their own); Lobby settings (open X min before, reminder 10 min); "More start times later" (disabled) | Save | live lobby counts | DST: UTC fixed, locals shift — show both |
| 14 | Dedications & gratitude | Moderation | Tabs: Dedications · per session / Gratitude feed (coming soon); filters Needs review / Auto-flagged / All / Hidden; session filter; posts with reason chips; Hide / Mute user / Keep; Today stats; Rules: block links, profanity filter, auto-hide at 3 reports, crisis words → show help card, posting needs membership, posts per day (3), users can block | Bulk actions | live queue + badge | crisis words → priority + writer gets help card; deleted user posts |
| 15 | Subscriptions | Revenue | KPIs: paying members (Founding · Monthly), in trial, monthly revenue, trial→paid, cancelled; **Founding 1,000 · $59/year** counter (taken/cap, bar, started, ends at 1,000, after = $79), End offer now; "What membership unlocks" (Free for you vs Members); plans table (product id, price, trial 7 days, active, shown); members list with tabs (All/Trial/Annual/Monthly/Payment problem/Cancelled); latest events feed | End offer, email Founding members | live | webhook delays → reconciliation badge; refunds |
| 16 | Users & members | Directory | Search (name/email/id), tabs All/Guests/Free account/Trial/Annual/Monthly/Cancelled; columns user, membership, this week (minutes), meditations, country, joined, last active; guest explainer | Export CSV, open detail | live first page | 100k users → server search (Postgres trigram on name + email prefix), cursor pages |
| 17 | User detail | Support | Header (plan, provider, guest→account history), tiles (this week, meditations, minutes, daily reminder), recent meditations, dedications by user, membership (plan, store, started, renews, status, RevenueCat ID, events link), **Data we collect** card, support actions: export data, mute in feed, gift 30 days premium, **delete account and data** (typed confirm; warns store subscription not cancelled) | as listed | live | user deleted mid-view → banner |
| 18 | Push notifications | Messaging | New announcement (title ≤ 50, body ≤ 150 counters, audience, deep link target, send time: now / each user's daily reminder time / scheduled), lock-screen preview; Automatic: daily nudge (at user time, own time zone), daily message ready, group meditation in 10 minutes (opt-in), trial ends in 2 days; "max one nudge a day, never a marketing blast"; sent history with delivered/opened | Send test to me, Schedule, Send | live stats | quiet hours 22:00–07:00 local; token invalid cleanup |
| 19 | Settings | Admin | Tabs: General (app name, support email, default reminder time, languages), Team & roles (invite, role select, last sign-in, 2-step status, role descriptions), Membership (link to Subscriptions; guests can use app without account — locked on), App & releases (min iOS/Android version, maintenance mode, feature flags: challenges, gratitude, breathwork, milestones, intent), Legal & privacy (privacy URL, terms URL, health disclaimer, delete inactive anonymous data after 12 months) | Save | live | owner cannot be demoted by admin; last owner protection |


---

## 10. Edge cases & checks (CMS)

- **Two admins editing the same entity.**
  - The `editing:presence` banner shows who else is editing.
  - Saves send `If-Match`. A `409` opens a diff dialog (keep mine / take theirs), so nothing is silently overwritten.
- **Uploads.**
  - Network drop: failed parts retry automatically, and the upload can pause and resume.
  - Tab closed: the multipart upload is aborted after 24 h by an S3 lifecycle rule. Processing jobs keep running, and the status shows on return (`GET /v1/admin/media/{id}`).
  - Duplicate checksum: a warning with a link to the existing asset.
  - Wrong type or too large: the file is rejected before upload.
- **Scheduling.**
  - A publish time in the past: confirm "Publish now?".
  - DST: UTC is shown alongside local previews.
  - A MOTD date missing a variant gets a red chip and appears in Dashboard "Needs attention".
- **Founding cap.** The counter can briefly show more than 1,000, because the webhook is the source of truth. "End offer now" asks for confirmation and is idempotent.
- **Deleting.**
  - A theme with sessions requires picking a reassignment theme.
  - A session used by a future MOTD or a program shows a "Used in…" list, and is blocked.
  - Deleting a user requires typing DELETE plus the user's first name, and shows the job progress.
- **Moderation.**
  - Crisis-flagged posts are pinned on top with a red tag and are never auto-hidden.
  - A post already handled by another moderator disappears live, and acting on it gives a toast "Already handled by X".
- **Notifications.**
  - The audience count preview is shown before sending.
  - Quiet-hours warning for 22:00–07:00 local.
  - "Send" needs owner or admin; editors can only save drafts.
- **Session expiry.**
  - Silent refresh happens in the background.
  - If refresh fails mid-form, the draft is kept in memory and a re-login modal appears without losing the form.
- **Offline or API down.**
  - A top banner appears and mutations are disabled (buttons show a tooltip).
  - The last data stays visible from the Query cache.
- **Socket down.** The pill shows "Reconnecting…", and lists fall back to a 30 s refetch.
- **Permissions.** The UI is hidden by `can()`, and the API also returns `403 FORBIDDEN` → the "No permission" state. The UI is never trusted on its own.
- **Large data.**
  - Virtualized tables with cursor pagination.
  - Exports run as jobs and arrive as a link (no client-side mega queries).
- **Clock.** Countdowns (group meditation) use the server time from `GET /v1/time`, with an offset computed at login.

---

## 11. Monitoring & observability

| Area | Tool | Setup |
|---|---|---|
| Errors | Sentry React | release = git sha, source maps uploaded in CI; user = admin id + role (no email); breadcrumbs on route, mutation, socket state; API `traceId` attached as tag to correlate with backend |
| Performance | Sentry tracing | route load, `useQuery` timings > 1 s flagged; Web Vitals (LCP < 2.5 s, INP < 200 ms) |
| Session replay | Sentry Replay | **on error only**, all text/inputs masked |
| Socket health | custom | `socket_state` breadcrumbs; reconnect count; a top-bar pill |
| Usage | backend audit log (every mutation) + optional PostHog | events: `cms_login`, `cms_publish`, `cms_schedule_motd`, `cms_moderate`, `cms_send_push`, `cms_export`, `cms_delete_user`, `cms_error` |
| Uptime | Better Stack / Route53 on CMS URL | alert Slack/email |

---

## 12. Performance (fast CMS)

**Bundle and loading**
- Route-level code splitting. The initial bundle must be < 250 KB gz. Recharts, dnd-kit and the upload code are lazy-loaded.
- Prefetch on hover: sidebar links and table rows call `queryClient.prefetchQuery` for the detail page.

**Query cache**
- TanStack Query defaults: `staleTime: 30s` on lists (sockets keep them fresh), `gcTime: 10m`, `refetchOnWindowFocus: true` only for analytics, and `retry: 2` for GETs only.

**Lists and inputs**
- Tables use server-side cursor pagination plus virtualization (`@tanstack/react-virtual`), which handles 100k users.
- Search inputs are debounced (300 ms), with `keepPreviousData` (`placeholderData`) so the table does not flash.

**Media**
- Images use CDN sizes (300 px thumbnails), `loading="lazy"` and blurhash placeholders.
- Uploads run 4 parallel parts in a Web Worker for checksums (sha256), so the UI stays responsive.

**Hosting and budgets**
- Static hosting on CloudFront or Cloudflare Pages: immutable hashed assets, `index.html` no-cache, HTTP/2 and Brotli.
- Budgets checked in CI (Lighthouse CI): Performance ≥ 90 and Accessibility ≥ 95 on Dashboard and Sessions.

---

## 13. Testing strategy
| Layer | Tooling | Must cover |
|---|---|---|
| Schemas | Vitest | every zod form schema: valid/invalid fixtures |
| UI primitives | Vitest + Testing Library + Ladle stories | variants, keyboard a11y, dark/light |
| Feature pages | Vitest + MSW (REST) + mock socket | loading / empty / error / no-permission / offline states; socket event → list updates |
| API client | Vitest | single-flight refresh, CSRF header, 409 conflict mapping, error → toast |
| E2E | Playwright against local backend (docker-compose) | login + TOTP, create session → upload → publish → visible in app catalog endpoint, MOTD 3 lengths + swap, group config, moderation hide (2 browsers: second sees removal live), push send (FCM mocked), user delete, role matrix (4 roles) |
| Realtime e2e | Playwright, 2 contexts | edit in A → B list updates < 2 s; editing presence banner; conflict dialog |
| Accessibility | axe-core in Playwright | no serious violations |
| Visual | Playwright screenshots vs `design/screens/*.png` (manual review, not pixel-strict) | layout parity |

---

## 14. Environments & deployment
- **Environments:** `local` (Vite dev server and local backend), `dev`, `staging`, `prod`. Each has `.env` with `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_SENTRY_DSN` and `VITE_ENV`.
- **CI (GitHub Actions):**
  - install;
  - generate API types from `openapi.yaml` and fail if they changed without a commit;
  - lint, typecheck, unit tests, build, Lighthouse CI;
  - Playwright against the backend docker-compose (nightly + on release).
- **CD:** build to S3 + CloudFront (or Cloudflare Pages). PR preview URLs point at the staging API. Upload Sentry source maps, then delete them from the bundle.
- **Security headers (CDN):**
  - CSP (`default-src 'self'`; `connect-src` API + wss + Sentry; `img-src` CDN; `media-src` CDN);
  - `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin`, HSTS.

---

## 15. Phase plan (each phase: build → self-test → fix → report)

| Phase | Scope | Exit tests |
|---|---|---|
| **P0 Foundation** | Vite + TS strict, Tailwind tokens dark/light (starter), Inter, ESLint/Prettier, Sentry, CI, `api.ts` + `socket.ts` + query client (starter), MSW mocks, generated API types | CI green; shell renders both themes; Sentry test event; api client unit tests |
| **P1 UI kit** | All `ui` primitives §5 + Ladle stories + `AppShell` + `Sidebar` (by role) | Component tests + axe; dark/light stories |
| **P2 Auth** | Sign in, TOTP enroll/verify, recovery codes, forgot/reset, accept invite, silent refresh, idle timeout, `RequireRole`, no-permission state | Playwright: login+TOTP; each role sees correct nav; lockout message; refresh after 10 min works |
| **P3 Content** | Sessions list (virtualized, tabs, filters) + editor (audio/video/YouTube resolve), S3 multipart upload + job progress, Themes (drag), Teachers, Sounds & blocks (+ loudness card), Programs (day drag list), Challenges (flag) | E2E publish flow vs local backend; upload resume after network drop; 409 conflict dialog |
| **P4 Daily experience** | Today screen (MOTD week list, 3 lengths, swap, rules, phone preview), Daily messages calendar, SoS (tiles drag + help card), Group meditation (UTC + local previews, lobby settings) | E2E MOTD schedule + swap; missing variant shows in Dashboard "Needs attention" |
| **P5 Live layer** | Socket client wiring, `useSubscribe`, `entity:changed` invalidation map, editing presence, connection pill, Dashboard live KPIs | 2-browser realtime e2e (< 2 s); reconnect after backend restart resubscribes |
| **P6 Revenue & users** | Subscriptions (KPIs, founding counter, end offer, events feed live), Users (search, tabs, "N new"), User detail (gift, export, delete with typed confirm) | E2E delete user → job progress → user gone; founding close switches state live |
| **P7 Community & messaging** | Moderation queue live, rules, bulk, mute; Push notifications (compose with counters, audience preview count, send modes, test to me, automatic list, history stats live) | Moderation e2e with 2 moderators; push scheduling validation (quiet hours warning) |
| **P8 Analytics, settings & hardening** | Dashboard final, Analytics (charts, funnel, retention, export), Settings tabs (general, team & roles, membership, releases & flags, legal), Audit log viewer, a11y, Lighthouse budgets | axe clean; Lighthouse ≥ 90/95; flags flip reaches app (`config:changed`) |
| **P9 Coming soon** | Challenges full, Gratitude feed moderation tab, Breathwork content, Milestones | Flag on/off tests |

---

## 16. Definition of done (every CMS screen)
- Matches the design (dark) plus the light theme. Tokens only.
- Live updates via sockets. Loading, empty, error (with `traceId`), no-permission and offline states.
- Role checks in the UI, with API enforcement verified by an e2e test.
- zod validation with field errors from the API mapped onto the form.
- Optimistic updates with rollback where it applies; conflict (409) handled.
- Tests at each layer; Sentry clean in staging; axe clean.

---

## 17. Phase reports (update after every phase)

```
### Phase Px — <name>
Date:
Built:
Tests run: (commands, pass/fail counts)
Bugs found → fixed:
Decisions / deviations from spec:
Open issues / risks:
Evidence: (screenshots, Playwright traces, Sentry links, Lighthouse report)
Status: ✅ done / ⚠️ blocked
```

_(No phases completed yet.)_
