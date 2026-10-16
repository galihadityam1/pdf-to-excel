import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const sourcePath = '/Users/test/Downloads/Pamaoersada.2 (1).xlsx';
const outputPath = new URL('../assets/templates/apqo-registration.xlsx', import.meta.url);
const workbook = await JSZip.loadAsync(await readFile(sourcePath));
const sheetPath = 'xl/worksheets/sheet1.xml';
let sheet = await workbook.file(sheetPath).async('text');

const clearCell = (reference) => {
  const pattern = new RegExp(`<c r="${reference}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  sheet = sheet.replace(pattern, (_cell, attributes) => {
    const style = attributes.match(/\bs="([^"]+)"/)?.[1];
    return `<c r="${reference}"${style ? ` s="${style}"` : ''}/>`;
  });
};

[
  'H12', 'H13', 'H14', 'H15', 'H16', 'H17', 'H18', 'H19', 'J18', 'J19',
  'H23', 'J23', 'K23', 'H24', 'J24', 'K24', 'K25',
  'K47', 'K48',
].forEach(clearCell);

for (let row = 32; row <= 35; row += 1) {
  for (const column of ['C', 'D', 'E', 'F', 'I']) clearCell(`${column}${row}`);
}

workbook.file(sheetPath, sheet);
workbook.remove('xl/calcChain.xml');
await writeFile(outputPath, await workbook.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
