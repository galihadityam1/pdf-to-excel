export type PositionedToken = { text: string; x: number; y: number };
export type PdfRow = { y: number; items: PositionedToken[]; text: string };

export const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();

export const normalized = (value: string) => cleanText(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/1/g, 'i')
  .replace(/0/g, 'o')
  .replace(/[^a-z0-9]+/g, '');

export function toRows(tokens: PositionedToken[]): PdfRow[] {
  const rows: PdfRow[] = [];

  for (const item of tokens) {
    const text = cleanText(item.text);
    if (!text) continue;
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 3);
    if (!row) {
      row = { y: item.y, items: [], text: '' };
      rows.push(row);
    }
    row.items.push({ ...item, text });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const items = [...row.items].sort((a, b) => a.x - b.x);
      return { ...row, items, text: items.map((item) => item.text).join(' ') };
    });
}
