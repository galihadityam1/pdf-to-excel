import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { parsePdfItems } from '../src/pdf-parser';
import { invoiceTemplate, receiptTemplate } from '../src/templates.generated';
import { createInvoice } from '../src/xlsx/invoice';
import { createReceipt } from '../src/xlsx/receipt';

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) throw new Error('Berikan path PDF contoh sebagai argumen.');
  const source = new Uint8Array(await readFile(pdfPath));
  const pdf = await pdfjs.getDocument({ data: source }).promise;
  const items = (await (await pdf.getPage(1)).getTextContent()).items;
  const form = parsePdfItems(items as { str: string; transform: number[] }[], 225);
  form.date = '2026-10-14';
  if (form.fees.find((fee) => fee.key === 'tim')?.total !== 30000000 || form.fees.find((fee) => fee.key === 'peninjau')?.total !== 6200000) {
    throw new Error('Angka formulir contoh tidak cocok dengan ekspektasi.');
  }
  await mkdir('hasil-uji', { recursive: true });
  await writeFile('hasil-uji/225 PT SUMBERDAYA ARINDO.xlsx', Buffer.from(await (await createInvoice(invoiceTemplate, form)).arrayBuffer()));
  await writeFile('hasil-uji/225 kwitansi PT SUMBERDAYA ARINDO.xlsx', Buffer.from(await (await createReceipt(receiptTemplate, form)).arrayBuffer()));
}

void main();
