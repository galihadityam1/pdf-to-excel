export const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const column = (reference: string) => reference.match(/[A-Z]+/)![0];
export const rowNo = (reference: string) => Number(reference.match(/\d+/)![0]);
export const cellRef = (columnName: string, row: number) => `${columnName}${row}`;
export const cell = (reference: string, style: number, value: string | number, type = 'inlineStr') => typeof value === 'number'
  ? `<c r="${reference}" s="${style}"><v>${value}</v></c>`
  : `<c r="${reference}" s="${style}" t="${type}"><is><t${/^\s|\s$/.test(value) ? ' xml:space="preserve"' : ''}>${xmlEscape(value)}</t></is></c>`;

export function replaceCell(sheet: string, reference: string, style: number, value: string | number) {
  const pattern = new RegExp(`<c r="${reference}"[^>]*?\\/>|<c r="${reference}"[^>]*?>(?:[\\s\\S]*?)<\\/c>`);
  return pattern.test(sheet) ? sheet.replace(pattern, cell(reference, style, value)) : sheet.replace(/<\/row>/, `${cell(reference, style, value)}</row>`);
}
export function replaceFormulaCell(sheet: string, reference: string, style: number, formula: string, value: number) {
  const pattern = new RegExp(`<c r="${reference}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  if (!pattern.test(sheet)) throw new Error(`Sel template ${reference} tidak ditemukan.`);
  return sheet.replace(pattern, `<c r="${reference}" s="${style}"><f>${xmlEscape(formula)}</f><v>${value}</v></c>`);
}
export function inlineStrings(sheet: string, strings: string[]) {
  return sheet.replace(/<c r="([A-Z]+\d+)"([^>]*) t="s"><v>(\d+)<\/v><\/c>/g, (_, ref, attrs, index) => `<c r="${ref}"${attrs} t="inlineStr"><is><t>${xmlEscape(strings[Number(index)] ?? '')}</t></is></c>`);
}
export function base64ToBytes(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
