# Third-party notices

`SheetSnap.html` bundles one third-party library so that the app works with no
installation and no internet connection.

## SheetJS Community Edition (`xlsx`) 0.18.5

- Purpose: reading `.xlsx` / `.xls` / `.xlsm` / `.csv` files and writing the
  Excel export.
- Copyright (C) 2012-present SheetJS LLC
- Licence: Apache License 2.0
- Full licence text: [`src/vendor/LICENSE-sheetjs.txt`](src/vendor/LICENSE-sheetjs.txt)
- Source: <https://www.npmjs.com/package/xlsx/v/0.18.5>

### Known advisories against this version

`xlsx` 0.18.5 is the newest release published to npm; SheetJS moved later
releases to their own distribution channel, so npm reports "no fix available".
Two high-severity advisories apply to 0.18.5:

| Advisory | Issue | Fixed upstream in |
|---|---|---|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | Prototype pollution via a crafted workbook | 0.19.3 |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | Regular-expression denial of service (ReDoS) | 0.20.2 |

**What SheetSnap does about it**, and what is left:

- SheetSnap seals `Object.prototype`, `Array.prototype` and `Function.prototype`
  before any file is parsed, so the polluting assignment throws instead of
  landing. `tools/smoke-test.mjs` asserts the seal is on.
- SheetSnap builds every part of the report from DOM text nodes, never from
  `innerHTML`, so content that came out of a file cannot become markup. The
  test suite feeds it a file that is really HTML containing `<script>` and an
  `onerror` handler, and asserts that nothing executes.
- **Not mitigated: the ReDoS.** A deliberately crafted file can make the browser
  tab hang. The blast radius is that one tab — there is no server, no other
  user, and no data to reach — and closing the tab ends it. Only open files you
  obtained from someone you trust, exactly as you would with Excel itself.

SheetSnap's own code is MIT licensed — see [`LICENSE`](LICENSE).
