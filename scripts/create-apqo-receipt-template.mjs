import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Berikan path workbook contoh kwitansi APQO.');
const source = await JSZip.loadAsync(await readFile(sourcePath));
const output = new JSZip();
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const kept = new Map([
  ['E9', '31st APQO International Conference & Ace Team Competition 2026'],
  ['E10', 'Bali, 26 - 29 October 2026'],
  ['L21', 'Indah Budiwati'], ['L22', 'Bendahara'],
]);
let sheet = await source.file('xl/worksheets/sheet1.xml').async('text');
sheet = sheet.replace(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (row, number) => {
  if (Number(number) > 22) return '';
  return row.replace(/ spans="[^"]+"/, '').replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (_cell, reference, attributes) => {
    if (!/^[A-M]\d+$/.test(reference)) return '';
    const style = attributes.match(/\bs="(\d+)"/)?.[1] ?? '0';
    const text = kept.get(reference);
    return text ? `<c r="${reference}" s="${style}" t="inlineStr"><is><t>${text.replace(/&/g, '&amp;')}</t></is></c>` : `<c r="${reference}" s="${style}"/>`;
  });
});
sheet = sheet.replace(/<dimension[^>]*\/>/, '<dimension ref="A1:M22"/>')
  .replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"/></sheetViews>')
  .replace(/<col min="(\d+)"[^>]*\/>/g, (col, min) => Number(min) <= 13 ? col : '')
  .replace(/<sheetProtection[^>]*\/>/, '')
  .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, '<mergeCells count="2"><mergeCell ref="E7:L7"/><mergeCell ref="A20:E20"/></mergeCells>')
  .replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, '')
  .replace(/<pageSetup[^>]*\/>/, '<pageSetup paperSize="9" scale="90" orientation="portrait"/>');
output.file('xl/worksheets/sheet1.xml', sheet);
for (const path of ['xl/styles.xml', 'xl/theme/theme1.xml']) output.file(path, await source.file(path).async('uint8array'));
output.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${main}" xmlns:r="${rel}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="kwitansi" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">kwitansi!$A$1:$M$22</definedName></definedNames><calcPr calcId="191029"/></workbook>`);
output.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${rel}/theme" Target="theme/theme1.xml"/></Relationships>`);
output.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
output.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
await writeFile(new URL('../assets/templates/apqo-receipt.xlsx', import.meta.url), await output.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
