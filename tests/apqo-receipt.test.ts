import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { emptyApqoForm } from '../src/document-types';
import { createApqoReceiptWorkbook } from '../src/batch-download';
import { apqoReceiptWorkbookName } from '../src/batch';

function sample() {
  const form = emptyApqoForm();
  form.company = 'Daya Group';
  form.address = 'Jl. Raya Cibeureum No. 26 Bandung';
  form.invoice = { number: '162', date: '2026-09-01', stagePercent: 100, taxPercent: 11 };
  form.fees[1] = { role: 'Observer', quantity: 1, price: 6_500_000, total: 6_500_000 };
  return form;
}

async function read(form = sample()) {
  const blob = await createApqoReceiptWorkbook(form);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return { zip, sheet: await zip.file('xl/worksheets/sheet1.xml')!.async('text') };
}

describe('APQO receipt', () => {
  it('fills the supplied layout with full payment, date, number and matching amount words', async () => {
    const { zip, sheet } = await read();
    expect(sheet).toContain('162/APQO/WKM/IX/2026');
    expect(sheet).toContain('DAYA GROUP');
    expect(sheet).toContain('Pendaftaran peserta : 1 orang');
    expect(sheet).toMatch(/<c r="L18"[^>]*><v>46266<\/v>/);
    expect(sheet).toMatch(/<c r="A20"[^>]*><v>7215000<\/v>/);
    expect(sheet).toContain('#Tujuh Juta Dua Ratus Lima Belas Ribu Rupiah#');
    expect(sheet).toContain('Bali, 26 - 29 October 2026');
    expect(sheet).toContain('Indah Budiwati');
    expect(sheet).not.toContain('<f>');
    expect(await zip.file('xl/workbook.xml')!.async('text')).toContain('kwitansi!$A$1:$M$22');
    expect(Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))).toHaveLength(1);
    const allXml = (await Promise.all(Object.values(zip.files).filter((file) => file.name.endsWith('.xml')).map((file) => file.async('text')))).join('');
    expect(allXml).not.toMatch(/KRAKATAU|PERTAMINA|CAKRABAWA|#REF!|33000000|Sheet1!/);
    expect(zip.file('xl/sharedStrings.xml')).toBeNull();
    expect(zip.file('docProps/thumbnail.emf')).toBeNull();
  });

  it('uses the selected partial payment and tax, and counts fee quantities rather than list length', async () => {
    const form = sample();
    form.fees[0] = { role: 'Presenter', quantity: 4, price: 6_000_000, total: 0 };
    form.invoice.stagePercent = 50;
    const { sheet } = await read(form);
    expect(sheet).toContain('Pendaftaran peserta : 5 orang');
    expect(sheet).toMatch(/<c r="A20"[^>]*><v>16927500<\/v>/);
    expect(sheet).toContain('#Enam Belas Juta Sembilan Ratus Dua Puluh Tujuh Ribu Lima Ratus Rupiah#');
    form.invoice.taxPercent = 0;
    expect((await read(form)).sheet).toMatch(/<c r="A20"[^>]*><v>15250000<\/v>/);
  });

  it('rounds once so the numeric and written amounts agree and escapes organization text', async () => {
    const form = sample();
    form.company = 'A & B <Group>';
    form.fees[1].price = 1001;
    form.invoice.stagePercent = 50;
    const { sheet } = await read(form);
    expect(sheet).toContain('A &amp; B &lt;GROUP&gt;');
    expect(sheet).toMatch(/<c r="A20"[^>]*><v>556<\/v>/);
    expect(sheet).toContain('#Lima Ratus Lima Puluh Enam Rupiah#');
    expect(apqoReceiptWorkbookName(' 162 ', 'A/B')).toBe('162 kwitansi APQO A B.xlsx');
  });

  it('rejects missing numbers, invalid dates and invalid amounts before download', async () => {
    const form = sample();
    form.invoice.number = '';
    await expect(read(form)).rejects.toThrow(/nomor invoice/);
    form.invoice.number = '162';
    form.invoice.date = '2026-02-31';
    await expect(read(form)).rejects.toThrow(/tanggal invoice/);
    form.invoice.date = '2026-09-01';
    form.fees[1].quantity = -1;
    await expect(read(form)).rejects.toThrow(/jumlah peserta/);
    form.fees[1].quantity = 1;
    form.fees[1].price = Number.MAX_VALUE;
    await expect(read(form)).rejects.toThrow(/Nominal kwitansi/);
  });
});
