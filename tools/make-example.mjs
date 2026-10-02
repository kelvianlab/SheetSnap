/* Generates examples/sample-sales-orders.xlsx - a realistic 3-sheet workbook
   used in the README walkthrough and by tools/smoke-test.mjs.

   The scenario is deliberately ordinary: a small business tracking customer
   orders across three sales channels. It is the shape most people's
   spreadsheets actually have, and it exercises every part of the engine:
     - a title block above the header row on one sheet, none on another
     - money, quantity, weight, per-unit price, duration and percentage columns
     - customer, city, date, payment and status columns for the 5W1H panel
     - a third sheet missing two of the columns, so consolidation has to match
       on column name rather than position
     - a notes tab with no table at all, which must be skipped
   Totals are gross (Qty x Unit Price); the discount column is kept separate so
   every figure in the report can be checked by hand. */
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const d = (s) => new Date(s + 'T00:00:00Z');

const HEAD = ['Order ID', 'Customer', 'City', 'Order Date', 'Qty',
  'Unit Price (IDR)', 'Total Amount (IDR)', 'Discount (%)', 'Delivery Days',
  'Weight (kg)', 'Payment Method', 'Status'];

/* Two title rows and a blank one sit above the header, the way a real
   exported report looks. The header lands on row 4. */
const online = [
  ['NUSANTARA SUPPLY CO.'],
  ['Customer Orders - Online Store'],
  [],
  HEAD,
  ['ORD-1001', 'Siti Rahayu',  'Jakarta',  d('2026-01-08'), 3,  450000, 1350000, 10, 3, 2.4, 'Bank Transfer', 'Delivered'],
  ['ORD-1002', 'Budi Santoso', 'Bandung',  d('2026-01-15'), 1, 1250000, 1250000,  5, 4, 1.1, 'Credit Card',   'Delivered'],
  ['ORD-1003', 'Dewi Lestari', 'Surabaya', d('2026-01-23'), 5,  320000, 1600000, 15, 5, 4.0, 'E-Wallet',      'Delivered'],
  ['ORD-1004', 'Siti Rahayu',  'Jakarta',  d('2026-02-04'), 2,  450000,  900000, 10, 3, 1.6, 'Bank Transfer', 'Shipped'],
  ['ORD-1005', 'Andi Pratama', 'Medan',    d('2026-02-19'), 4,  275000, 1100000,  0, 7, 3.2, 'COD',           'Shipped'],
  ['ORD-1006', 'Dewi Lestari', 'Surabaya', d('2026-03-02'), 6,  320000, 1920000, 15, 5, 4.8, 'E-Wallet',      'Processing'],
  ['ORD-1007', 'Rina Wijaya',  'Jakarta',  d('2026-03-18'), 2, 1250000, 2500000,  5, 4, 2.2, 'Credit Card',   'Processing'],
];

/* One title row, header on row 3. */
const retail = [
  ['Customer Orders - Retail Branch'],
  [],
  HEAD,
  ['ORD-2001', 'Hendra Gunawan', 'Semarang',   d('2026-01-11'), 2, 680000, 1360000,  8, 1, 1.8, 'Cash',       'Delivered'],
  ['ORD-2002', 'Maya Putri',     'Yogyakarta', d('2026-01-29'), 3, 540000, 1620000, 12, 1, 2.7, 'Debit Card', 'Delivered'],
  ['ORD-2003', 'Hendra Gunawan', 'Semarang',   d('2026-02-13'), 1, 680000,  680000,  8, 2, 0.9, 'Cash',       'Delivered'],
  ['ORD-2004', 'Tono Saputra',   'Solo',       d('2026-02-27'), 4, 395000, 1580000,  5, 2, 3.6, 'Debit Card', 'Shipped'],
  ['ORD-2005', 'Maya Putri',     'Yogyakarta', d('2026-03-12'), 2, 540000, 1080000, 12, 1, 1.8, 'Cash',       'Shipped'],
  ['ORD-2006', 'Lina Kusuma',    'Magelang',   d('2026-03-26'), 5, 310000, 1550000,  0, 3, 4.5, 'Debit Card', 'Processing'],
];

/* No title block at all, and no Unit Price or Weight columns - consolidation
   has to line these up with the other sheets by column name. */
const wholesale = [
  ['Order ID', 'Customer', 'City', 'Order Date', 'Qty', 'Total Amount (IDR)',
   'Discount (%)', 'Delivery Days', 'Payment Method', 'Status'],
  ['ORD-3001', 'Toko Makmur Jaya',  'Bekasi',    d('2026-01-20'), 40,  9800000, 20, 6, 'Bank Transfer', 'Delivered'],
  ['ORD-3002', 'CV Sumber Rejeki',  'Tangerang', d('2026-02-10'), 25,  6250000, 18, 5, 'Bank Transfer', 'Delivered'],
  ['ORD-3003', 'Toko Makmur Jaya',  'Bekasi',    d('2026-03-05'), 60, 14400000, 22, 8, 'Bank Transfer', 'Shipped'],
  ['ORD-3004', 'UD Berkah Abadi',   'Depok',     d('2026-03-30'), 30,  7500000, 18, 6, 'Bank Transfer', 'Processing'],
];

const notes = [
  ['Notes'],
  ['This tab is intentionally almost empty, to show that SheetSnap skips a sheet that has no data table instead of inventing numbers for it.'],
];

const wb = XLSX.utils.book_new();
const add = (rows, name) =>
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);

add(online, 'Online Store');
add(retail, 'Retail Branch');
add(wholesale, 'Wholesale');
add(notes, 'Notes');

writeFileSync(new URL('../examples/sample-sales-orders.xlsx', import.meta.url),
  XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
console.log('wrote examples/sample-sales-orders.xlsx');
