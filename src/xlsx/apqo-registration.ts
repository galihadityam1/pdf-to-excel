import JSZip from 'jszip';
import type { ApqoForm, ApqoRole } from '../document-types';
import { base64ToBytes, replaceCell, replaceFormulaCell } from './xml';

const identityCells: Array<[keyof ApqoForm, string]> = [
  ['pic', 'H12'],
  ['designation', 'H13'],
  ['company', 'H14'],
  ['address', 'H15'],
  ['landline', 'H16'],
  ['mobile', 'H17'],
];
const emailCells = ['H18', 'H19', 'J18', 'J19'];
const feeRows: Array<[ApqoRole, number]> = [['Presenter', 23], ['Observer', 24]];
const participantStart = 32;
const participantCapacity = 4;

function originalRow(sheet: string, number: number) {
  const found = sheet.match(new RegExp(`<row r="${number}"[^>]*>[\\s\\S]*?<\\/row>`));
  if (!found) throw new Error(`Baris template ${number} tidak ditemukan.`);
  return found[0];
}

function cellStyle(sheet: string, reference: string, fallback = 0) {
  return Number(sheet.match(new RegExp(`<c r="${reference}" s="(\\d+)"`))?.[1] ?? fallback);
}

function clearCell(sheet: string, reference: string) {
  const style = cellStyle(sheet, reference);
  const pattern = new RegExp(`<c r="${reference}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  if (!pattern.test(sheet)) throw new Error(`Sel template ${reference} tidak ditemukan.`);
  return sheet.replace(pattern, `<c r="${reference}"${style ? ` s="${style}"` : ''}/>`);
}

function shiftReferences(value: string, fromRow: number, offset: number) {
  return value.replace(/(\$?[A-Z]+\$?)(\d+)/g, (match, column: string, row: string) => (
    Number(row) >= fromRow ? `${column}${Number(row) + offset}` : match
  ));
}

function shiftRow(rowXml: string, fromRow: number, offset: number) {
  return rowXml
    .replace(/<row r="(\d+)"/, (_match, row) => `<row r="${Number(row) + offset}"`)
    .replace(/<c r="([A-Z]+)(\d+)"/g, (_match, column, row) => `<c r="${column}${Number(row) + offset}"`)
    .replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_match, attributes, formula) => (
      `<f${attributes}>${shiftReferences(formula, fromRow, offset)}</f>`
    ));
}

function expandParticipantRows(sheet: string, overflow: number) {
  if (!overflow) return sheet;
  const sourceRow = originalRow(sheet, participantStart + participantCapacity - 1);
  sheet = sheet.replace(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (rowXml, row) => (
    Number(row) >= participantStart + participantCapacity ? shiftRow(rowXml, participantStart + participantCapacity, overflow) : rowXml
  ));
  const inserted = Array.from({ length: overflow }, (_, index) => (
    shiftRow(sourceRow, participantStart + participantCapacity, index + 1)
  )).join('');
  sheet = sheet.replace(`<row r="${participantStart + participantCapacity + overflow}"`, `${inserted}<row r="${participantStart + participantCapacity + overflow}"`);
  sheet = sheet.replace(/(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)(")/, (_match, start, end, close) => (
    `${start}${Number(end) + overflow}${close}`
  ));
  sheet = sheet.replace(/(<mergeCell ref=")([^"]+)(")/g, (_match, start, reference, close) => (
    `${start}${shiftReferences(reference, participantStart + participantCapacity, overflow)}${close}`
  ));
  const addedMerges = Array.from({ length: overflow }, (_, index) => {
    const row = participantStart + participantCapacity + index;
    return `<mergeCell ref="F${row}:H${row}"/><mergeCell ref="I${row}:K${row}"/>`;
  }).join('');
  sheet = sheet.replace(/<mergeCells count="(\d+)">/, (_match, count) => `<mergeCells count="${Number(count) + overflow * 2}">`);
  return sheet.replace('</mergeCells>', `${addedMerges}</mergeCells>`);
}

export async function createApqoRegistration(template: string, form: ApqoForm) {
  const zip = await JSZip.loadAsync(base64ToBytes(template));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  let sheet = await zip.file(sheetPath)!.async('text');
  const overflow = Math.max(0, form.participants.length - participantCapacity);
  sheet = expandParticipantRows(sheet, overflow);

  for (const [key, reference] of identityCells) {
    sheet = replaceCell(sheet, reference, cellStyle(sheet, reference), String(form[key] ?? ''));
  }
  for (const [index, reference] of emailCells.entries()) {
    const email = form.emails[index]?.trim() ?? '';
    sheet = replaceCell(sheet, reference, cellStyle(sheet, reference), email ? `${index + 1}. ${email}` : '');
  }

  for (const [role, row] of feeRows) {
    const fee = form.fees.find((candidate) => candidate.role === role) ?? { price: 0, quantity: 0, total: 0 };
    sheet = replaceCell(sheet, `H${row}`, cellStyle(sheet, `H${row}`), fee.price);
    sheet = replaceCell(sheet, `J${row}`, cellStyle(sheet, `J${row}`), fee.quantity);
    sheet = replaceFormulaCell(sheet, `K${row}`, cellStyle(sheet, `K${row}`), `H${row}*J${row}`, fee.price * fee.quantity);
  }
  const total = form.fees.reduce((sum, fee) => sum + fee.price * fee.quantity, 0);
  sheet = replaceFormulaCell(sheet, 'K25', cellStyle(sheet, 'K25'), 'SUM(K23:K24)', total);

  const participantRows = participantCapacity + overflow;
  for (let index = 0; index < participantRows; index += 1) {
    const row = participantStart + index;
    for (const column of ['C', 'D', 'E', 'F', 'I']) sheet = clearCell(sheet, `${column}${row}`);
    const participant = form.participants[index];
    if (!participant) continue;
    sheet = replaceCell(sheet, `C${row}`, cellStyle(sheet, `C${row}`), index + 1);
    sheet = replaceCell(sheet, `D${row}`, cellStyle(sheet, `D${row}`), participant.role.toUpperCase());
    sheet = replaceCell(sheet, `E${row}`, cellStyle(sheet, `E${row}`), participant.salutation);
    sheet = replaceCell(sheet, `F${row}`, cellStyle(sheet, `F${row}`), participant.name);
    sheet = replaceCell(sheet, `I${row}`, cellStyle(sheet, `I${row}`), participant.team);
  }

  const signatureOffset = overflow;
  const placeReference = `K${47 + signatureOffset}`;
  const signerReference = `K${48 + signatureOffset}`;
  sheet = replaceCell(sheet, placeReference, cellStyle(sheet, placeReference), [form.place, form.date].filter(Boolean).join(', '));
  sheet = replaceCell(sheet, signerReference, cellStyle(sheet, signerReference), form.signer);
  zip.file(sheetPath, sheet);

  zip.remove('xl/calcChain.xml');
  let workbook = await zip.file('xl/workbook.xml')!.async('text');
  if (overflow) workbook = workbook.replace(/(<definedName[^>]*_xlnm\.Print_Area[^>]*>)([\s\S]*?)(<\/definedName>)/, (
    _match, start, reference, end,
  ) => `${start}${shiftReferences(reference, participantStart + participantCapacity, overflow)}${end}`);
  workbook = workbook.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>');
  zip.file('xl/workbook.xml', workbook);

  const relsPath = 'xl/_rels/workbook.xml.rels';
  const rels = await zip.file(relsPath)!.async('text');
  zip.file(relsPath, rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
  const types = await zip.file('[Content_Types].xml')!.async('text');
  zip.file('[Content_Types].xml', types.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
