// Bundle budget (spec §12): the initial load (JS + CSS referenced by index.html) must stay under 250 KB gzip.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 250;
const dist = resolve(process.cwd(), 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');

// Entry script, modulepreload chunks and stylesheets: everything the browser fetches before first render.
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
if (!assets.length) {
  console.error('No assets found in dist/index.html. Run `pnpm build` first.');
  process.exit(1);
}

let total = 0;
for (const a of new Set(assets)) {
  const kb = gzipSync(readFileSync(resolve(dist, `.${a}`))).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(8)} KB gz  ${a}`);
}
console.log(`${total.toFixed(1).padStart(8)} KB gz  initial load (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB) {
  console.error('Initial bundle is over budget.');
  process.exit(1);
}
