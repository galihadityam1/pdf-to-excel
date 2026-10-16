import type { ParsedDocument } from './document-types';
import type { FormData } from './types';

export const MAX_BATCH_FILES = 10;

export const fileKey = (file: Pick<File, 'name' | 'size' | 'lastModified'>) =>
  JSON.stringify([file.name, file.size, file.lastModified]);

type DocumentEntry = { document: ParsedDocument };

export function isIndonesia<T extends DocumentEntry>(entry: T): entry is T & {
  document: Extract<ParsedDocument, { format: 'indonesia' }>;
} {
  return entry.document.format === 'indonesia';
}

export const nextBatchNumber = (entries: ReadonlyArray<DocumentEntry>, stored: number) =>
  Math.max(225, stored || 225, ...entries.filter(isIndonesia).map((entry) => entry.document.form.invoiceNo + 1));

export const repeatedInvoiceNumbers = (entries: ReadonlyArray<DocumentEntry>) => {
  const seen = new Set<number>();
  const repeated = new Set<number>();
  for (const { document: { form } } of entries.filter(isIndonesia)) {
    if (seen.has(form.invoiceNo)) repeated.add(form.invoiceNo);
    seen.add(form.invoiceNo);
  }
  return [...repeated].sort((a, b) => a - b);
};

const safeCompany = (company: string) =>
  company.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() || 'PERUSAHAAN';

export const workbookName = (form: FormData, kind: 'invoice' | 'receipt') =>
  `${form.invoiceNo}${kind === 'receipt' ? ' kwitansi' : ''} ${safeCompany(form.company)}.xlsx`;

export const apqoWorkbookName = (fileName: string) => {
  const stem = fileName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${stem || 'formulir-apqo'}.xlsx`;
};

export const apqoInvoiceWorkbookName = (number: string, company: string) =>
  `${number} invoice APQO ${safeCompany(company)}.xlsx`;
