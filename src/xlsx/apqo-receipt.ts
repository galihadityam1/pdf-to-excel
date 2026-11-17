import JSZip from 'jszip';
import type { ApqoForm } from '../document-types';
import { excelDate, romanMonth } from '../calculations';
import { apqoInvoiceProblem } from './apqo-invoice';
import { terbilang } from './receipt';
import { base64ToBytes, replaceCell } from './xml';

export async function createApqoReceipt(template: string, form: ApqoForm): Promise<Blob> {
  const problem = apqoInvoiceProblem(form);
  if (problem) throw new Error(problem);
  const subtotal = form.fees.reduce((sum, fee) => sum + fee.quantity * fee.price, 0);
  const stage = subtotal * form.invoice.stagePercent / 100;
  const amount = Math.round(stage + stage * form.invoice.taxPercent / 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Nominal kwitansi harus lebih dari nol dan dalam batas angka yang valid.');
  const count = form.fees.reduce((sum, fee) => sum + fee.quantity, 0);
  const year = form.invoice.date.slice(0, 4);
  const zip = await JSZip.loadAsync(base64ToBytes(template));
  let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('text');
  const values: Record<string, string | number> = {
    L1: `${form.invoice.number.trim()}/APQO/WKM/${romanMonth(form.invoice.date)}/${year}`,
    E4: form.company.trim().toUpperCase(),
    E7: terbilang(amount),
    E11: `Pendaftaran peserta : ${count} orang`,
    L18: excelDate(form.invoice.date),
    A20: amount,
  };
  for (const [reference, value] of Object.entries(values)) {
    const existing = sheet.match(new RegExp(`<c r="${reference}"[^>]*`))?.[0];
    if (!existing) throw new Error(`Sel template kwitansi ${reference} tidak ditemukan.`);
    sheet = replaceCell(sheet, reference, Number(existing.match(/\bs="(\d+)"/)?.[1] ?? 0), value);
  }
  zip.file('xl/worksheets/sheet1.xml', sheet);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
