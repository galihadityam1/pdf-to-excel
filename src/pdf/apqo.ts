import { emptyApqoForm, type ApqoForm, type ApqoRole } from '../document-types';
import type { PdfRow } from './tokens';
import { cleanText, normalized } from './tokens';

const numberValue = (value: string) => Number(value.replace(/[^0-9]/g, '')) || 0;
const roleValue = (value: string): ApqoRole | null => {
  const text = normalized(value);
  if (text === 'presenter') return 'Presenter';
  if (text === 'observer') return 'Observer';
  return null;
};

function fieldValue(rows: PdfRow[], labels: string[]) {
  const row = rows.find((candidate) => {
    const text = normalized(candidate.text);
    return labels.some((label) => text.includes(normalized(label)));
  });
  if (!row) return '';
  const colon = row.items.findIndex((item) => item.text.includes(':'));
  if (colon >= 0) return cleanText(row.items.slice(colon + 1).map((item) => item.text).join(' '));
  const valueItems = row.items.filter((item) => item.x > 280);
  return cleanText(valueItems.map((item) => item.text).join(' '));
}

function parseFees(rows: PdfRow[], form: ApqoForm) {
  const feeArea = rows.filter((row) => row.items.some((item) => item.x < 180 && roleValue(item.text)));
  for (const row of feeArea) {
    const role = row.items.map((item) => roleValue(item.text)).find(Boolean);
    if (!role) continue;
    const values = row.items
      .filter((item) => numberValue(item.text) > 0)
      .map((item) => ({ x: item.x, value: numberValue(item.text) }));
    if (!values.some((item) => item.x > 250)) continue;
    const fee = form.fees.find((candidate) => candidate.role === role)!;
    fee.price = values.find((item) => item.x > 250 && item.x < 420)?.value ?? 0;
    fee.quantity = values.find((item) => item.x >= 420 && item.x < 480)?.value ?? 0;
    fee.total = values.find((item) => item.x >= 480)?.value ?? fee.price * fee.quantity;
  }
}

function parseParticipants(rows: PdfRow[], form: ApqoForm) {
  const listHeader = rows.find((row) => normalized(row.text).includes('participationlist'));
  const notesHeader = rows.find((row) => normalized(row.text) === 'notes');
  for (const row of rows) {
    if (listHeader && row.y >= listHeader.y) continue;
    if (notesHeader && row.y <= notesHeader.y) continue;
    const roleItem = row.items.find((item) => item.x < 160 && roleValue(item.text));
    const role = roleItem ? roleValue(roleItem.text) : null;
    if (!role || row.items.every((item) => item.x < 150 || item.x > 500)) continue;

    const salutation = cleanText(row.items
      .filter((item) => item.x >= 150 && item.x < 220)
      .map((item) => item.text)
      .join(' '));
    const name = cleanText(row.items
      .filter((item) => item.x >= 220 && item.x < 410)
      .map((item) => item.text)
      .join(' '));
    const team = cleanText(row.items
      .filter((item) => item.x >= 410)
      .map((item) => item.text)
      .join(' '));
    const isTableInstruction = /etc/i.test(salutation) || normalized(name) === 'capitalletter';
    if (!isTableInstruction && salutation && /[A-Za-z]/.test(name)) {
      form.participants.push({ role, salutation, name, team });
    }
  }
}

export function parseApqo(rows: PdfRow[]): ApqoForm {
  const form = emptyApqoForm();
  form.pic = fieldValue(rows, ['Name of Person in Charge']);
  form.designation = fieldValue(rows, ['Designation']);
  form.company = fieldValue(rows, ['Name of Organization']);
  form.address = fieldValue(rows, ['Address']);
  form.landline = fieldValue(rows, ['Tel (Land Line)', 'Land Line']);
  form.mobile = fieldValue(rows, ['Mobile Number', 'Mobile']);

  const emailRows = rows
    .filter((row) => /@/.test(row.text))
    .map((row) => row.text.replace(/\s*([@._%+-])\s*/g, '$1'));
  const numberedEmails = emailRows.flatMap((row) => (
    [...row.matchAll(/([1-4])\s*[.)]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)]
      .map((match) => ({ number: Number(match[1]), email: match[2] }))
  ));
  const unnumberedEmails = [...emailRows.join(' ').matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => match[0]);
  form.emails = (numberedEmails.length >= 2
    ? numberedEmails.sort((a, b) => a.number - b.number).map((entry) => entry.email)
    : unnumberedEmails)
    .filter((email) => !/wkm_(?:indonesia|keuangan)/i.test(email))
    .slice(0, 4);
  while (form.emails.length < 4) form.emails.push('');

  const signedRow = rows.find((row) => /secretariat/i.test(row.text) && /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(row.text));
  if (signedRow) {
    const signatureText = signedRow.text.replace(/^.*?secretariat\s*:?\s*/i, '');
    const parts = signatureText.split(',');
    form.place = cleanText(parts[0] ?? '');
    form.date = cleanText(parts.slice(1).join(','));
  }
  const signerRow = rows.find((row) => row.y < 300 && /\([^()]+\.?\)/.test(row.text));
  if (signerRow) form.signer = signerRow.text.replace(/[().]/g, '').trim();

  parseFees(rows, form);
  parseParticipants(rows, form);
  return form;
}
