/* Drives the real built SheetSnap.html in a real browser with the real
   example workbook, then asserts on what the page actually rendered.
   Run: npm test   (needs `npm install` first; contributors only) */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const app = fileURLToPath(new URL('../SheetSnap.html', import.meta.url));
const xlsx = fileURLToPath(new URL('../examples/sample-procurement.xlsx', import.meta.url));
const shots = fileURLToPath(new URL('../.test-output/', import.meta.url));
mkdirSync(shots, { recursive: true });

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' - ' + extra : ''}`);
  if (!cond) failures++;
};

/* Use the repo's Playwright download, or an explicitly supplied binary
   (handy on machines where the browser is already installed elsewhere):
     SHEETSNAP_CHROMIUM=/path/to/chrome npm test                        */
const browser = await chromium.launch(
  process.env.SHEETSNAP_CHROMIUM ? { executablePath: process.env.SHEETSNAP_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

/* Hard requirement: the app must work with no network at all. */
await page.route('**/*', (route) =>
  route.request().url().startsWith('file:') ? route.continue() : route.abort());

await page.goto('file://' + app);
await page.screenshot({ path: shots + '01-start.png', fullPage: true });

ok('page title is SheetSnap', (await page.title()) === 'SheetSnap');
ok('Summarize button starts disabled', await page.locator('#runBtn').isDisabled());

await page.locator('.opt > summary').click();
await page.locator('#optTitle').fill('HVAC Procurement Recap - Q1 2026');
await page.locator('#optAuthor').fill('Engineering Dept.');
await page.locator('#optWhy').fill('Monthly PO review for the client contract.');
await page.locator('#fileInput').setInputFiles(xlsx);

ok('file card appears', await page.locator('#fileCard').isVisible());
ok('Summarize button enabled after pick', await page.locator('#runBtn').isEnabled());

await page.locator('#runBtn').click();
await page.locator('#page2').waitFor({ state: 'visible', timeout: 15000 });

ok('error box stayed hidden', await page.locator('#errBox').isHidden());
ok('page 1 rendered', await page.locator('#page1').isVisible());

/* three data sheets + one empty sheet = four blocks */
const blocks = await page.locator('#page1 .sheet').count();
ok('one block per sheet (4)', blocks === 4, `got ${blocks}`);

const w5h = await page.locator('#page1 .sheet').first().locator('.w5h .cell').count();
ok('first sheet has 6 x 5W1H cells', w5h === 6, `got ${w5h}`);

const tiles = await page.locator('#page1 .sheet').first().locator('.tile').count();
ok('first sheet has 5 metric tiles', tiles === 5, `got ${tiles}`);

const body = await page.locator('#page1').innerText();
ok('money column became the headline metric', /Total Price \(IDR\)/.test(body));
ok('header row below a title row was detected', /header detected on row 4/.test(body));
ok('vendor column answered "Who"', /Carrier Indonesia/.test(body));
ok('date column answered "When"', /2026-01-12 to 2026-04-02/.test(body));
ok('typed purpose answered "Why"', /Monthly PO review/.test(body));
ok('empty sheet was skipped, not crashed', /no data rows found/.test(body));
/* Chiller header sits on row 4, so its data really is rows 5-11 in Excel.
   The printed formula must match the user's actual file, not a guess. */
ok('printed formula matches the real Excel rows', /=SUM\(G5:G11\)/.test(body));
ok('blank cells are reported honestly', /empty cell/.test(body));

const p2 = await page.locator('#page2').innerText();
/* 3,700,000,000 + 1,620,000,000 + 3,720,000,000 + 1,850,000,000 + 2,820,000,000
   + 1,240,000,000 + 3,240,000,000  (chiller)
   + 852,000,000 + 672,000,000 + 1,136,000,000 + 655,000,000 + 504,000,000
   + 994,000,000  (ahu)
   + 428,000,000 + 512,000,000 + 321,000,000 + 389,000,000  (pumps) */
const expected = 3700e6+1620e6+3720e6+1850e6+2820e6+1240e6+3240e6
               + 852e6+672e6+1136e6+655e6+504e6+994e6
               + 428e6+512e6+321e6+389e6;
ok('cross-sheet grand total is arithmetically correct',
   p2.includes(expected.toLocaleString('en-US')), `expected ${expected.toLocaleString('en-US')}`);
ok('total record count correct (17)', /17 records in total/.test(p2));
ok('empty sheet excluded from page 2', /1 empty sheet ignored/.test(p2));
ok('comparison chart rendered', (await page.locator('#page2 .bar-row').count()) === 3);
ok('executive summary written', (await page.locator('#page2 .exec p').count()) >= 4);
ok('largest contributor identified', /largest contributor/.test(p2));

await page.screenshot({ path: shots + '02-report-light.png', fullPage: true });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.screenshot({ path: shots + '03-report-dark.png', fullPage: true });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

/* Print layout. Page 1 may run over several sheets (one block per sheet of
   the workbook), but page 2 must always land on exactly one A4 sheet. */
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: shots + 'report.pdf', format: 'A4', printBackground: true });

await page.locator('#page1').evaluate((n) => { n.style.display = 'none'; });
const only2 = await page.pdf({ format: 'A4', printBackground: true });
await page.locator('#page1').evaluate((n) => { n.style.display = ''; });
const pageCount = (only2.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
ok('page 2 fits exactly one A4 sheet', pageCount === 1, `rendered ${pageCount} sheet(s)`);
await page.emulateMedia({ media: 'screen' });

/* Excel export must actually produce a file. */
const dl = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('#xlsxBtn').click(),
]).then(([d]) => d);
ok('Excel export downloads', /SheetSnap summary\.xlsx$/.test(dl.suggestedFilename()),
   dl.suggestedFilename());

/* A deliberately awkward file must not crash the app. */
await page.locator('#againBtn').click();
await page.locator('#drop').waitFor({ state: 'visible' });
const csv = fileURLToPath(new URL('../.test-output/odd.csv', import.meta.url));
const { writeFileSync } = await import('node:fs');
writeFileSync(csv, 'a,b,c\n,,\n1,,x\n');
await page.locator('#fileInput').setInputFiles(csv);
await page.locator('#runBtn').click();
await page.waitForTimeout(1200);
const survived = (await page.locator('#page2').isVisible()) || !(await page.locator('#errBox').isHidden());
ok('awkward CSV handled without crashing', survived);

/* ---------------- security and reliability checks ---------------------- */

/* The bundled parser has a known prototype-pollution advisory. The app seals
   the prototypes before parsing anything, so verify the seal is actually on. */
const sealed = await page.evaluate(() => Object.isFrozen(Object.prototype) && Object.isFrozen(Array.prototype));
ok('Object/Array prototypes are sealed before any file is parsed', sealed);

/* A file that is really HTML but named .xlsx: the parser accepts HTML tables,
   so its contents reach the renderer. Nothing in it may ever execute. */
await page.locator('#againBtn').click().catch(() => {});
await page.locator('#drop').waitFor({ state: 'visible' });
const evil = fileURLToPath(new URL('../.test-output/disguised.xlsx', import.meta.url));
writeFileSync(evil,
  '<table><tr><th>Vendor</th><th>Total</th></tr>' +
  '<tr><td><img src=x onerror="window.__pwned=1"></td><td>5</td></tr>' +
  '<tr><td><script>window.__pwned=1<\/script></td><td>7</td></tr></table>');
await page.evaluate(() => { delete window.__pwned; });
await page.locator('#fileInput').setInputFiles(evil);
await page.locator('#runBtn').click();
await page.waitForTimeout(1500);
ok('markup hidden inside a file never executes', await page.evaluate(() => window.__pwned === undefined));
/* The parser strips the tags and hands us plain cell values, so the file is
   summarised as ordinary data rather than being rendered as markup. */
ok('disguised file is summarised as plain data, not rendered as markup',
   await page.locator('#page2').isVisible());
ok('no element was injected from file content',
   (await page.locator('#report img, #report script, #errBox img, #errBox script').count()) === 0);

/* Running the same job twice in a row must not degrade. */
await page.locator('#againBtn').click().catch(() => {});
await page.locator('#drop').waitFor({ state: 'visible' });
await page.locator('#fileInput').setInputFiles(xlsx);
await page.locator('#runBtn').click();
await page.locator('#page2').waitFor({ state: 'visible', timeout: 15000 });
const second = await page.locator('#page2').innerText();
ok('second run produces an identical consolidated total (idempotent)',
   second.includes(expected.toLocaleString('en-US')));
ok('no duplicated report blocks after a re-run',
   (await page.locator('#page1 .sheet').count()) === 4);

ok('no uncaught JS errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
