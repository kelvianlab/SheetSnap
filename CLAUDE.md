# SheetSnap — working rules

SheetSnap turns a spreadsheet into a summary report in two parts: a per-sheet
breakdown, then the whole file consolidated onto one A4 page. It ships as a
single self-contained HTML file so a user downloads one file, opens it, and it
works.

**Say "two parts", never "two pages".** Part 1 prints as one block per sheet, so
a twelve-sheet workbook runs to several pages. Only part 2 is guaranteed to fit
a single A4 page, and the test suite enforces that. Any wording that promises a
two-page printout is a bug.

**The screen is the printed object.** `paginate()` in `src/app.js` lays the
report onto real A4 sheets and the test suite asserts that the PDF comes to the
same page count. Three ordering rules make that work, and all three were bugs
first: a sheet's part class goes on at creation, because part 2 is typeset
tighter and measuring it unstyled breaks in the wrong place; the page-number
footer is built with the sheet, because adding it afterwards shrinks a body that
has already been filled; and the report must be visible before rendering,
because a hidden subtree measures zero and pours everything onto one sheet.
Overflow is read from the live element (`scrollHeight > clientHeight`), never
from a separately measured constant.

## The product promise

**Plug and play: one file, no install, no account, no network.** Any change that
would make a user install something, sign in, or go online breaks the product,
however useful it is otherwise. The spreadsheet parser is vendored into
`src/vendor/` for exactly this reason — never replace it with a CDN tag.

## Rules

**Never edit `SheetSnap.html` by hand.** It is generated. Edit `src/`, then run
`npm run build`, then commit both the source change and the rebuilt file. The
built file is committed on purpose — that is what makes the repo
download-and-go.

**Never claim something works without running it.** `npm test` drives the real
built file in a real browser, with every non-file network request blocked, and
asserts on what actually rendered. A change is not done until it passes. If you
cannot run it, say so plainly instead of assuming.

**Every number in the report must show its own working.** The report prints the
source column, the Excel formula and the row count beside each figure. A new
metric that cannot explain itself does not belong in the report.

**No personal data in this repository, ever.** It is public. Author commits as
`kelvianlab <298314713+kelvianlab@users.noreply.github.com>` — never a personal
name or personal email, and never guess a person's name from an email address.
The numeric prefix is load-bearing: GitHub only links a noreply address to the
account when it carries the account id, so the shorter `kelvianlab@users.
noreply.github.com` form leaves commits attributed to nobody. Never
commit a path from someone's own machine; use repository-relative paths. Check
screenshots before adding them: no names, no file paths, no device or product
IDs, no window titles from unrelated apps.

**Changing the bundled parser needs the owner's explicit sign-off.** See the
security note below.

## Layout

```
SheetSnap.html   built, self-contained app — what users download
src/index.html   page structure
src/app.css      styles, including the A4 print rules
src/app.js       the engine: header detection, column profiling, metric
                 selection, 5W1H, consolidation, rendering, Excel export
src/vendor/      the bundled spreadsheet parser (Apache-2.0)
build.mjs        inlines src/* into SheetSnap.html
tools/           example-file generator and the browser test suite
```

## Commands

```bash
npm install     # contributors only; users install nothing
npm run build   # rebuild SheetSnap.html after editing src/
npm test        # build, then run the browser checks
```

`SHEETSNAP_CHROMIUM=/path/to/chrome npm test` reuses a browser already on the
machine instead of downloading one.

## Known security posture

The bundled parser version carries two published advisories. The prototype
pollution one is mitigated in-app — the prototypes are sealed before any file is
parsed, and the render path never uses `innerHTML`. The ReDoS one is not
mitigated and is disclosed in plain language in `README.md` and
`THIRD-PARTY-NOTICES.md`. Keep that disclosure accurate if the parser is ever
changed.
