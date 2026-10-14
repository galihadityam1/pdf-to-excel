import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { emptyForm, Participant } from '../src/types';
import { excelDate, grandTotal } from '../src/calculations';
import { invoiceTemplate, receiptTemplate } from '../src/templates.generated';
import { createInvoice } from '../src/xlsx/invoice';
import { createReceipt } from '../src/xlsx/receipt';

const form = () => ({ ...emptyForm(225), company: 'PT Sumberdaya Arindo', pic: 'Muhammad Rendi', date: '2026-10-14', npwpAddress: 'Antam Office Park, Jakarta Selatan', deliveryAddress: 'Antam Office Park, Jakarta Selatan', phone: '2129634908', fees: emptyForm().fees.map((fee) => fee.key === 'tim' ? {...fee, quantity:5, total:30000000} : fee.key === 'peninjau' ? {...fee, quantity:1, total:6200000} : fee), participants: [{role:'Penyaji' as const,name:'Dedek',team:'Solusi',shirt:'L'}, {role:'Penyaji' as const,name:'Dudhi',team:'Solusi',shirt:'XL'}, {role:'Penyaji' as const,name:'Rasmus',team:'Solusi',shirt:'M'}, {role:'Penyaji' as const,name:'Gandi',team:'Solusi',shirt:'L'}, {role:'Penyaji' as const,name:'Wafir',team:'Solusi',shirt:'M'}, {role:'Peninjau' as const,name:'Rendi',team:'',shirt:'XL'}] });

describe('template workbooks', () => {
  it('keeps the invoice layout and changes only intended content', async () => {
    const zip = await JSZip.loadAsync(await (await createInvoice(invoiceTemplate, form())).arrayBuffer());
    const original = await JSZip.loadAsync(Uint8Array.from(atob(invoiceTemplate), (character) => character.charCodeAt(0)));
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('text');
    const before = await original.file('xl/worksheets/sheet1.xml')!.async('text');
    const cell = (xml: string, ref: string) => xml.match(new RegExp(`<c r="${ref}"[^>]*>(?:[\\s\\S]*?)<\\/c>`))?.[0];
    for (const ref of ['B18', 'B19', 'B20', 'I27', 'I28']) expect(cell(sheet, ref)).toBe(cell(before, ref));
    expect(cell(sheet, 'B21')).toContain('<t>A.</t>');
    expect(cell(sheet, 'C21')).toBe(cell(before, 'C21'));
    expect(cell(sheet, 'C22')).toContain('<t>1.</t>');
    expect(cell(sheet, 'D22')).toContain('TIM SOLUSI');
    expect(cell(sheet, 'B23')).toContain('<t>B.</t>');
    expect(cell(sheet, 'D23')).toContain('PENINJAU');
    expect(cell(sheet, 'G26')).toContain('<v>6</v>');
    expect(cell(sheet, 'J26')).toContain('<v>36200000</v>');
    expect(cell(sheet, 'J28')).toContain('<v>40182000</v>');
    expect(zip.file('xl/drawings/drawing1.xml')).toBeTruthy();
    expect(zip.file('xl/calcChain.xml')).toBeNull();
  });
  it('keeps receipt formulas, caches, sheets and protection', async () => {
    const zip = await JSZip.loadAsync(await (await createReceipt(receiptTemplate, form())).arrayBuffer());
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('text');
    expect(Object.keys(zip.files).filter((path) => /worksheets\/sheet\d+\.xml/.test(path))).toHaveLength(7);
    expect(sheet).toContain('sheetProtection');
    expect(sheet).toContain('40182000');
    expect(sheet).toMatch(/<c r="J1"[^>]*><f>[^<]+<\/f><v>225\/TKMPN\/WKM\/X\/2026<\/v><\/c>/);
    expect(sheet).toMatch(/<c r="C5"[^>]*><f>[^<]+<\/f><v>#Empat Puluh Juta Seratus Delapan Puluh Dua Ribu Rupiah#<\/v><\/c>/);
    expect(sheet).not.toMatch(/<c[^>]*\bt="[^"]+"[^>]*\bt="/);
    expect(zip.file('xl/calcChain.xml')).toBeNull();
    expect(await zip.file('xl/_rels/workbook.xml.rels')!.async('text')).not.toContain('calcChain');
  });
  it('inserts detail rows and shifts summary, print area and drawing anchors', async () => {
    const extended = form();
    extended.fees = extended.fees.map((fee) => fee.key === 'tim' ? { ...fee, quantity: 6, total: 36000000 } : fee);
    extended.participants = (Array.from({length: 6}, (_, index) => ({role: 'Penyaji' as const, name: `Peserta ${index+1}`, team: `Tim ${index+1}`, shirt: 'L'})) as Participant[]).concat([{role: 'Peninjau', name: 'Rendi', team: '', shirt: 'XL'}]);
    const zip = await JSZip.loadAsync(await (await createInvoice(invoiceTemplate, extended)).arrayBuffer());
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('text');
    const workbook = await zip.file('xl/workbook.xml')!.async('text');
    const drawing = await zip.file('xl/drawings/drawing1.xml')!.async('text');
    expect(sheet).toMatch(/<row r="29"[^>]*>[\s\S]*?<c r="G29"[^>]*><f>SUM\(G22:G28\)<\/f><v>7<\/v>/);
    expect(sheet).toContain('<row r="31"');
    expect(workbook).toContain('tkmpn!$B$1:$J$46');
    expect(drawing).toContain('<xdr:row>46</xdr:row>');
  });
  it('calculates supplied example total', () => expect(grandTotal(form())).toBe(40182000));
  it('keeps Excel dates stable across local time zones', () => expect(excelDate('2026-10-14')).toBe(46309));
});
