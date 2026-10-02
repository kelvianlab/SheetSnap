/* Drives the real built SheetSnap.html in a real browser with the real
   example workbook, then asserts on what the page actually rendered.
   Run: npm test   (needs `npm install` first; contributors only) */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const app = fileURLToPath(new URL('../SheetSnap.html', import.meta.url));
const xlsx = fileURLToPath(new URL('../examples/sample-sales-orders.xlsx', import.meta.url));
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
/* `hidden` must actually hide: a .filecard rule setting display once beat it,
   leaving an empty card with a Remove button on the first screen. */
ok('no empty file card before a file is chosen', await page.locator('#fileCard').isHidden());
ok('no stray error box on the first screen', await page.locator('#errBox').isHidden());

await page.locator('.opt > summary').click();
await page.locator('#optTitle').fill('Customer Orders Recap - Q1 2026');
await page.locator('#optAuthor').fill('Sales Admin');
await page.locator('#optWhy').fill('Quarterly sales review across all three channels.');
await page.locator('#fileInput').setInputFiles(xlsx);

ok('file card appears', await page.locator('#fileCard').isVisible());
ok('Summarize button enabled after pick', await page.locator('#runBtn').isEnabled());

await page.locator('#runBtn').click();
await page.locator('.part2').first().waitFor({ state: 'visible', timeout: 15000 });

ok('error box stayed hidden', await page.locator('#errBox').isHidden());
ok('part 1 rendered', await page.locator('.part1').first().isVisible());

/* Part 1 is one block per sheet, so its printed length depends on the workbook.
   Only part 2 is a single page. The app must never promise a fixed page count:
   a user with twelve sheets would read a broken promise as a broken tool. */
const visible = await page.locator('body').innerText();
ok('nothing on screen promises a fixed page count',
   !/2-page|2 page|two-page/i.test(visible));
ok('the two halves are labelled as parts, not pages',
   /Part 1 of 2/i.test(visible) && /Part 2 of 2/i.test(visible));
ok('part 1 states how many sheets it covers, so Print holds no surprise',
   /4 sheets here/i.test(visible));

/* three data sheets + one empty sheet = four blocks */
const blocks = await page.locator('.part1 .sheet').count();
ok('one block per sheet (4)', blocks === 4, `got ${blocks}`);

const w5h = await page.locator('.part1 .sheet').first().locator('.w5h .cell').count();
ok('first sheet has 6 x 5W1H cells', w5h === 6, `got ${w5h}`);

const tiles = await page.locator('.part1 .sheet').first().locator('.tile').count();
ok('first sheet has 5 metric tiles', tiles === 5, `got ${tiles}`);

const body = (await page.locator('.part1').allInnerTexts()).join('\n');
ok('money column became the headline metric', /Total Amount \(IDR\)/.test(body));
ok('header row below a title row was detected', /header detected on row 4/.test(body));
ok('customer column answered "Who"', /Siti Rahayu/.test(body));
ok('date column answered "When"', /2026-01-06 to 2026-01-29/.test(body));
ok('typed purpose answered "Why"', /Quarterly sales review/.test(body));
ok('empty sheet was skipped, not crashed', /no data rows found/.test(body));
/* Discount (%) only exists from February, and adding it shifted every later
   column one letter across. Consolidation must still line the sheets up. */
ok('a column that starts mid-quarter is matched by name, not position',
   /avg discount \(%\)[\s\S]*?=AVERAGE\(I4:I9\)/i.test(body));
ok('January falls back to a structural metric when numeric columns run out',
   /records[\s\S]*?=COUNTA\(A5:A10\)/i.test(body));
ok('channel column answered "How"', /Online \(3\)/.test(body));
/* January's header sits on row 4 and Total Amount is column H, so its data
   really is H5:H10 in Excel. The printed formula must match the user's actual
   file, not a guess. */
ok('printed formula matches the real Excel rows', /=SUM\(H5:H10\)/.test(body));
ok('blank cells are reported honestly', /empty cell/.test(body));

