import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { emptyApqoForm } from '../src/document-types';
import { apqoRegistrationTemplate } from '../src/templates.generated';
import { createApqoRegistration } from '../src/xlsx/apqo-registration';

function exampleForm() {
  const form = emptyApqoForm();
  form.pic = 'Septian Eko Hari Wicaksono';
  form.company = 'PT Contoh APQO';
  form.emails = ['one@example.com', 'two@example.com', '', ''];
  form.fees = [
    { role: 'Presenter', price: 6000000, quantity: 4, total: 24000000 },
    { role: 'Observer', price: 6500000, quantity: 1, total: 6500000 },
  ];
  form.participants = [
    { role: 'Presenter', salutation: 'Mr', name: 'AHMAD ZAKI', team: 'MAS JEKI' },
  ];
  return form;
}

describe('APQO registration workbook', () => {
  it('writes values and formulas without dropping client printer settings', async () => {
    const output = await createApqoRegistration(apqoRegistrationTemplate, exampleForm());
    const book = await JSZip.loadAsync(await output.arrayBuffer());
    const sheet = await book.file('xl/worksheets/sheet1.xml')!.async('text');
    expect(sheet).toContain('PT Contoh APQO');
    expect(sheet).toContain('<f>SUM(K23:K24)</f><v>30500000</v>');
    expect(book.file('xl/printerSettings/printerSettings1.bin')).toBeTruthy();
  });

  it('adds a styled participant row before Notes when capacity is exceeded', async () => {
    const form = exampleForm();
    form.participants = Array.from({ length: 5 }, (_, index) => ({
      role: 'Presenter' as const,
      salutation: 'Mr',
      name: `Peserta ${index + 1}`,
      team: 'Team A',
    }));
    const output = await createApqoRegistration(apqoRegistrationTemplate, form);
    const book = await JSZip.loadAsync(await output.arrayBuffer());
    const sheet = await book.file('xl/worksheets/sheet1.xml')!.async('text');
    expect(sheet).toContain('Peserta 5');
    expect(sheet).toContain('<row r="36"');
    expect(sheet).toContain('<mergeCell ref="F36:H36"/>');
    const workbook = await book.file('xl/workbook.xml')!.async('text');
    expect(workbook).toContain('$B$5:$L$55');
  });
});
