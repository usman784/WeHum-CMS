# CMS design

- `source/*.dc.html` and `screens/00–19_*.png`: the original design (Oct 5) and its renders.
- `screens/S*.png`: **Stitch redesign (Oct 12)**. The Stitch project has no admin screens, so the new controls reuse the existing patterns. These are renders of the built pages (mock API, 1440 px, dark):

| Image | Page | What changed |
|---|---|---|
| `S01_Dashboard` | Dashboard | streak and hourly-sit counters, heart-rate shift only when real data exists |
| `S06_Challenges` | Challenges | live cohort sprints: unlock time, grace days, badge, schedule |
| `S07_DailyMessages` | Daily messages | access (free / premium), transcript lines, video |
| `S11_Sounds` | Sounds | bell role (opening / interval / closing) |
| `S12_SOS` | SoS | tile duration, sound beds, crisis directory |
| `S13_GroupSits` | Group sits | cadence (daily / hourly), intentions, focus card, doors-open time |
| `S14_Moderation` | Dedications & gratitude | place (city / worldwide), anonymize |
| `S16_Users` | Users | streak and export (zip) |
| `S19_Settings` | Settings | silence room, downloads quota, sit-time blocks, crisis, feature flags |

Regenerate with `VITE_MOCKS=1 VITE_API_URL=http://localhost:3000 pnpm dev`, sign in as `owner@wehum.app` / `correct-horse-battery` / `123456`.
