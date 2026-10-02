/* Generates examples/sample-procurement.xlsx - a realistic 3-sheet file
   used in the README walkthrough and by tools/smoke-test.mjs. */
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const d = (s) => new Date(s + 'T00:00:00Z');

const chiller = [
  ['PT SEJAHTERA ENGINEERING'], ['Purchase Order Recap - Chiller Units'], [],
  ['PO No','Vendor','Site Location','PO Date','Qty (Unit)','Unit Price (IDR)','Total Price (IDR)','Discount (%)','Lead Time (Days)','Capacity (TR)','Payment Term','Status','Remarks'],
  ['PO-2401','Carrier Indonesia','Jakarta - Rooftop',d('2026-01-12'),2,1850000000,3700000000,7.5,95,350,'30/70 LC','Delivered','Main plant chiller'],
  ['PO-2402','Trane Asia','Jakarta - Rooftop',d('2026-01-28'),1,1620000000,1620000000,5,110,300,'30/70 LC','Delivered','Backup unit'],
  ['PO-2403','Daikin Applied','Surabaya - Basement',d('2026-02-09'),3,1240000000,3720000000,10,80,250,'50/50','In Transit','Phase 2 expansion'],
  ['PO-2404','Carrier Indonesia','Surabaya - Basement',d('2026-02-22'),1,1850000000,1850000000,6,95,350,'30/70 LC','In Transit',null],
  ['PO-2405','York Johnson Controls','Bandung - Plant',d('2026-03-05'),2,1410000000,2820000000,8,120,280,'Cash','Ordered','Spec per mech drawing'],
  ['PO-2406','Daikin Applied','Bandung - Plant',d('2026-03-19'),1,1240000000,1240000000,10,80,250,'50/50','Ordered',null],
  ['PO-2407','Trane Asia','Jakarta - Rooftop',d('2026-04-02'),2,1620000000,3240000000,4.5,110,300,'30/70 LC','Ordered','Client-nominated'],
];

const ahu = [
  ['Air Handling Unit - Technical Evaluation & PO'], [],
  ['PO No','Supplier','Area','PO Date','Qty (Unit)','Unit Price (IDR)','Total Price (IDR)','Discount (%)','Lead Time (Days)','Capacity (CMH)','Payment Term','Status'],
  ['PO-2410','Fantech Indonesia','Tower A - Floor 3',d('2026-01-20'),6,142000000,852000000,12,45,12000,'Net 30','Delivered'],
  ['PO-2411','Systemair','Tower A - Floor 7',d('2026-02-03'),4,168000000,672000000,9,60,15000,'Net 30','Delivered'],
  ['PO-2412','Fantech Indonesia','Tower B - Floor 2',d('2026-02-17'),8,142000000,1136000000,12,45,12000,'Net 30','In Transit'],
  ['PO-2413','Kruger Ventilation','Tower B - Floor 9',d('2026-03-10'),5,131000000,655000000,15,52,10500,'Net 45','Ordered'],
  ['PO-2414','Systemair','Tower C - Rooftop',d('2026-03-24'),3,168000000,504000000,9,60,15000,'Net 30','Ordered'],
  ['PO-2415','Fantech Indonesia','Tower C - Floor 5',d('2026-04-07'),7,142000000,994000000,12,45,12000,'Net 30','Ordered'],
];

const pumps = [
  ['PO No','Vendor','Site Location','PO Date','Qty (Unit)','Total Price (IDR)','Discount (%)','Lead Time (Days)','Capacity (kW)','Payment Term','Status'],
  ['PO-2420','Grundfos Indonesia','Jakarta - Basement',d('2026-01-15'),4,428000000,6,35,45,'Net 30','Delivered'],
  ['PO-2421','Ebara Pumps','Surabaya - Pump Room',d('2026-02-11'),6,512000000,8,40,55,'Net 30','Delivered'],
  ['PO-2422','Grundfos Indonesia','Bandung - Pump Room',d('2026-03-02'),3,321000000,6,35,45,'Net 30','In Transit'],
  ['PO-2423','Wilo Asia','Jakarta - Basement',d('2026-03-28'),5,389000000,11,48,37,'Net 45','Ordered'],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chiller, { cellDates: true }), 'Chiller Units');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ahu, { cellDates: true }), 'AHU Units');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pumps, { cellDates: true }), 'Pumps');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'],['This tab is intentionally almost empty, to show that SheetSnap skips sheets with no data table.']]), 'Notes');

writeFileSync(new URL('../examples/sample-procurement.xlsx', import.meta.url),
  XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
console.log('wrote examples/sample-procurement.xlsx');
