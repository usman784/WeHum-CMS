// Copies the API contract from the backend repo (checked out next to this one), then `pnpm api:types` regenerates the types.
// The copies are committed so CI and a fresh clone work without the backend repo.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(root, process.env.BACKEND_DIR ?? '../backend');

const files = [
  ['openapi/openapi.yaml', 'openapi/openapi.yaml'],
  ['src/realtime/socket-events.ts', 'src/lib/socket-events.ts'],
];

if (!existsSync(backend)) {
  console.error(`Backend repo not found at ${backend}. Set BACKEND_DIR.`);
  process.exit(1);
}
for (const [from, to] of files) {
  copyFileSync(resolve(backend, from), resolve(root, to));
  console.log(`synced ${to}`);
}
