import JSZip from 'jszip';
import type { ApqoForm } from '../document-types';
import { base64ToBytes, replaceCell, replaceFormulaCell } from './xml';

type Line = { team: string; quantity: number; price: number };

function invoiceLines(form: ApqoForm): Line[] {
  const presenter = form.fees.find((fee) => fee.role === 'Presenter')!;
  const teams = new Map<string, number>();
  for (const participant of form.participants.filter((item) => item.role === 'Presenter')) {
    const name = participant.team.trim().toUpperCase();
    if (name) teams.set(name, (teams.get(name) ?? 0) + 1);
  }
  const known = [...teams.values()].reduce((sum, quantity) => sum + quantity, 0);
  if (known > presenter.quantity) throw new Error('Jumlah penyaji dalam daftar melebihi jumlah pada biaya registrasi.');
  const lines = [...teams].map(([team, quantity]) => ({ team, quantity, price: presenter.price }));
  if (presenter.quantity > known) lines.push({
    team: 'TIM BELUM DIISI', quantity: presenter.quantity - known, price: presenter.price,
  });
  return lines;
}

export function apqoInvoiceProblem(form: ApqoForm): string {
  if (!form.company.trim()) return 'Isi organisasi penerima invoice APQO.';
  if (!form.address.trim()) return 'Isi alamat organisasi penerima invoice APQO.';
  if (!/^\d+$/.test(form.invoice.number.trim()) || Number(form.invoice.number) < 1) return 'Isi nomor invoice APQO yang valid.';
  const [year, month, day] = form.invoice.date.split('-').map(Number);
  const date = new Date(`${form.invoice.date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.invoice.date) || Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return 'Isi tanggal invoice APQO yang valid.';
  if (!Number.isFinite(form.invoice.stagePercent) || form.invoice.stagePercent <= 0 || form.invoice.stagePercent > 100) return 'Tahap tagihan harus lebih dari 0% dan paling tinggi 100%.';
  if (!Number.isFinite(form.invoice.taxPercent) || form.invoice.taxPercent < 0 || form.invoice.taxPercent > 100) return 'PPN harus berada antara 0% dan 100%.';
  const billable = form.fees.filter((fee) => fee.quantity > 0);
  if (!billable.length || form.fees.some((fee) => !Number.isInteger(fee.quantity) || fee.quantity < 0 || !Number.isFinite(fee.price) || fee.price < 0 || (fee.quantity > 0 && fee.price === 0))) return 'Periksa biaya dan jumlah peserta APQO sebelum membuat invoice.';
  const presenter = form.fees.find((fee) => fee.role === 'Presenter')!;
  if (form.participants.filter((item) => item.role === 'Presenter' && item.team.trim()).length > presenter.quantity) {
    return 'Jumlah penyaji dalam daftar melebihi jumlah pada biaya registrasi.';
  }
  return '';
}

function rowXml(sheet: string, number: number): string {
  const row = sheet.match(new RegExp(`<row r="${number}"[^>]*>[\\s\\S]*?<\\/row>`))?.[0];
  if (!row) throw new Error(`Baris invoice APQO ${number} tidak ditemukan.`);
  return row;
}

function moveRow(row: string, target: number): string {
  const source = Number(row.match(/<row r="(\d+)"/)?.[1]);
  return row.replace(/<row r="\d+"/, `<row r="${target}"`)
    .replace(/<c r="([A-Z]+)\d+"/g, (_match, column) => `<c r="${column}${target}"`)
    .replace(/<f[^>]*>[\s\S]*?<\/f>/g, (formula) => formula.replace(/([A-Z]+)(\d+)/g, (_match, column, number) => `${column}${Number(number) + target - source}`));
}

function style(sheet: string, reference: string): number {
  const cell = sheet.match(new RegExp(`<c r="${reference}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`))?.[0];
  if (!cell) throw new Error(`Sel invoice APQO ${reference} tidak ditemukan.`);
  return Number(cell.match(/\bs="(\d+)"/)?.[1] ?? 0);
}

function put(sheet: string, reference: string, value: string | number): string {
  return replaceCell(sheet, reference, style(sheet, reference), value);
}

function formula(sheet: string, reference: string, expression: string, cached: number): string {
  return replaceFormulaCell(sheet, reference, style(sheet, reference), expression, cached);
}

function addressLines(address: string): string[] {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const part of parts) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]}, ${part}`.length <= 44) lines[last] += `, ${part}`;
    else lines.push(part);
  }
  return [lines[0] ?? '', lines[1] ?? '', lines.slice(2).join(', ')];
}

const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export async function createApqoInvoice(template: string, form: ApqoForm): Promise<Blob> {
  const problem = apqoInvoiceProblem(form);
  if (problem) throw new Error(problem);

  const lines = invoiceLines(form);
  const overflow = Math.max(0, lines.length - 3);
  const observerRow = 26 + overflow;
  const zip = await JSZip.loadAsync(base64ToBytes(template));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  let sheet = await zip.file(sheetPath)!.async('text');

  if (overflow) {
    const base = rowXml(sheet, 23);
    sheet = sheet.replace(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (row, number) => (
      Number(number) >= 26 ? moveRow(row, Number(number) + overflow) : row
    ));
    const extra = Array.from({ length: overflow }, (_, index) => moveRow(base, 26 + index)).join('');
    sheet = sheet.replace(rowXml(sheet, observerRow), `${extra}${rowXml(sheet, observerRow)}`);
    sheet = sheet.replace(/(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)(")/, (_match, start, end, close) => `${start}${Number(end) + overflow}${close}`);
    sheet = sheet.replace(/(<mergeCell ref=")([^"]+)(")/g, (_match, start, range, end) => (
      `${start}${range.replace(/([A-Z]+)(\d+)/g, (reference: string, column: string, number: string) => Number(number) >= 26 ? `${column}${Number(number) + overflow}` : reference)}${end}`
    ));
  }

  const date = new Date(`${form.invoice.date}T12:00:00`);
  const dateText = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(date);
  const numberText = `${form.invoice.number.trim()}/APQO/WKM/${romanMonths[date.getMonth()]}/${date.getFullYear()}`;
  sheet = put(sheet, 'J5', `: ${dateText}`);
  sheet = put(sheet, 'J6', `: ${numberText}`);
  sheet = put(sheet, 'B11', form.company.trim().toUpperCase());
  for (const [index, line] of addressLines(form.address).entries()) sheet = put(sheet, `B${12 + index}`, line);
  sheet = put(sheet, 'B19', '31st APQO International Conference & ACE TEAM COMPETITION 2026');

  for (let index = 0; index < 3 + overflow; index++) {
    const number = 23 + index;
    const line = lines[index];
    sheet = put(sheet, `C${number}`, line ? index + 1 : '');
    sheet = put(sheet, `D${number}`, line?.team ?? '');
    sheet = put(sheet, `H${number}`, line?.quantity ?? '');
    sheet = put(sheet, `J${number}`, line?.price ?? '');
    sheet = put(sheet, `I${number}`, line ? 'orang' : '');
    sheet = line ? formula(sheet, `K${number}`, `H${number}*J${number}`, line.quantity * line.price)
      : put(sheet, `K${number}`, '');
  }

  const observer = form.fees.find((fee) => fee.role === 'Observer')!;
  sheet = put(sheet, `B${observerRow}`, 'B.');
  sheet = put(sheet, `H${observerRow}`, observer.quantity || '');
  sheet = put(sheet, `J${observerRow}`, observer.quantity ? observer.price : '');
  sheet = put(sheet, `I${observerRow}`, observer.quantity ? 'orang' : '');
  sheet = observer.quantity ? formula(sheet, `K${observerRow}`, `H${observerRow}*J${observerRow}`, observer.quantity * observer.price)
    : put(sheet, `K${observerRow}`, '');

  const subtotal = form.fees.reduce((sum, fee) => sum + fee.quantity * fee.price, 0);
  const stage = subtotal * form.invoice.stagePercent / 100;
  const tax = stage * form.invoice.taxPercent / 100;
  sheet = formula(sheet, `K${28 + overflow}`, `SUM(K23:K${observerRow})`, subtotal);
  sheet = put(sheet, `J${29 + overflow}`, `Tahap 1=${form.invoice.stagePercent}%`);
  sheet = formula(sheet, `K${29 + overflow}`, `K${28 + overflow}*${form.invoice.stagePercent}%`, stage);
  sheet = formula(sheet, `K${30 + overflow}`, `K${29 + overflow}*${form.invoice.taxPercent}%`, tax);
  sheet = formula(sheet, `K${31 + overflow}`, `SUM(K${29 + overflow}:K${30 + overflow})`, stage + tax);
  sheet = sheet.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  sheet = sheet.replace(/(<pageMargins[^>]*\/>)/, '$1<pageSetup paperSize="9" fitToWidth="1" fitToHeight="1"/>');
  zip.file(sheetPath, sheet);

  let workbook = await zip.file('xl/workbook.xml')!.async('text');
  const printArea = `Sheet1!$B$4:$K$${43 + overflow}`;
  workbook = workbook.replace(/<calcPr\b/, `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${printArea}</definedName></definedNames><calcPr`);
  workbook = workbook.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>');
  zip.file('xl/workbook.xml', workbook);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
