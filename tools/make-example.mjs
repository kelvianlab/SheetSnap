/* Generates examples/sample-sales-orders.xlsx - the workbook used in the README
   walkthrough and by tools/smoke-test.mjs.

   The shape is the one most real workbooks actually have: one tab per month.
   A small business records customer orders, and the quarter is read by opening
   three tabs and adding them up by hand - which is the job SheetSnap does.

   It is also the test fixture, so it deliberately contains the awkward things
   real files contain:
     - a two-row title block above the header in January, one row in February,
       none at all in March, so header detection has to earn its keep
     - a Discount (%) column that only starts in February, which also shifts
       every later column one letter across - consolidation therefore has to
       match on column name, never on position
     - money, quantity, per-unit price, duration and percentage columns, so all
       four aggregation behaviours appear in the report
     - January has only four numeric columns, so the fifth metric falls back to
       a structural one
     - a notes tab with no table at all, which must be skipped, not invented

   Totals are gross (Qty x Unit Price) and the discount is kept in its own
   column, so every figure in the report can be checked by hand against this
   source data. */
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const d = (s) => new Date(s + 'T00:00:00Z');

/* January: no Discount column yet. */
const HEAD_JAN = ['Order ID', 'Customer', 'City', 'Channel', 'Order Date', 'Qty',
  'Unit Price (IDR)', 'Total Amount (IDR)', 'Delivery Days', 'Payment Method', 'Status'];

/* February onwards: Discount (%) was added, shifting the later columns. */
const HEAD_FEB = ['Order ID', 'Customer', 'City', 'Channel', 'Order Date', 'Qty',
  'Unit Price (IDR)', 'Total Amount (IDR)', 'Discount (%)', 'Delivery Days',
  'Payment Method', 'Status'];

const january = [
  ['NUSANTARA SUPPLY CO.'],
  ['Customer Orders - January 2026'],
  [],
  HEAD_JAN,
  ['ORD-1001', 'Siti Rahayu',      'Jakarta',  'Online',    d('2026-01-06'),  3,  450000,  1350000, 3, 'Bank Transfer', 'Delivered'],
  ['ORD-1002', 'Budi Santoso',     'Bandung',  'Retail',    d('2026-01-09'),  1, 1250000,  1250000, 4, 'Credit Card',   'Delivered'],
  ['ORD-1003', 'Toko Makmur Jaya', 'Bekasi',   'Wholesale', d('2026-01-14'), 40,  245000,  9800000, 6, 'Bank Transfer', 'Delivered'],
  ['ORD-1004', 'Dewi Lestari',     'Surabaya', 'Online',    d('2026-01-20'),  5,  320000,  1600000, 5, 'E-Wallet',      'Delivered'],
  ['ORD-1005', 'Hendra Gunawan',   'Semarang', 'Retail',    d('2026-01-23'),  2,  680000,  1360000, 1, 'Cash',          'Delivered'],
  ['ORD-1006', 'Siti Rahayu',      'Jakarta',  'Online',    d('2026-01-29'),  2,  450000,   900000, 3, 'Bank Transfer', 'Delivered'],
];

const february = [
  ['Customer Orders - February 2026'],
  [],
  HEAD_FEB,
  ['ORD-1007', 'Maya Putri',       'Yogyakarta', 'Retail',    d('2026-02-03'),  3, 540000, 1620000, 12, 1, 'Debit Card',    'Delivered'],
  ['ORD-1008', 'CV Sumber Rejeki', 'Tangerang',  'Wholesale', d('2026-02-07'), 25, 250000, 6250000, 18, 5, 'Bank Transfer', 'Delivered'],
  ['ORD-1009', 'Andi Pratama',     'Medan',      'Online',    d('2026-02-12'),  4, 275000, 1100000,  0, 7, 'COD',           'Delivered'],
  ['ORD-1010', 'Hendra Gunawan',   'Semarang',   'Retail',    d('2026-02-18'),  1, 680000,  680000,  8, 2, 'Cash',          'Delivered'],
  ['ORD-1011', 'Dewi Lestari',     'Surabaya',   'Online',    d('2026-02-24'),  6, 320000, 1920000, 15, 5, 'E-Wallet',      'Shipped'],
  ['ORD-1012', 'Tono Saputra',     'Solo',       'Retail',    d('2026-02-27'),  4, 395000, 1580000,  5, 2, 'Debit Card',    'Shipped'],
];

const march = [
  HEAD_FEB,
  ['ORD-1013', 'Toko Makmur Jaya', 'Bekasi',     'Wholesale', d('2026-03-04'), 60,  240000, 14400000, 22, 8, 'Bank Transfer', 'Delivered'],
  ['ORD-1014', 'Rina Wijaya',      'Jakarta',    'Online',    d('2026-03-10'),  2, 1250000,  2500000,  5, 4, 'Credit Card',   'Shipped'],
  ['ORD-1015', 'Maya Putri',       'Yogyakarta', 'Retail',    d('2026-03-16'),  2,  540000,  1080000, 12, 1, 'Cash',          'Shipped'],
  ['ORD-1016', 'Lina Kusuma',      'Magelang',   'Retail',    d('2026-03-23'),  5,  310000,  1550000,  0, 3, 'Debit Card',    'Processing'],
  ['ORD-1017', 'UD Berkah Abadi',  'Depok',      'Wholesale', d('2026-03-30'), 30,  250000,  7500000, 18, 6, 'Bank Transfer', 'Processing'],
];

const notes = [
  ['Notes'],
  ['This tab is intentionally almost empty, to show that SheetSnap skips a sheet with no data table instead of inventing numbers for it.'],
];

const wb = XLSX.utils.book_new();
const add = (rows, name) =>
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);

add(january,  'January');
add(february, 'February');
add(march,    'March');
add(notes,    'Notes');

writeFileSync(new URL('../examples/sample-sales-orders.xlsx', import.meta.url),
  XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
console.log('wrote examples/sample-sales-orders.xlsx');
