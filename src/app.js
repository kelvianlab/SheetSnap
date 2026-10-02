/* =====================================================================
   SheetSnap - app logic
   No network calls. No analytics. The file you open stays in this tab's
   memory and is discarded when you close or reload the page.
   ===================================================================== */
(function () {
  'use strict';

  /* Defence in depth.
     The bundled spreadsheet parser has a known prototype-pollution advisory
     (GHSA-4r6h-8v6p-xvw6) and a maliciously crafted workbook is the exact way
     it is reached. Sealing the prototypes before any file is parsed makes the
     polluting assignment throw instead of landing, whatever the parser does.
     Wrapped because a host that already froze them would otherwise throw here. */
  try {
    Object.freeze(Object.prototype);
    Object.freeze(Array.prototype);
    Object.freeze(Function.prototype);
  } catch (e) { /* already sealed, or not permitted - nothing to do */ }

  /* ---------------------------------------------------------------
     0. Small helpers
     --------------------------------------------------------------- */
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function isBlank(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isDate(v) { return v instanceof Date && !isNaN(v.getTime()); }

  var NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  var NF0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  /* Full, exact number with thousand separators. */
  function fmt(n) {
    if (!isFinite(n)) return '-';
    return (Math.abs(n) >= 1000 || Number.isInteger(n)) ? NF0.format(n) : NF.format(n);
  }

  /* Short form for the big tile numbers: 1.24M, 8.3K. */
  function fmtShort(n) {
    if (!isFinite(n)) return '-';
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e12) return s + (a / 1e12).toFixed(2).replace(/\.00$/, '') + 'T';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (a >= 1e6) return s + (a / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
    if (a >= 1e4) return s + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return fmt(n);
  }

  function fmtDate(d) {
    if (!isDate(d)) return '-';
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    return Math.round(Math.abs(b - a) / 86400000);
  }

  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /* Normalise a header for cross-sheet matching: "Total Price (IDR)" -> "total price idr" */
  function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* Spreadsheet column letter for a 0-based index: 0 -> A, 27 -> AB */
  function colLetter(i) {
    var s = '';
    i = i + 1;
    while (i > 0) {
      var r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* ---------------------------------------------------------------
     1. Column-name vocabulary
        Used to guess what a column means. English + Indonesian,
        because real-world spreadsheets mix both.
     --------------------------------------------------------------- */
  var VOCAB = {
    unitRate: /(unit ?price|unit ?cost|unit ?rate|harga ?satuan|price ?per|cost ?per|rate ?per|per ?unit|\/ ?unit|\bupp\b)/i,
    money: /(amount|total|subtotal|grand|value|price|cost|harga|nilai|biaya|budget|revenue|sales|income|expense|payment|invoice|idr|usd|rp\b|contract)/i,
    capacity: /(capacity|kapasitas|\bkw\b|\bkva\b|\btr\b|\bhp\b|watt|\bton\b|cmh|\bcfm\b|load|power|flow|head)/i,
    qty: /(\bqty\b|quantity|jumlah|\bunits?\b|\bcount\b|\bpcs\b|pieces|volume|stock|weight|berat|\bset\b|\blot\b)/i,
    duration: /(lead ?time|\bdays?\b|hari|duration|durasi|aging|\bage\b|\beta\b|delay|hours?|\bjam\b)/i,
    ratio: /(%|percent|persen|pct|discount|diskon|margin|\brate\b|ratio|progress|achievement|tax|ppn|share)/i,
    person: /(vendor|supplier|pemasok|\bpic\b|customer|client|klien|contractor|kontraktor|buyer|requester|owner|employee|staff|karyawan|\bname\b|nama|person|sales ?rep|manufacturer|brand|merek|principal|company|perusahaan)/i,
    place: /(location|lokasi|\bsite\b|area|\bplace\b|address|alamat|region|wilayah|city|kota|province|provinsi|country|negara|warehouse|gudang|project|proyek|\bzone\b|floor|lantai|building|gedung|plant|branch|cabang|destination|origin)/i,
    reason: /(purpose|tujuan|reason|alasan|remark|remarks|note|notes|catatan|description|deskripsi|keterangan|justification|scope|\bspec\b|specification|comment|detail)/i,
    method: /(term|terms|\btop\b|payment|pembayaran|method|metode|\bcara\b|status|process|proses|procedure|prosedur|\btype\b|\bjenis\b|category|kategori|\bclass\b|\bgrade\b|channel|stage|phase|tahap|incoterm|delivery|shipping|mode|currency)/i,
    identifier: /(^no\.?$|^id$|number|nomor|\bcode\b|\bkode\b|\bsku\b|\bref\b|reference|\bpo\b|invoice ?no|serial|batch|ticket|^row$|^#$|^item$)/i
  };

  function vocabHit(name) {
    for (var k in VOCAB) { if (VOCAB[k].test(name)) return k; }
    return null;
  }

  /* ---------------------------------------------------------------
     2. Sheet analysis
     --------------------------------------------------------------- */

  /* Find the row that most likely holds the column titles.
     Real-world sheets often start with a logo, a title and blank rows,
     so we score the first 25 rows instead of assuming row 1.          */
  function findHeaderRow(aoa) {
    var best = 0, bestScore = -Infinity;
    var limit = Math.min(aoa.length, 25);
    for (var i = 0; i < limit; i++) {
      var row = aoa[i] || [];
      var filled = 0, strings = 0;
      for (var c = 0; c < row.length; c++) {
        if (isBlank(row[c])) continue;
        filled++;
        if (typeof row[c] === 'string') strings++;
      }
      if (filled < 2) continue;

      /* A real header row is followed by rows containing data. */
      var dataBelow = 0, looked = 0;
      for (var j = i + 1; j < Math.min(i + 8, aoa.length); j++) {
        var r = aoa[j] || [];
        looked++;
        for (var k = 0; k < r.length; k++) {
          if (isNum(r[k]) || isDate(r[k]) || !isBlank(r[k])) dataBelow++;
        }
      }
      if (looked === 0) continue;

      var score = strings * 3 + filled + (dataBelow / looked) * 2 - i * 0.6;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  /* Build a typed profile for every column. */
  function profileColumns(aoa, headerIdx, lastIdx) {
    var header = aoa[headerIdx] || [];
    var width = 0, i;
    for (i = headerIdx; i <= lastIdx; i++) {
      if (aoa[i] && aoa[i].length > width) width = aoa[i].length;
    }

    var cols = [];
    for (var c = 0; c < width; c++) {
      var rawName = header[c];
      var name = isBlank(rawName) ? ('Column ' + colLetter(c)) : String(rawName).trim();
      var named = !isBlank(rawName);

      var nums = [], dates = [], texts = [], blanks = 0, total = 0;
      for (i = headerIdx + 1; i <= lastIdx; i++) {
        var v = (aoa[i] || [])[c];
        total++;
        if (isBlank(v)) { blanks++; continue; }
        if (isNum(v)) nums.push(v);
        else if (isDate(v)) dates.push(v);
        else texts.push(String(v).trim());
      }

      var filled = total - blanks;
      if (filled === 0 && !named) continue;           /* completely empty, skip */

      var type = 'text';
      if (nums.length >= dates.length && nums.length >= texts.length && nums.length > 0) type = 'number';
      else if (dates.length > nums.length && dates.length >= texts.length) type = 'date';

      var col = {
        index: c, letter: colLetter(c), name: name, type: type,
        rows: total, filled: filled, blanks: blanks,
        meaning: vocabHit(name)
      };

      if (type === 'number') {
        var sum = 0, min = Infinity, max = -Infinity;
        for (i = 0; i < nums.length; i++) {
          sum += nums[i];
          if (nums[i] < min) min = nums[i];
          if (nums[i] > max) max = nums[i];
        }
        col.count = nums.length;
        col.sum = sum;
        col.avg = nums.length ? sum / nums.length : 0;
        col.min = min; col.max = max;
        /* Values 0..1 with a ratio-ish name are stored fractions of a percent. */
        col.looksFraction = (col.meaning === 'ratio' && max <= 1.000001 && min >= -1.000001);
      } else if (type === 'date') {
        col.count = dates.length;
        col.min = new Date(Math.min.apply(null, dates));
        col.max = new Date(Math.max.apply(null, dates));
      } else {
        var seen = Object.create(null), top = null, topN = 0;
        for (i = 0; i < texts.length; i++) {
          var t = texts[i];
          seen[t] = (seen[t] || 0) + 1;
          if (seen[t] > topN) { topN = seen[t]; top = t; }
        }
        col.count = texts.length;
        col.unique = Object.keys(seen).length;
        col.top = top; col.topN = topN;
        col.freq = seen;
      }
      cols.push(col);
    }
    return cols;
  }

  /* How interesting is this numeric column as a headline metric? */
  function metricScore(col) {
    var base = { money: 100, capacity: 72, qty: 64, unitRate: 55, duration: 48, ratio: 40 }[col.meaning];
    if (base === undefined) base = col.meaning === 'identifier' ? -50 : 12;
    var fillRate = col.rows ? col.filled / col.rows : 0;
    var spread = (col.max !== col.min) ? 6 : -10;   /* a constant column says little */
    return base + fillRate * 14 + spread;
  }

  /* "Total Total Price" reads badly - drop a prefix the column name already has. */
  function label(agg, name) {
    var clean = String(name).replace(/^(total|jumlah|sum of|avg|average|rata-?rata)\s+/i, '').trim() || name;
    return (agg === 'AVERAGE' ? 'Avg ' : 'Total ') + clean;
  }

  /* Which aggregate makes sense: a sum, or an average? */
  function aggFor(col) {
    /* Durations, ratios and per-unit rates are only meaningful as an average -
       adding up seven unit prices tells the reader nothing. */
    if (col.meaning === 'duration' || col.meaning === 'ratio' || col.meaning === 'unitRate') return 'AVERAGE';
    return 'SUM';
  }

  /* Build up to 5 headline metrics, each carrying the calculation
     that produced it so the reader can verify it by hand.           */
  function buildMetrics(cols, rowCount, fieldCount, span) {
    var numeric = cols.filter(function (c) {
      return c.type === 'number' && c.count > 0 && c.meaning !== 'identifier';
    });
    numeric.sort(function (a, b) { return metricScore(b) - metricScore(a); });

    var out = [];
    for (var i = 0; i < numeric.length && out.length < 5; i++) {
      var c = numeric[i];
      var agg = aggFor(c);
      var value = agg === 'SUM' ? c.sum : c.avg;
      var isPct = c.meaning === 'ratio';
      var shown = value, suffix = '';
      if (isPct) {
        shown = c.looksFraction ? value * 100 : value;
        suffix = '%';
      }
      out.push({
        label: label(agg, c.name),
        value: value,
        display: (isPct ? (Math.round(shown * 100) / 100) + suffix : fmtShort(value)),
        exact: (isPct ? (Math.round(shown * 100) / 100) + suffix : fmt(value)),
        formula: '=' + agg + '(' + c.letter + span.first + ':' + c.letter + span.last + ')',
        basis: agg + ' of column "' + c.name + '" (' + c.letter + ')',
        detail: fmt(c.count) + ' value' + (c.count === 1 ? '' : 's') + ' used' +
                (c.blanks ? ', ' + fmt(c.blanks) + ' empty cell' + (c.blanks === 1 ? '' : 's') + ' skipped' : ', no empty cells') +
                (agg === 'SUM' ? '' : ' - range ' + fmt(c.min) + ' to ' + fmt(c.max)),
        kind: c.meaning || 'number',
        column: c
      });
    }

    /* Not enough numeric columns? Fall back to structural facts,
       so the report always shows a full set of five.               */
    var fallbacks = [];
    fallbacks.push({
      label: 'Records', value: rowCount, display: fmt(rowCount), exact: fmt(rowCount),
      formula: '=COUNTA(A' + span.first + ':A' + span.last + ')',
      basis: 'Number of data rows below the header row',
      detail: 'Counted every row after the detected header row', kind: 'structural'
    });
    fallbacks.push({
      label: 'Fields', value: fieldCount, display: fmt(fieldCount), exact: fmt(fieldCount),
      formula: '=COUNTA(' + (span.first - 1) + ':' + (span.first - 1) + ')',
      basis: 'Number of columns in the header row',
      detail: 'Each field became one column profile', kind: 'structural'
    });

    var dateCol = cols.filter(function (c) { return c.type === 'date' && c.count > 0; })
                      .sort(function (a, b) { return b.count - a.count; })[0];
    if (dateCol) {
      var span = daysBetween(dateCol.min, dateCol.max);
      fallbacks.push({
        label: 'Time span (' + dateCol.name + ')', value: span,
        display: fmt(span) + ' d', exact: fmt(span) + ' days',
        formula: '=MAX(' + dateCol.letter + span.first + ':' + dateCol.letter + span.last + ')-MIN(' +
                 dateCol.letter + span.first + ':' + dateCol.letter + span.last + ')',
        basis: 'Newest minus oldest date in "' + dateCol.name + '"',
        detail: fmtDate(dateCol.min) + ' to ' + fmtDate(dateCol.max) + ' - ' + fmt(dateCol.count) + ' dated rows',
        kind: 'structural'
      });
    }

    var entity = cols.filter(function (c) { return c.type === 'text' && c.meaning === 'person' && c.unique > 0; })
                     .sort(function (a, b) { return b.count - a.count; })[0] ||
                 cols.filter(function (c) { return c.type === 'text' && c.unique > 1; })
                     .sort(function (a, b) { return b.count - a.count; })[0];
    if (entity) {
      fallbacks.push({
        label: 'Unique ' + entity.name, value: entity.unique,
        display: fmt(entity.unique), exact: fmt(entity.unique),
        formula: '=COUNTA(UNIQUE(' + entity.letter + span.first + ':' + entity.letter + span.last + '))',
        basis: 'Distinct text values in "' + entity.name + '" (' + entity.letter + ')',
        detail: 'Most frequent: "' + entity.top + '" appears ' + fmt(entity.topN) + ' time' + (entity.topN === 1 ? '' : 's'),
        kind: 'structural'
      });
    }

    var cells = 0, full = 0;
    cols.forEach(function (c) { cells += c.rows; full += c.filled; });
    fallbacks.push({
      label: 'Data completeness', value: cells ? full / cells : 0,
      display: (cells ? Math.round(full / cells * 100) : 0) + '%',
      exact: (cells ? Math.round(full / cells * 1000) / 10 : 0) + '%',
      formula: '=COUNTA(all cells)/(rows*columns)',
      basis: 'Filled cells divided by all cells in the data range',
      detail: fmt(full) + ' filled of ' + fmt(cells) + ' cells', kind: 'structural'
    });

    for (var f = 0; f < fallbacks.length && out.length < 5; f++) out.push(fallbacks[f]);
    return out.slice(0, 5);
  }

  /* The 5W1H panel. Every answer names the column it came from,
     so nothing in the report is unexplained.                       */
  function buildW5H(cols, meta, sheetName, rowCount, metrics) {
    function pick(meaning, type) {
      var c = cols.filter(function (x) {
        return x.meaning === meaning && (!type || x.type === type) && x.count > 0;
      }).sort(function (a, b) { return b.count - a.count; });
      return c[0] || null;
    }

    var w = [];

    /* WHAT */
    var topMetric = metrics[0];
    w.push({
      k: 'What', v: 'Sheet "' + sheetName + '" holds ' + fmt(rowCount) + ' record' + (rowCount === 1 ? '' : 's') +
         ' across ' + fmt(cols.length) + ' field' + (cols.length === 1 ? '' : 's') + '. ' +
         'Headline figure: ' + topMetric.label + ' = ' + topMetric.exact + '.',
      src: 'from: sheet name + data range'
    });

    /* WHO */
    var who = pick('person');
    w.push(who ? {
      k: 'Who', v: fmt(who.unique) + ' distinct value' + (who.unique === 1 ? '' : 's') + ' in "' + who.name +
         '". Most frequent: ' + who.top + ' (' + fmt(who.topN) + ' row' + (who.topN === 1 ? '' : 's') + ').',
      src: 'from: column ' + who.letter + ' "' + who.name + '"'
    } : { k: 'Who', v: meta.author ? meta.author : 'No person, vendor or customer column found in this sheet.',
          src: meta.author ? 'from: "Prepared by" you typed' : 'no matching column' });

    /* WHERE */
    var where = pick('place');
    w.push(where ? {
      k: 'Where', v: (where.type === 'text'
          ? fmt(where.unique) + ' location' + (where.unique === 1 ? '' : 's') + ' in "' + where.name + '". Most frequent: ' + where.top + '.'
          : 'Column "' + where.name + '" ranges ' + fmt(where.min) + ' to ' + fmt(where.max) + '.'),
      src: 'from: column ' + where.letter + ' "' + where.name + '"'
    } : { k: 'Where', v: 'No location column found. Source file: ' + meta.fileName,
          src: 'from: file name' });

    /* WHEN */
    var dates = cols.filter(function (c) { return c.type === 'date' && c.count > 0; })
                    .sort(function (a, b) { return b.count - a.count; });
    if (dates.length) {
      var d = dates[0];
      w.push({
        k: 'When', v: fmtDate(d.min) + ' to ' + fmtDate(d.max) + ' (' + fmt(daysBetween(d.min, d.max)) +
           ' days) based on "' + d.name + '".' + (dates.length > 1 ? ' ' + (dates.length - 1) + ' other date column(s) present.' : ''),
        src: 'from: column ' + d.letter + ' "' + d.name + '"'
      });
    } else {
      w.push({ k: 'When', v: 'No date column found. File last modified ' + meta.modified + '; report generated ' + meta.generated + '.',
               src: 'from: file timestamp' });
    }

    /* WHY */
    var why = pick('reason', 'text');
    w.push(meta.why ? {
      k: 'Why', v: meta.why, src: 'from: the purpose you typed in Step 1'
    } : (why ? {
      k: 'Why', v: 'Stated in "' + why.name + '". Most frequent entry: ' + why.top + '.',
      src: 'from: column ' + why.letter + ' "' + why.name + '"'
    } : {
      k: 'Why', v: 'Not stated in the file. Add a purpose in Step 1 ("Why this report exists") and it will appear here.',
      src: 'no matching column'
    }));

    /* HOW */
    var how = pick('method', 'text');
    if (how) {
      var pairs = Object.keys(how.freq).map(function (k) { return [k, how.freq[k]]; })
                        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
      w.push({
        k: 'How', v: 'Breakdown of "' + how.name + '": ' +
           pairs.map(function (p) { return p[0] + ' (' + fmt(p[1]) + ')'; }).join(', ') +
           (how.unique > 3 ? ', +' + (how.unique - 3) + ' more' : '') + '.',
        src: 'from: column ' + how.letter + ' "' + how.name + '"'
      });
    } else {
      w.push({
        k: 'How', v: 'Every figure above is a plain SUM, AVERAGE or COUNT over one column - the exact formula is printed under each number.',
        src: 'from: SheetSnap calculation method'
      });
    }
    return w;
  }

  function analyzeSheet(name, ws, meta) {
    /* blankrows:true is deliberate - it keeps our row indexes identical to the
       row numbers the user sees in Excel, so the printed formulas are valid. */
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    if (!aoa.length) {
      return { name: name, empty: true, rowCount: 0, cols: [], metrics: [], w5h: [] };
    }
    var headerIdx = findHeaderRow(aoa);

    /* Last row that actually contains something, so trailing blank rows in
       the file do not inflate the record count or the formula ranges. */
    var lastIdx = headerIdx;
    for (var r = aoa.length - 1; r > headerIdx; r--) {
      var rr = aoa[r] || [];
      var any = false;
      for (var q = 0; q < rr.length; q++) { if (!isBlank(rr[q])) { any = true; break; } }
      if (any) { lastIdx = r; break; }
    }

    var cols = profileColumns(aoa, headerIdx, lastIdx);
    var rowCount = Math.max(0, lastIdx - headerIdx);

    /* A sheet needs a real table to be summarised. A single stray column with
       one or two lines of prose (a "Notes" tab) is reported as skipped. */
    if (!cols.length || rowCount === 0 || (cols.length < 2 && rowCount < 3)) {
      return { name: name, empty: true, rowCount: rowCount, headerIdx: headerIdx, cols: cols, metrics: [], w5h: [] };
    }

    var span = { first: headerIdx + 2, last: lastIdx + 1 };   /* 1-based, as in Excel */
    var metrics = buildMetrics(cols, rowCount, cols.length, span);
    return {
      name: name, empty: false, headerIdx: headerIdx, rowCount: rowCount, span: span,
      cols: cols, metrics: metrics,
      w5h: buildW5H(cols, meta, name, rowCount, metrics)
    };
  }

  /* ---------------------------------------------------------------
     3. Cross-sheet consolidation (page 2)
     --------------------------------------------------------------- */
  function consolidate(sheets) {
    var live = sheets.filter(function (s) { return !s.empty; });
    var groups = Object.create(null);

    live.forEach(function (s) {
      s.cols.forEach(function (c) {
        if (c.type !== 'number' || !c.count || c.meaning === 'identifier') return;
        var key = norm(c.name);
        if (!key) return;
        var g = groups[key] || (groups[key] = {
          label: c.name, agg: aggFor(c), meaning: c.meaning,
          sum: 0, count: 0, sheets: [], weighted: 0
        });
        g.sum += c.sum;
        g.count += c.count;
        g.weighted += c.avg * c.count;
        g.sheets.push(s.name);
      });
    });

    var list = Object.keys(groups).map(function (k) {
      var g = groups[k];
      g.value = g.agg === 'SUM' ? g.sum : (g.count ? g.weighted / g.count : 0);
      g.isPct = g.meaning === 'ratio';
      g.score = { money: 100, capacity: 72, qty: 64, unitRate: 55, duration: 48, ratio: 40 }[g.meaning];
      if (g.score === undefined) g.score = 12;
      g.score += g.sheets.length * 8;   /* appearing in many sheets matters */
      return g;
    }).sort(function (a, b) { return b.score - a.score; });

    var totalRows = 0;
    live.forEach(function (s) { totalRows += s.rowCount; });

    /* The one measure used for the per-sheet comparison bar chart:
       the highest-scoring money/capacity/qty group.                */
    var primary = list.filter(function (g) { return g.agg === 'SUM' && !g.isPct; })[0] || null;
    var bars = [];
    if (primary) {
      var pk = norm(primary.label);
      live.forEach(function (s) {
        var c = s.cols.filter(function (x) { return x.type === 'number' && norm(x.name) === pk; })[0];
        if (c) bars.push({ name: s.name, value: c.sum });
      });
      bars.sort(function (a, b) { return b.value - a.value; });
    }

    return {
      sheets: live, emptyCount: sheets.length - live.length,
      totalRows: totalRows, groups: list.slice(0, 6),
      primary: primary, bars: bars
    };
  }

  /* ---------------------------------------------------------------
     4. Rendering
     --------------------------------------------------------------- */
  function tile(m) {
    var t = el('div', 'tile');
    t.appendChild(el('div', 'tile-k', m.label));
    var v = el('div', 'tile-v', m.display);
    v.title = m.exact;
    t.appendChild(v);
    t.appendChild(el('div', 'tile-f', m.formula));
    return t;
  }

  function table(headers, rows, foot) {
    var t = el('table', 't');
    var thead = el('thead'), tr = el('tr');
    headers.forEach(function (h) {
      var th = el('th', h.num ? 'num' : null, h.label);
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);

    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr');
      r.forEach(function (cell, i) {
        var cls = [];
        if (headers[i] && headers[i].num) cls.push('num');
        if (headers[i] && headers[i].mono) cls.push('mono');
        row.appendChild(el('td', cls.join(' ') || null, cell));
      });
      tb.appendChild(row);
    });
    t.appendChild(tb);

    if (foot) {
      var tf = el('tfoot'), ftr = el('tr');
      foot.forEach(function (cell, i) {
        ftr.appendChild(el('td', (headers[i] && headers[i].num) ? 'num' : null, cell));
      });
      tf.appendChild(ftr); t.appendChild(tf);
    }
    return t;
  }

  function renderPage1(wrapEl, model) {
    var page = el('section', 'page');
    page.id = 'page1';

    var head = el('div', 'rhead');
    head.appendChild(el('span', 'page-label', 'Page 1 of 2 - per-sheet breakdown'));
    var h2 = el('h2', null, model.meta.title);
    head.appendChild(h2);
    head.appendChild(el('div', 'sub',
      model.meta.fileName + ' - ' + model.sheets.length + ' sheet' + (model.sheets.length === 1 ? '' : 's') +
      ' - generated ' + model.meta.generated +
      (model.meta.author ? ' - prepared by ' + model.meta.author : '')));
    page.appendChild(head);

    page.appendChild(el('p', 'page-note',
      'One block per sheet. Each block answers What / Who / Where / When / Why / How, then lists the 5 most important numbers with the exact calculation behind each one.'));

    model.sheets.forEach(function (s, i) {
      var box = el('div', 'sheet');
      var sh = el('div', 'sheet-head');
      sh.appendChild(el('span', 'sheet-n', 'Sheet ' + (i + 1)));
      sh.appendChild(el('span', 'sheet-name', s.name));
      if (s.empty) {
        sh.appendChild(el('span', 'sheet-size', 'no data rows found - skipped'));
        box.appendChild(sh);
        wrapEl.appendChild(box);
        page.appendChild(box);
        return;
      }
      sh.appendChild(el('span', 'sheet-size',
        fmt(s.rowCount) + ' rows x ' + fmt(s.cols.length) + ' columns - header detected on row ' + (s.headerIdx + 1)));
      box.appendChild(sh);

      /* 5W1H */
      box.appendChild(el('h4', 'sec-h', '5W1H - what this sheet is about'));
      var grid = el('div', 'w5h');
      s.w5h.forEach(function (w) {
        var c = el('div', 'cell');
        c.appendChild(el('div', 'k', w.k));
        c.appendChild(el('div', 'v', w.v));
        c.appendChild(el('div', 'src', w.src));
        grid.appendChild(c);
      });
      box.appendChild(grid);

      /* 5 metrics */
      var mh = el('h4', 'sec-h', 'The 5 most important numbers');
      mh.style.marginTop = '16px';
      box.appendChild(mh);

      var tiles = el('div', 'tiles');
      s.metrics.forEach(function (m) { tiles.appendChild(tile(m)); });
      box.appendChild(tiles);

      box.appendChild(table(
        [{ label: '#' }, { label: 'Figure' }, { label: 'Value', num: true }, { label: 'Calculated as' }, { label: 'Rows involved' }],
        s.metrics.map(function (m, n) { return [String(n + 1), m.label, m.exact, m.basis, m.detail]; })
      ));
      page.appendChild(box);
    });

    wrapEl.appendChild(page);
  }

  function renderPage2(wrapEl, model) {
    var c = model.consol;
    var page = el('section', 'page');
    page.id = 'page2';

    var head = el('div', 'rhead');
    head.appendChild(el('span', 'page-label', 'Page 2 of 2 - whole-file summary'));
    head.appendChild(el('h2', null, 'Consolidated Summary'));
    head.appendChild(el('div', 'sub',
      'All ' + c.sheets.length + ' sheet' + (c.sheets.length === 1 ? '' : 's') + ' merged - ' +
      fmt(c.totalRows) + ' records in total' +
      (c.emptyCount ? ' (' + c.emptyCount + ' empty sheet' + (c.emptyCount === 1 ? '' : 's') + ' ignored)' : '')));
    page.appendChild(head);

    /* KPI row */
    if (c.groups.length) {
      page.appendChild(el('h4', 'sec-h', 'Combined figures across every sheet'));
      var tiles = el('div', 'tiles');
      c.groups.slice(0, 5).forEach(function (g) {
        tiles.appendChild(tile({
          label: label(g.agg, g.label),
          display: g.isPct ? (Math.round(g.value * 100) / 100) + '%' : fmtShort(g.value),
          exact: g.isPct ? (Math.round(g.value * 100) / 100) + '%' : fmt(g.value),
          formula: '=' + g.agg + ' over ' + g.sheets.length + ' sheet' + (g.sheets.length === 1 ? '' : 's')
        }));
      });
      page.appendChild(tiles);

      page.appendChild(table(
        [{ label: 'Combined figure' }, { label: 'Value', num: true }, { label: 'Method' }, { label: 'Sheets included' }],
        c.groups.map(function (g) {
          return [
            g.label,
            g.isPct ? (Math.round(g.value * 100) / 100) + '%' : fmt(g.value),
            g.agg === 'SUM' ? 'Sum of every sheet total' : 'Average weighted by row count',
            g.sheets.join(', ')
          ];
        })
      ));
    }

    /* per-sheet contribution table */
    var ph = el('h4', 'sec-h', 'Contribution by sheet');
    ph.style.marginTop = '18px';
    page.appendChild(ph);

    var hasPrimary = !!c.primary;
    var rows = c.sheets.map(function (s) {
      var top = s.metrics[0];
      var pv = '-';
      if (hasPrimary) {
        var pk = norm(c.primary.label);
        var col = s.cols.filter(function (x) { return x.type === 'number' && norm(x.name) === pk; })[0];
        pv = col ? fmt(col.sum) : 'n/a';
      }
      return [s.name, fmt(s.rowCount), fmt(s.cols.length), top ? top.label : '-', top ? top.exact : '-', pv];
    });
    page.appendChild(table(
      [{ label: 'Sheet' }, { label: 'Records', num: true }, { label: 'Fields', num: true },
       { label: 'Headline figure' }, { label: 'Value', num: true },
       { label: hasPrimary ? c.primary.label : 'Primary measure', num: true }],
      rows,
      ['TOTAL', fmt(c.totalRows), '', '', '',
       hasPrimary ? fmt(c.bars.reduce(function (a, b) { return a + b.value; }, 0)) : '']
    ));

    /* single-series horizontal bar chart - magnitude by sheet */
    if (c.bars.length > 1) {
      var ch = el('h4', 'sec-h', c.primary.label + ' by sheet');
      ch.style.marginTop = '18px';
      page.appendChild(ch);
      var maxV = Math.max.apply(null, c.bars.map(function (b) { return Math.abs(b.value); })) || 1;
      var chart = el('div', 'chart');
      chart.setAttribute('role', 'img');
      chart.setAttribute('aria-label', c.primary.label + ' compared across ' + c.bars.length + ' sheets');
      c.bars.forEach(function (b) {
        var row = el('div', 'bar-row');
        row.appendChild(el('div', 'bar-lab', b.name));
        var track = el('div', 'bar-track');
        var fill = el('div', 'bar-fill');
        fill.style.width = Math.max(0.6, Math.abs(b.value) / maxV * 100) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el('div', 'bar-val', fmtShort(b.value)));
        row.title = b.name + ': ' + fmt(b.value);
        chart.appendChild(row);
      });
      page.appendChild(chart);
    }

    /* executive summary */
    var exec = el('div', 'exec');
    exec.appendChild(el('h4', 'sec-h', 'Executive summary'));

    var lines = [];
    lines.push('This report covers ' + model.meta.fileName + ', containing ' + c.sheets.length +
      ' sheet' + (c.sheets.length === 1 ? '' : 's') + ' and ' + fmt(c.totalRows) + ' records in total.');

    if (c.groups.length) {
      var g0 = c.groups[0];
      lines.push('The leading combined figure is ' + (g0.agg === 'AVERAGE' ? 'an average ' : 'a total ') +
        g0.label.replace(/^(total|jumlah)\s+/i, '') + ' of ' + (g0.isPct ? (Math.round(g0.value * 100) / 100) + '%' : fmt(g0.value)) +
        ', drawn from ' + g0.sheets.length + ' sheet' + (g0.sheets.length === 1 ? '' : 's') + '.');
    }
    if (c.bars.length > 1) {
      var tot = c.bars.reduce(function (a, b) { return a + b.value; }, 0);
      var share = tot ? Math.round(c.bars[0].value / tot * 100) : 0;
      lines.push('"' + c.bars[0].name + '" is the largest contributor to ' + c.primary.label +
        ' at ' + fmt(c.bars[0].value) + ' (' + share + '% of the combined total), while "' +
        c.bars[c.bars.length - 1].name + '" is the smallest at ' + fmt(c.bars[c.bars.length - 1].value) + '.');
    }

    var allDates = [];
    c.sheets.forEach(function (s) {
      s.cols.forEach(function (x) { if (x.type === 'date' && x.count) { allDates.push(x.min, x.max); } });
    });
    if (allDates.length) {
      var lo = new Date(Math.min.apply(null, allDates)), hi = new Date(Math.max.apply(null, allDates));
      lines.push('Dates in the file run from ' + fmtDate(lo) + ' to ' + fmtDate(hi) +
        ', a window of ' + fmt(daysBetween(lo, hi)) + ' days.');
    }
    if (model.meta.why) lines.push('Stated purpose: ' + model.meta.why);

    var gaps = [];
    c.sheets.forEach(function (s) {
      var worst = s.cols.filter(function (x) { return x.blanks > 0 && x.rows > 0 && x.blanks / x.rows > 0.25; });
      if (worst.length) gaps.push(s.name + ' (' + worst.length + ' sparse column' + (worst.length === 1 ? '' : 's') + ')');
    });
    lines.push(gaps.length
      ? 'Data quality note: empty cells are concentrated in ' + gaps.join(', ') + '. Totals above exclude those blanks.'
      : 'Data quality note: no column is missing more than a quarter of its values.');

    lines.forEach(function (t) { exec.appendChild(el('p', null, t)); });
    page.appendChild(exec);

    page.appendChild(el('div', 'notice',
      'Every number on both pages is a plain SUM, AVERAGE, COUNT, MIN or MAX over a single column of your file - the formula is printed beside each one so you can check it in Excel. SheetSnap never changes your original file. Generated ' +
      model.meta.generated + ' by SheetSnap.'));

    wrapEl.appendChild(page);
  }

  /* ---------------------------------------------------------------
     5. Excel export
     --------------------------------------------------------------- */
  function exportXlsx(model) {
    var wb = XLSX.utils.book_new();

    /* Page 1 */
    var a = [];
    a.push([model.meta.title]);
    a.push(['Source file', model.meta.fileName]);
    a.push(['Generated', model.meta.generated]);
    if (model.meta.author) a.push(['Prepared by', model.meta.author]);
    a.push([]);
    a.push(['PAGE 1 - PER-SHEET BREAKDOWN']);
    model.sheets.forEach(function (s, i) {
      a.push([]);
      a.push(['Sheet ' + (i + 1), s.name, s.empty ? 'no data rows' : s.rowCount + ' rows x ' + s.cols.length + ' columns']);
      if (s.empty) return;
      a.push(['5W1H', 'Answer', 'Source']);
      s.w5h.forEach(function (w) { a.push([w.k, w.v, w.src]); });
      a.push(['#', 'Figure', 'Value', 'Calculated as', 'Rows involved', 'Excel formula']);
      s.metrics.forEach(function (m, n) {
        a.push([n + 1, m.label, m.value, m.basis, m.detail, m.formula]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'Page 1 - Per Sheet');

    /* Page 2 */
    var c = model.consol, b = [];
    b.push(['PAGE 2 - CONSOLIDATED SUMMARY']);
    b.push(['Sheets merged', c.sheets.length]);
    b.push(['Total records', c.totalRows]);
    b.push([]);
    b.push(['Combined figure', 'Value', 'Method', 'Sheets included']);
    c.groups.forEach(function (g) {
      b.push([g.label, g.value, g.agg === 'SUM' ? 'Sum of every sheet total' : 'Average weighted by row count', g.sheets.join(', ')]);
    });
    b.push([]);
    b.push(['Sheet', 'Records', 'Fields', 'Headline figure', 'Value']);
    c.sheets.forEach(function (s) {
      b.push([s.name, s.rowCount, s.cols.length, s.metrics[0] ? s.metrics[0].label : '', s.metrics[0] ? s.metrics[0].value : '']);
    });
    b.push([]);
    b.push(['Executive summary']);
    document.querySelectorAll('#page2 .exec p').forEach(function (p) { b.push([p.textContent]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b), 'Page 2 - Consolidated');

    var base = model.meta.fileName.replace(/\.[^.]+$/, '');
    XLSX.writeFile(wb, base + ' - SheetSnap summary.xlsx');
  }

  /* ---------------------------------------------------------------
     6. Wiring
     --------------------------------------------------------------- */
  var state = { file: null, model: null };

  /* Built from DOM nodes, never innerHTML: `detail` can carry text that came
     out of the user's file (a parser error message quotes file content), and
     assigning that to innerHTML would execute markup hidden inside a file. */
  function showError(title, detail, hints) {
    var box = $('errBox');
    box.textContent = '';
    box.appendChild(el('b', null, title));
    if (detail) box.appendChild(el('p', null, detail));
    if (hints && hints.length) {
      var ul = el('ul');
      hints.forEach(function (h) { ul.appendChild(el('li', null, h)); });
      box.appendChild(ul);
    }
    box.hidden = false;
  }
  function clearError() { $('errBox').hidden = true; }

  function setFile(f) {
    clearError();
    state.file = f;
    if (!f) {
      $('fileCard').hidden = true;
      $('runBtn').disabled = true;
      $('runHint').textContent = 'Choose a file first.';
      $('fileInput').value = '';
      return;
    }
    $('fileName').textContent = f.name;
    $('fileSub').textContent = bytes(f.size) + ' - last modified ' +
      new Date(f.lastModified).toISOString().slice(0, 10);
    $('fileCard').hidden = false;
    $('runBtn').disabled = false;
    $('runHint').textContent = 'Ready. Press Summarize.';
  }

  function run() {
    if (!state.file) return;
    clearError();
    var btn = $('runBtn');
    btn.disabled = true;
    $('runHint').textContent = 'Reading your file...';

    var reader = new FileReader();
    reader.onerror = function () {
      btn.disabled = false;
      showError('Could not read that file.',
        'It may be open in Excel right now, or the file may be damaged. Close it in Excel and try again.');
    };
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), {
          type: 'array', cellDates: true, cellNF: false, cellStyles: false
        });
        if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('This workbook has no sheets.');

        var meta = {
          fileName: state.file.name,
          title: ($('optTitle').value || '').trim() || ('Summary of ' + state.file.name),
          author: ($('optAuthor').value || '').trim(),
          why: ($('optWhy').value || '').trim(),
          modified: new Date(state.file.lastModified).toISOString().slice(0, 10),
          generated: new Date().toISOString().slice(0, 16).replace('T', ' ')
        };

        var sheets = wb.SheetNames.map(function (n) { return analyzeSheet(n, wb.Sheets[n], meta); });
        if (!sheets.some(function (s) { return !s.empty; })) {
          throw new Error('No readable data rows were found in any sheet. SheetSnap needs at least one row of column titles and one row of data.');
        }

        var model = { meta: meta, sheets: sheets, consol: consolidate(sheets) };
        state.model = model;

        var out = $('report');
        out.innerHTML = '';
        renderPage1(out, model);
        renderPage2(out, model);

        $('screenStart').hidden = true;
        $('screenReport').hidden = false;
        window.scrollTo(0, 0);
      } catch (err) {
        btn.disabled = false;
        $('runHint').textContent = 'Something went wrong.';
        showError('Could not summarize this file.',
          String(err && err.message ? err.message : err),
          ['The file really is a spreadsheet (.xlsx, .xls, .xlsm or .csv).',
           'It is not password-protected.',
           'It has a row of column titles with data underneath them.']);
      }
    };
    reader.readAsArrayBuffer(state.file);
  }

  /* file picking */
  var drop = $('drop');
  drop.addEventListener('click', function () { $('fileInput').click(); });
  drop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fileInput').click(); }
  });
  $('fileInput').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  $('clearBtn').addEventListener('click', function () { setFile(null); });
  $('runBtn').addEventListener('click', run);
  $('printBtn').addEventListener('click', function () { window.print(); });
  $('xlsxBtn').addEventListener('click', function () {
    try { exportXlsx(state.model); }
    catch (err) { alert('Could not build the Excel file: ' + err.message); }
  });
  $('againBtn').addEventListener('click', function () {
    $('screenReport').hidden = true;
    $('screenStart').hidden = false;
    $('report').innerHTML = '';
    setFile(null);
    window.scrollTo(0, 0);
  });

  /* theme toggle, remembered on this computer only */
  var THEME_KEY = 'sheetsnap.theme';
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  try { applyTheme(localStorage.getItem(THEME_KEY)); } catch (e) { /* storage blocked - fine */ }
  $('themeBtn').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    var dark = cur ? cur === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  });

  /* expose for the test harness */
  window.SheetSnap = { analyzeSheet: analyzeSheet, consolidate: consolidate };
})();
