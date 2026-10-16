import { emptyForm, type FormData, type Participant } from '../types';
import type { PdfRow } from './tokens';
import { cleanText } from './tokens';

const numberValue = (value: string) => Number(value.replace(/[^0-9]/g, '')) || 0;

function valueFor(source: PdfRow[], label: string) {
  const row = source.find((candidate) => candidate.text.toLowerCase().includes(label.toLowerCase()));
  if (!row) return '';
  const labelEnd = row.items.findIndex((item) => item.text.toLowerCase().includes(label.toLowerCase()));
  return cleanText(row.items.slice(labelEnd + 1).map((item) => item.text).join(' ').replace(/^:\s*/, ''));
}

export function parseIndonesia(source: PdfRow[], invoiceNo: number): FormData {
  const form = emptyForm(invoiceNo);
  form.company = valueFor(source, 'Nama Perusahaan');
  form.pic = valueFor(source, 'Nama PIC');
  form.npwp = valueFor(source, 'NPWP Perusahaan');
  form.npwpAddress = valueFor(source, 'Alamat NPWP');
  form.deliveryAddress = valueFor(source, 'Alamat Pengiriman Invoice');
  form.phone = valueFor(source, 'No. Telp / HP');
  form.email = valueFor(source, 'Email');

  const totalRow = source.find((candidate) => /TOTAL BIAYA/i.test(candidate.text));
  form.sourceTotal = totalRow?.items
    .filter((item) => item.x > 450)
    .map((item) => numberValue(item.text))
    .find(Boolean) ?? null;

  const feeRows = [
    ['individu', 'Individu'],
    ['tim', 'Tim >'],
    ['peninjau', 'Peserta Peninjau'],
    ['qsi', 'Quality Strategic'],
    ['gala', 'Gala Dinner'],
  ] as const;

  for (const [key, label] of feeRows) {
    const row = source.find((candidate) => candidate.text.includes(label));
    if (!row) continue;
    const fee = form.fees.find((candidate) => candidate.key === key)!;
    const nearby = source.filter((candidate) => Math.abs(candidate.y - row.y) < 3).flatMap((candidate) => candidate.items);
    fee.quantity = nearby
      .filter((item) => item.x > 365 && item.x < 420)
      .map((item) => numberValue(item.text))
      .find(Boolean) ?? 0;
    fee.total = nearby
      .filter((item) => item.x > 450)
      .map((item) => numberValue(item.text))
      .find(Boolean) ?? 0;
  }

  const participants: Participant[] = [];
  for (const row of source.filter((candidate) => candidate.y < 390 && candidate.y > 220)) {
    const role = row.items.find((item) => /^(Penyaji|Peninjau)$/i.test(item.text))?.text;
    if (!role) continue;
    const name = row.items.find((item) => item.x > 200 && item.x < 350)?.text ?? '';
    const team = row.items.find((item) => item.x > 380 && item.x < 440)?.text ?? '';
    const shirt = row.items.find((item) => item.x > 445)?.text ?? '';
    participants.push({ role: role as Participant['role'], name, team, shirt });
  }
  form.participants = participants;
  return form;
}
