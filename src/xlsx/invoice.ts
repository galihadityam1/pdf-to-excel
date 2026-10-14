import JSZip from 'jszip';
import { FormData } from '../types';
import { feeTotal, grandTotal, romanMonth, vat } from '../calculations';
import { base64ToBytes, replaceCell } from './xml';

type Detail = { kind: 'team' | 'category'; label: string; count: number; price: number; marker: string };
const dateLabel = (date: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(`${date}T12:00:00`));

function details(form: FormData): Detail[] {
  const result: Detail[] = [];
  const teamFee = form.fees.find((fee) => fee.key === 'tim')!;
  const teams = new Map<string, number>();
  for (const participant of form.participants.filter((item) => item.role === 'Penyaji')) {
    if (participant.team.trim()) teams.set(participant.team.trim(), (teams.get(participant.team.trim()) ?? 0) + 1);
  }
  if (teamFee.quantity && teams.size === 0) teams.set('BELUM DIISI', teamFee.quantity);
  for (const [name, count] of teams) result.push({ kind: 'team', label: `TIM ${name.toUpperCase()}`, count, price: teamFee.quantity ? teamFee.total / teamFee.quantity : 0, marker: `${result.length + 1}.` });
  const labels = [
    { key: 'individu', label: 'PENYAJI INDIVIDU' }, { key: 'peninjau', label: 'PENINJAU' },
    { key: 'qsi', label: 'QSI' }, { key: 'gala', label: 'GALA DINNER' },
  ] as const;
  for (const category of labels) {
    const fee = form.fees.find((item) => item.key === category.key)!;
    if (fee.quantity) result.push({ kind: 'category', label: category.label, count: fee.quantity, price: fee.total / fee.quantity, marker: `${String.fromCharCode(65 + result.filter((line) => line.kind === 'category').length + (teams.size ? 1 : 0))}.` });
  }
  return result;
}

function originalRow(sheet: string, number: number) {
  const found = sheet.match(new RegExp(`<row r="${number}"[^>]*>[\\s\\S]*?<\\/row>`));
  if (!found) throw new Error(`Baris template ${number} tidak ditemukan.`);
  return found[0];
}
function style(row: string, reference: string, fallback: number) {
  return Number(row.match(new RegExp(`<c r="${reference}" s="(\\d+)"`))?.[1] ?? fallback);
}
function clearCell(row: string, reference: string) {
  const pattern = new RegExp(`<c r="${reference}"[^>]*?\\/>|<c r="${reference}"[^>]*?>(?:[\\s\\S]*?)<\\/c>`);
  return row.replace(pattern, `<c r="${reference}" s="${style(row, reference, 0)}"/>`);
}
function setFormula(row: string, reference: string, formula: string, cache: number) {
  const pattern = new RegExp(`<c r="${reference}"[^>]*?\\/>|<c r="${reference}"[^>]*?>(?:[\\s\\S]*?)<\\/c>`);
  if (!pattern.test(row)) throw new Error(`Sel template ${reference} tidak ditemukan.`);
  return row.replace(pattern, `<c r="${reference}" s="${style(row, reference, 27)}"><f>${formula}</f><v>${cache}</v></c>`);
}
function setValue(row: string, reference: string, value: string | number) {
  return replaceCell(row, reference, style(row, reference, 3), value);
}
function writeDetail(row: string, number: number, detail?: Detail) {
  for (const column of ['B', 'C', 'D', 'G', 'H', 'I', 'J']) row = clearCell(row, `${column}${number}`);
  if (!detail) return row;
  if (detail.kind === 'team') {
    row = setValue(row, `C${number}`, detail.marker);
    row = setValue(row, `D${number}`, detail.label);
  } else {
    row = setValue(row, `B${number}`, detail.marker);
    row = setValue(row, `D${number}`, detail.label);
  }
  row = setValue(row, `G${number}`, detail.count);
  row = setValue(row, `H${number}`, 'orang');
  row = setValue(row, `I${number}`, detail.price);
  return setFormula(row, `J${number}`, `G${number}*I${number}`, detail.count * detail.price);
}
function shiftRow(row: string, offset: number) {
  return row
    .replace(/<row r="(\d+)"/, (_, number) => `<row r="${Number(number) + offset}"`)
    .replace(/<c r="([A-Z]+)(\d+)"/g, (_, column, number) => `<c r="${column}${Number(number) + offset}"`)
    .replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_, attrs, formula) => `<f${attrs}>${formula.replace(/(\$?[A-Z]+\$?)(\d+)/g, (_match: string, column: string, number: string) => `${column}${Number(number) >= 26 ? Number(number) + offset : number}`)}</f>`);
}
function shiftRange(reference: string, offset: number) {
  return reference.replace(/(\$?[A-Z]+\$?)(\d+)/g, (_, column, number) => `${column}${Number(number) >= 26 ? Number(number) + offset : number}`);
}

