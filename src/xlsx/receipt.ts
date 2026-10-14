import JSZip from 'jszip';
import { FormData } from '../types';
import { excelDate, grandTotal, romanMonth } from '../calculations';
import { base64ToBytes, replaceCell, xmlEscape } from './xml';

const terbilang = (amount: number) => {
  const words = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  const say = (n: number): string => n < 12 ? words[n] : n < 20 ? `${say(n - 10)} Belas` : n < 100 ? `${say(Math.floor(n / 10))} Puluh ${say(n % 10)}` : n < 200 ? `Seratus ${say(n - 100)}` : n < 1000 ? `${say(Math.floor(n / 100))} Ratus ${say(n % 100)}` : n < 2000 ? `Seribu ${say(n - 1000)}` : n < 1e6 ? `${say(Math.floor(n / 1000))} Ribu ${say(n % 1000)}` : n < 1e9 ? `${say(Math.floor(n / 1e6))} Juta ${say(n % 1e6)}` : `${say(Math.floor(n / 1e9))} Miliar ${say(n % 1e9)}`;
  return `#${say(Math.round(amount)).replace(/\s+/g, ' ').trim()} Rupiah#`;
};

export async function createReceipt(template: string, form: FormData) {
  const zip = await JSZip.loadAsync(base64ToBytes(template));
  let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('text');
  const year = new Date(`${form.date}T12:00:00`).getFullYear(), amount = grandTotal(form);
  sheet = replaceCell(sheet, 'K1', 89, form.invoiceNo);
  sheet = replaceCell(sheet, 'N1', 89, romanMonth(form.date));
  sheet = replaceCell(sheet, 'O1', 89, year);
  sheet = replaceCell(sheet, 'B3', 137, form.company);
  sheet = replaceCell(sheet, 'B9', 130, `Jumlah peserta ${form.participants.length} orang`);
  sheet = replaceCell(sheet, 'J16', 125, excelDate(form.date));
  sheet = replaceCell(sheet, 'A19', 132, amount);
  const cacheFormula = (reference: string, value: string) => {
    const pattern = new RegExp(`<c r="${reference}"[^>]*>[\\s\\S]*?<\\/c>`);
    sheet = sheet.replace(pattern, (existing) => existing.replace(/<v>[\s\S]*?<\/v>/, `<v>${xmlEscape(value)}</v>`));
  };
  cacheFormula('J1', `${form.invoiceNo}/TKMPN/WKM/${romanMonth(form.date)}/${year}`);
  cacheFormula('C5', terbilang(amount));
  for (const path of Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) {
    const contents = path === 'xl/worksheets/sheet1.xml' ? sheet : await zip.file(path)!.async('text');
    zip.file(path, contents.replace(/<c r="[A-Z]+\d+"[^>]*?\/>|<c r="([A-Z]+\d+)"[^>]*?>[\s\S]*?<\/c>/g, (existing, reference) => {
      if (!existing.includes('<f') || path === 'xl/worksheets/sheet1.xml' && (reference === 'J1' || reference === 'C5')) return existing;
      return existing.replace(/<v>[^<]*<\/v>/, '<v></v>');
    }));
  }
  zip.remove('xl/calcChain.xml');
  let workbook = await zip.file('xl/workbook.xml')!.async('text'); workbook = workbook.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>'); zip.file('xl/workbook.xml', workbook);
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('text');
  zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
  const types = await zip.file('[Content_Types].xml')!.async('text');
  zip.file('[Content_Types].xml', types.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
