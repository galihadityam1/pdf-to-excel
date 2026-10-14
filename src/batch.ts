import { FormData } from './types';

export const MAX_BATCH_FILES = 10;

export const fileKey = (file: Pick<File, 'name' | 'size' | 'lastModified'>) =>
  JSON.stringify([file.name, file.size, file.lastModified]);

export const nextBatchNumber = (entries: ReadonlyArray<{ form: FormData }>, stored: number) =>
  Math.max(225, stored || 225, ...entries.map((entry) => entry.form.invoiceNo + 1));

export const repeatedInvoiceNumbers = (entries: ReadonlyArray<{ form: FormData }>) => {
  const seen = new Set<number>();
  const repeated = new Set<number>();
  for (const { form } of entries) {
    if (seen.has(form.invoiceNo)) repeated.add(form.invoiceNo);
    seen.add(form.invoiceNo);
  }
  return [...repeated].sort((a, b) => a - b);
};

const safeCompany = (company: string) =>
  company.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() || 'PERUSAHAAN';

export const workbookName = (form: FormData, kind: 'invoice' | 'receipt') =>
  `${form.invoiceNo}${kind === 'receipt' ? ' kwitansi' : ''} ${safeCompany(form.company)}.xlsx`;
