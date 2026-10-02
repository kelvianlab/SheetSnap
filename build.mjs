/**
 * SheetSnap build step.
 *
 * Inlines src/app.css, src/vendor/xlsx.full.min.js and src/app.js into
 * src/index.html and writes the single self-contained SheetSnap.html at
 * the repo root. That one file is what users download - it needs no
 * server, no install and no internet.
 *
 *   node build.mjs
 *
 * You only need this if you are editing SheetSnap. Users never run it.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const html = read('./src/index.html');
const css = read('./src/app.css');
const vendor = read('./src/vendor/xlsx.full.min.js');
const app = read('./src/app.js');

const banner = `/*!
 * SheetSnap - turn any Excel file into a clean 2-page summary.
 * This single file is fully self-contained: no server, no install, no network.
 * SheetSnap code: MIT License.
 * Bundled below: SheetJS (xlsx) 0.18.5, Apache License 2.0 - see THIRD-PARTY-NOTICES.md
 */
`;

const out = html
  .replace('/*@CSS*/', () => '\n' + css + '\n')
  .replace('/*@VENDOR*/', () => '\n' + banner + vendor + '\n')
  .replace('/*@APP*/', () => '\n' + app + '\n');

for (const token of ['/*@CSS*/', '/*@VENDOR*/', '/*@APP*/']) {
  if (out.includes(token)) throw new Error(`build failed: placeholder ${token} was not replaced`);
}

writeFileSync(new URL('./SheetSnap.html', import.meta.url), out);
const kb = (statSync(new URL('./SheetSnap.html', import.meta.url)).size / 1024).toFixed(0);
console.log(`built SheetSnap.html (${kb} KB)`);
