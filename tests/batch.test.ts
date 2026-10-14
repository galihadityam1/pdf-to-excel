import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createBatchZip } from '../src/batch-download';
import { fileKey, MAX_BATCH_FILES, nextBatchNumber, repeatedInvoiceNumbers, workbookName } from '../src/batch';
import { parsePdfItems } from '../src/pdf-parser';
import { emptyForm } from '../src/types';

const entry = (invoiceNo: number) => ({ form: emptyForm(invoiceNo) });

describe('batch rules', () => {
  it('limits a batch to ten documents and identifies the same selected file', () => {
    expect(MAX_BATCH_FILES).toBe(10);
    expect(fileKey({ name: 'form.pdf', size: 100, lastModified: 123 })).toBe(fileKey({ name: 'form.pdf', size: 100, lastModified: 123 }));
    expect(fileKey({ name: 'form.pdf', size: 101, lastModified: 123 })).not.toBe(fileKey({ name: 'form.pdf', size: 100, lastModified: 123 }));
  });

  it('assigns the next unused number and finds manual duplicates', () => {
    expect(nextBatchNumber([entry(225), entry(227)], 226)).toBe(228);
    expect(nextBatchNumber([], 230)).toBe(230);
    expect(repeatedInvoiceNumbers([entry(225), entry(226), entry(225)])).toEqual([225]);
  });

  it('keeps invoice and receipt names separate', () => {
    const form = { ...emptyForm(225), company: 'PT Contoh / Jakarta' };
    expect(workbookName(form, 'invoice')).toBe('225 PT CONTOH JAKARTA.xlsx');
    expect(workbookName(form, 'receipt')).toBe('225 kwitansi PT CONTOH JAKARTA.xlsx');
  });

  it('reads the source total from the Total Biaya row', () => {
    const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });
    const items = Array.from({ length: 12 }, (_, index) => item(`Baris ${index}`, 50, 600 - index * 10));
    items.push(item('TOTAL BIAYA (Rp.)', 355, 421), item('Rp', 423, 421), item('40,182,000', 486, 421));
    expect(parsePdfItems(items, 225).sourceTotal).toBe(40182000);
  });

  it('creates separate ZIP archives with one complete XLSX per form', async () => {
    const first = { ...emptyForm(225), company: 'PT Satu' };
    const second = { ...emptyForm(226), company: 'PT Dua' };
    for (const kind of ['invoice', 'receipt'] as const) {
      const archive = await JSZip.loadAsync(await (await createBatchZip(kind, [first, second])).arrayBuffer());
      const names = Object.keys(archive.files);
      expect(names).toEqual([workbookName(first, kind), workbookName(second, kind)]);
      const workbook = await JSZip.loadAsync(await archive.file(names[0])!.async('uint8array'));
      expect(workbook.file('xl/workbook.xml')).toBeTruthy();
      expect(workbook.file('xl/worksheets/sheet1.xml')).toBeTruthy();
    }
  });
});