const p2 = (await page.locator('.part2').allInnerTexts()).join('\n');
/* January   1,350,000 + 1,250,000 + 9,800,000 + 1,600,000
             + 1,360,000 +   900,000                 = 16,260,000
   February  1,620,000 + 6,250,000 + 1,100,000 +   680,000
             + 1,920,000 + 1,580,000                 = 13,150,000
   March    14,400,000 + 2,500,000 + 1,080,000 + 1,550,000
             + 7,500,000                             = 27,030,000 */
const expected = 1350000 + 1250000 + 9800000 + 1600000 + 1360000 + 900000
               + 1620000 + 6250000 + 1100000 + 680000 + 1920000 + 1580000
               + 14400000 + 2500000 + 1080000 + 1550000 + 7500000;
ok('cross-sheet grand total is arithmetically correct',
   p2.includes(expected.toLocaleString('en-US')), `expected ${expected.toLocaleString('en-US')}`);
ok('total record count correct (17)', /17 records in total/.test(p2));
ok('empty sheet excluded from page 2', /1 empty sheet ignored/.test(p2));
ok('comparison chart rendered', (await page.locator('.part2 .bar-row').count()) === 3);
ok('executive summary written', (await page.locator('.part2 .exec p').count()) >= 4);
ok('largest contributor identified', /largest contributor/.test(p2));

await page.screenshot({ path: shots + '02-report-light.png', fullPage: true });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.screenshot({ path: shots + '03-report-dark.png', fullPage: true });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

/* Pagination. The screen is laid out as real A4 sheets, so the printed output
   must come to exactly the same number of pages - no silent reflow, no blank
   trailing page, nothing clipped. */
const onScreenSheets = await page.locator('.a4').count();
ok('report is laid out as discrete A4 sheets', onScreenSheets >= 2, `${onScreenSheets} sheet(s)`);
ok('every sheet is numbered', (await page.locator('.a4-foot').count()) === onScreenSheets);
ok('the last sheet says so',
   (await page.locator('.a4-foot').last().innerText()).includes('of ' + onScreenSheets));
ok('part 2 occupies exactly one sheet', (await page.locator('.part2').count()) === 1);
ok('no sheet is empty',
   (await page.locator('.a4-body').evaluateAll((n) => n.every((x) => x.childNodes.length > 0))));

/* Nothing may be cut off: every block must sit inside the sheet that holds it. */
ok('no content is clipped by its sheet',
   await page.locator('.a4').evaluateAll((sheets) =>
     sheets.every((s) => s.scrollHeight <= s.clientHeight + 2)));

await page.emulateMedia({ media: 'print' });
const pdf = await page.pdf({ path: shots + 'report.pdf', format: 'A4', printBackground: true });
const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
ok('printed page count matches the sheets shown on screen',
   pdfPages === onScreenSheets, `${pdfPages} printed vs ${onScreenSheets} on screen`);
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
const survived = (await page.locator('.part2').first().isVisible().catch(() => false)) ||
                 !(await page.locator('#errBox').isHidden());
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
   await page.locator('.part2').first().isVisible());
ok('no element was injected from file content',
   (await page.locator('#report img, #report script, #errBox img, #errBox script').count()) === 0);

/* Running the same job twice in a row must not degrade. */
await page.locator('#againBtn').click().catch(() => {});
await page.locator('#drop').waitFor({ state: 'visible' });
await page.locator('#fileInput').setInputFiles(xlsx);
await page.locator('#runBtn').click();
await page.locator('.part2').first().waitFor({ state: 'visible', timeout: 15000 });
const second = await page.locator('#page2').innerText();
ok('second run produces an identical consolidated total (idempotent)',
   second.includes(expected.toLocaleString('en-US')));
ok('no duplicated report blocks after a re-run',
   (await page.locator('.part1 .sheet').count()) === 4);

ok('no uncaught JS errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
