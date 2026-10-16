import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { emptyApqoForm } from '../src/document-types';
import { apqoInvoiceTemplate } from '../src/templates.generated';
import { apqoInvoiceProblem, createApqoInvoice } from '../src/xlsx/apqo-invoice';

function sampleForm() {
  const form = emptyApqoForm();
  form.company = 'PT Samora Usaha Makmur';
  form.address = 'Jl. Thamrin, Jakarta Pusat, DKI Jakarta';
  form.invoice = { number: '143', date: '2026-10-16', stagePercent: 50, taxPercent: 11 };
  form.fees = [
    { role: 'Presenter', price: 6_000_000, quantity: 4, total: 24_000_000 },
    { role: 'Observer', price: 6_500_000, quantity: 1, total: 6_500_000 },
  ];
  form.participants = [
    { role: 'Presenter', salutation: 'Mr', name: 'A', team: 'Banyu Ireng' },
    { role: 'Presenter', salutation: 'Ms', name: 'B', team: 'Banyu Ireng' },
    { role: 'Presenter', salutation: 'Mr', name: 'C', team: 'Banyu Ireng' },
    { role: 'Presenter', salutation: 'Ms', name: 'D', team: 'Banyu Ireng' },
  ];
  return form;
}

describe('APQO invoice', () => {
  it('requires human supplied invoice number and valid billable fees', () => {
    const form = sampleForm();
    form.invoice.number = '';
    expect(apqoInvoiceProblem(form)).toMatch(/nomor invoice/i);
    form.invoice.number = '143';
    form.invoice.date = '2026-02-31';
    expect(apqoInvoiceProblem(form)).toMatch(/tanggal invoice/i);
    form.invoice.date = '2026-10-16';
    form.fees[0].quantity = 2;
    expect(apqoInvoiceProblem(form)).toMatch(/jumlah penyaji/i);
  });

  it('fills the client invoice with editable terms and matching totals', async () => {
    const output = await createApqoInvoice(apqoInvoiceTemplate, sampleForm());
    const book = await JSZip.loadAsync(await output.arrayBuffer());
    const sheet = await book.file('xl/worksheets/sheet1.xml')!.async('text');
    const workbook = await book.file('xl/workbook.xml')!.async('text');
    expect(sheet).toContain('PT SAMORA USAHA MAKMUR');
    expect(sheet).toContain('143/APQO/WKM/X/2026');
    expect(sheet).toContain('BANYU IRENG');
    expect(sheet).toContain('<c r="H23" s="48"><v>4</v></c>');
    expect(sheet).toContain('<f>H23*J23</f><v>24000000</v>');
    expect(sheet).toContain('<f>SUM(K23:K26)</f><v>30500000</v>');
    expect(sheet).toContain('<f>K28*50%</f><v>15250000</v>');
    expect(sheet).toContain('<f>K29*11%</f><v>1677500</v>');
    expect(sheet).toContain('<f>SUM(K29:K30)</f><v>16927500</v>');
    expect(sheet).toContain('<c r="I24" s="50" t="inlineStr"><is><t></t></is></c>');
    expect(workbook).toContain('Sheet1!$B$4:$K$43');
    expect(sheet).not.toContain('PT SEMEN PADANG');
    expect(book.file('xl/drawings/drawing1.xml')).toBeNull();
  });

  it('adds detail rows for more than three presenter teams and shifts totals', async () => {
    const form = sampleForm();
    form.participants = ['A', 'B', 'C', 'D'].map((team) => ({
      role: 'Presenter' as const, salutation: 'Ms', name: team, team,
    }));
    form.invoice.stagePercent = 100;
    form.invoice.taxPercent = 0;
    const output = await createApqoInvoice(apqoInvoiceTemplate, form);
    const book = await JSZip.loadAsync(await output.arrayBuffer());
    const sheet = await book.file('xl/worksheets/sheet1.xml')!.async('text');
    expect(sheet).toContain('<row r="26"');
    expect(sheet).toContain('<c r="D26" s="53" t="inlineStr"><is><t>D</t></is></c>');
    expect(sheet).toContain('<c r="B27" s="56" t="inlineStr"><is><t>B.</t></is></c>');
    expect(sheet).toContain('<f>SUM(K23:K27)</f><v>30500000</v>');
    expect(sheet).toContain('<f>SUM(K30:K31)</f><v>30500000</v>');
    expect((await book.file('xl/workbook.xml')!.async('text'))).toContain('Sheet1!$B$4:$K$44');
  });
});
