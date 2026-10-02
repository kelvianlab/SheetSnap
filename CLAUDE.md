# SheetSnap — working rules

SheetSnap turns a spreadsheet into a 2-page summary report. It ships as a single
self-contained HTML file so a user downloads one file, opens it, and it works.

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
`kelvianlab <kelvianlab@users.noreply.github.com>` — never a personal name or
personal email, and never guess a person's name from an email address. Never
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
