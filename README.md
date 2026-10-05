# WeHum CMS (React · TypeScript · Vite · Tailwind)
1. Read `WeHum_CMS_Spec.md`: §0 and §0.1 first, then build phase by phase (§15).
2. Every screen has a screenshot in `design/screens/` and its exact source in `design/source/` (see the §0.1 table).
3. Copy `starter/` into a new Vite React-TS project. It contains:
   - the Tailwind config and tokens;
   - the api, socket and query clients;
   - the live hooks;
   - rbac and routes.

   Then run `pnpm api:types` to generate the API types.
4. Backend contract: `../backend/starter/openapi/openapi.yaml` and backend spec §7.3 (`/admin` sockets).
