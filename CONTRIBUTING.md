# Contributing to SheetSnap

Thanks for being here. Small, clear pull requests are very welcome.

## The one rule that matters

**SheetSnap must stay plug and play.** A user downloads one file, opens it, and it
works — offline, in any folder, on any operating system. Any change that would
make someone install something, sign in, or go online will be declined, however
useful it is otherwise.

## Setting up

```bash
git clone <your fork>
cd sheetsnap
npm install
npm test
```

You need Node 18+ for the build and tests. Users need neither.

## Making a change

1. Edit the files in `src/` — never edit `SheetSnap.html` directly, it is generated.
2. Run `npm run build` to regenerate `SheetSnap.html`.
3. Run `npm test`. It opens the real built file in a real browser with the network
   blocked and checks what actually rendered.
4. Commit **both** your `src/` change and the rebuilt `SheetSnap.html`.

## Good first issues

Look for the [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
label. Some ideas that are always welcome:

- **More column-name vocabulary.** `VOCAB` in `src/app.js` maps column names to
  meanings. Adding the words your language or industry uses makes the report
  smarter for everyone, and it is a two-line change.
- **A test for a workbook shape that trips it up.** If SheetSnap misreads your
  file, a stripped-down example plus a failing check in `tools/smoke-test.mjs` is
  the most valuable thing you can send.
- **Clearer wording.** The report is read by people who do not work with
  spreadsheets. Plainer English is a real improvement.

## Reporting a bug

Please open an issue and, if you can, attach a small Excel file that reproduces it
with any confidential data replaced. A file we can open is worth ten paragraphs of
description.

**Never attach a file containing real customer, vendor, salary or pricing data.**

## Style

The code is plain ES5-compatible JavaScript with no build-time transforms, so it
runs in the widest range of browsers. Keep it that way: no frameworks, no new
dependencies, no `fetch`. Comments explain *why*, not *what*.
