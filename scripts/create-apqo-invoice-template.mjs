import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Berikan path workbook contoh invoice APQO.');

const workbook = await JSZip.loadAsync(await readFile(sourcePath));
const sheetPath = 'xl/worksheets/sheet1.xml';
let sheet = await workbook.file(sheetPath).async('text');
const discardedStringIndices = new Set();

for (const reference of [
  'J5', 'J6', 'B11', 'B12', 'B13', 'B14',
  ...[23, 24, 25].flatMap((row) => ['C', 'D', 'H', 'J', 'K'].map((column) => `${column}${row}`)),
  'H26', 'J26', 'K26', 'K28', 'K29', 'K30', 'K31',
  'M25', 'N25', 'O25', 'S16',
]) {
  const pattern = new RegExp(`<c r="${reference}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  sheet = sheet.replace(pattern, (oldCell, attributes) => {
    if (/\bt="s"/.test(attributes)) {
      const index = oldCell.match(/<v>(\d+)<\/v>/)?.[1];
      if (index) discardedStringIndices.add(Number(index));
    }
    const style = attributes.match(/\bs="([^"]+)"/)?.[1];
    return `<c r="${reference}"${style ? ` s="${style}"` : ''}/>`;
  });
}

workbook.file(sheetPath, sheet);
workbook.remove('xl/calcChain.xml');
const strings = await workbook.file('xl/sharedStrings.xml').async('text');
let stringIndex = 0;
workbook.file('xl/sharedStrings.xml', strings.replace(/<si>[\s\S]*?<\/si>/g, (item) => (
  discardedStringIndices.has(stringIndex++) ? '<si><t></t></si>' : item
)));

sheet = sheet.replace(/<drawing r:id="[^"]+"\/>/, '');
workbook.file(sheetPath, sheet);
const sheetRels = 'xl/worksheets/_rels/sheet1.xml.rels';
if (workbook.file(sheetRels)) {
  const relationships = await workbook.file(sheetRels).async('text');
  workbook.file(sheetRels, relationships.replace(/<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*\/>/g, ''));
}
for (const name of Object.keys(workbook.files)) {
  if (name.startsWith('xl/drawings/') || name.startsWith('xl/media/')) workbook.remove(name);
}
const types = await workbook.file('[Content_Types].xml').async('text');
workbook.file('[Content_Types].xml', types.replace(/<Override\b[^>]*PartName="\/xl\/drawings\/[^"]+"[^>]*\/>/g, ''));
await writeFile(new URL('../assets/templates/apqo-invoice.xlsx', import.meta.url),
  await workbook.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