export async function createInvoice(template: string, form: FormData) {
  const zip = await JSZip.loadAsync(base64ToBytes(template));
  let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('text');
  const month = romanMonth(form.date), year = new Date(`${form.date}T12:00:00`).getFullYear();
  sheet = replaceCell(sheet, 'I3', 6, `: ${dateLabel(form.date)}`);
  sheet = replaceCell(sheet, 'I4', 8, `: ${form.invoiceNo}/TKMPN/WKM/${month}/${year}`);
  sheet = replaceCell(sheet, 'B9', 48, form.company);
  const billingAddress = form.npwpAddress.split(',').map((part) => part.trim()).filter(Boolean);
  for (let line = 0; line < 4; line++) sheet = replaceCell(sheet, `B${10 + line}`, 64, line === 3 ? billingAddress.slice(3).join(', ') : billingAddress[line] ?? '');
  const deliveryAddress = form.deliveryAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const deliveryLines = [
    [form.greeting, form.pic].filter(Boolean).join(' '), form.division, form.company,
    deliveryAddress[0] ?? '', deliveryAddress[1] ?? '', deliveryAddress.slice(2).join(', '), `No. Hp: ${form.phone}`,
  ];
  for (let line = 0; line < deliveryLines.length; line++) {
    const reference = `L${4 + line}`;
    sheet = replaceCell(sheet, reference, style(originalRow(sheet, 4 + line), reference, 65), deliveryLines[line]);
  }

  const lines = details(form), overflow = Math.max(0, lines.length - 4);
  const row21 = setValue(originalRow(sheet, 21), 'B21', 'A.');
  const original = [22, 23, 24, 25].map((number) => originalRow(sheet, number));
  const detailRows = original.map((row, index) => writeDetail(index === 3 && overflow ? shiftRow(original[0], 3) : row, 22 + index, lines[index]));
  for (let extra = 0; extra < overflow; extra++) {
    const number = 26 + extra;
    const base = extra === overflow - 1 ? shiftRow(original[3], number - 25) : shiftRow(original[0], number - 22);
    detailRows.push(writeDetail(base, number, lines[4 + extra]));
  }
  if (overflow) {
    sheet = sheet.replace(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (row, number) => Number(number) >= 26 ? shiftRow(row, overflow) : row);
    sheet = sheet.replace(/(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)(")/, (_, start, end, close) => `${start}${Number(end) + overflow}${close}`);
    sheet = sheet.replace(/(<mergeCell ref=")([^"]+)(")/g, (_, start, reference, close) => `${start}${shiftRange(reference, overflow)}${close}`);
    const drawingPath = 'xl/drawings/drawing1.xml';
    const drawing = await zip.file(drawingPath)!.async('text');
    zip.file(drawingPath, drawing.replace(/(<xdr:row>)(\d+)(<\/xdr:row>)/g, (_, start, number, end) => `${start}${Number(number) >= 25 ? Number(number) + overflow : number}${end}`));
  }
  sheet = sheet.replace(/<row r="21"[\s\S]*?<\/row>[\s\S]*?<row r="25"[\s\S]*?<\/row>/, `${row21}${detailRows.join('')}`);
  const summary = 26 + overflow;
  let summaryRow = originalRow(sheet, summary);
  summaryRow = setFormula(summaryRow, `G${summary}`, `SUM(G22:G${25 + overflow})`, lines.reduce((sum, line) => sum + line.count, 0));
  summaryRow = setFormula(summaryRow, `J${summary}`, `SUM(J21:J${25 + overflow})`, feeTotal(form));
  sheet = sheet.replace(originalRow(sheet, summary), summaryRow);
  const taxRow = originalRow(sheet, summary + 1);
  sheet = sheet.replace(taxRow, setFormula(taxRow, `J${summary + 1}`, `J${summary}*11%`, vat(form)));
  const totalRow = originalRow(sheet, summary + 2);
  sheet = sheet.replace(totalRow, setFormula(totalRow, `J${summary + 2}`, `SUM(J${summary}:J${summary + 1})`, grandTotal(form)));
  zip.file('xl/worksheets/sheet1.xml', sheet);

  zip.remove('xl/calcChain.xml');
  let workbook = await zip.file('xl/workbook.xml')!.async('text');
  if (overflow) workbook = workbook.replace(/(tkmpn!\$B\$1:\$J\$)(\d+)/, (_, start, end) => `${start}${Number(end) + overflow}`);
  workbook = workbook.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>');
  zip.file('xl/workbook.xml', workbook);
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('text');
  zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
  const types = await zip.file('[Content_Types].xml')!.async('text');
  zip.file('[Content_Types].xml', types.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
