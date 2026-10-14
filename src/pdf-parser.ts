import { emptyForm, FormData, Participant } from './types';

type PdfItem = { str: string; transform: number[] };
type Row = { y: number; items: { x: number; text: string }[]; text: string };
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const number = (value: string) => Number(value.replace(/[^0-9]/g, '')) || 0;

function rows(items: PdfItem[]): Row[] {
  const result: Row[] = [];
  for (const item of items) {
    const text = clean(item.str); if (!text) continue;
    const x = item.transform[4], y = item.transform[5];
    let row = result.find((candidate) => Math.abs(candidate.y - y) < 2.5);
    if (!row) { row = { y, items: [], text: '' }; result.push(row); }
    row.items.push({ x, text });
  }
  return result.sort((a, b) => b.y - a.y).map((row) => ({ ...row, items: row.items.sort((a,b) => a.x-b.x), text: row.items.sort((a,b) => a.x-b.x).map((item) => item.text).join(' ') }));
}

function valueFor(source: Row[], label: string) {
  const row = source.find((candidate) => candidate.text.toLowerCase().includes(label.toLowerCase()));
  if (!row) return '';
  const index = row.items.findIndex((item) => item.text.toLowerCase().includes(label.toLowerCase()));
  return clean(row.items.slice(index + 1).map((item) => item.text).join(' ').replace(/^:\s*/, ''));
}

export async function parsePdf(file: File, invoiceNo: number): Promise<FormData> {
  const pdfjs = (window as Window & { pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string }; getDocument: (source: { data: Uint8Array }) => { promise: Promise<{ getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>; destroy: () => Promise<void> }> } } }).pdfjsLib;
  if (!pdfjs) throw new Error('Komponen pembaca PDF belum siap. Coba pilih berkas sekali lagi.');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return parsePdfItems(content.items as PdfItem[], invoiceNo);
  } finally {
    await pdf.destroy();
  }
}

export function parsePdfItems(items: PdfItem[], invoiceNo: number): FormData {
  const source = rows(items);
  if (source.length < 12) throw new Error('PDF tidak memiliki text layer yang dapat dibaca. Gunakan PDF digital, bukan hasil scan.');
  const form = emptyForm(invoiceNo);
  form.company = valueFor(source, 'Nama Perusahaan'); form.pic = valueFor(source, 'Nama PIC');
  form.npwp = valueFor(source, 'NPWP Perusahaan'); form.npwpAddress = valueFor(source, 'Alamat NPWP');
  form.deliveryAddress = valueFor(source, 'Alamat Pengiriman Invoice'); form.phone = valueFor(source, 'No. Telp / HP'); form.email = valueFor(source, 'Email');
  const totalRow = source.find((candidate) => /TOTAL BIAYA/i.test(candidate.text));
  form.sourceTotal = totalRow?.items.filter((item) => item.x > 450).map((item) => number(item.text)).find(Boolean) ?? null;
  const feeRows = [
    ['individu', 'Individu'], ['tim', 'Tim >'], ['peninjau', 'Peserta Peninjau'], ['qsi', 'Quality Strategic'], ['gala', 'Gala Dinner'],
  ] as const;
  for (const [key, label] of feeRows) {
    const row = source.find((candidate) => candidate.text.includes(label)); if (!row) continue;
    const fee = form.fees.find((candidate) => candidate.key === key)!;
    const nearby = source.filter((candidate) => Math.abs(candidate.y - row.y) < 3).flatMap((candidate) => candidate.items);
    fee.quantity = nearby.filter((item) => item.x > 365 && item.x < 420).map((item) => number(item.text)).find(Boolean) ?? 0;
    fee.total = nearby.filter((item) => item.x > 450).map((item) => number(item.text)).find(Boolean) ?? 0;
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
