import JSZip from 'jszip';
import { apqoWorkbookName, workbookName } from './batch';
import type { ParsedDocument } from './document-types';
import { apqoRegistrationTemplate, invoiceTemplate, receiptTemplate } from './templates.generated';
import { FormData } from './types';
import { createInvoice } from './xlsx/invoice';
import { createReceipt } from './xlsx/receipt';
import { createApqoRegistration } from './xlsx/apqo-registration';

export type WorkbookKind = 'invoice' | 'receipt';

export function createWorkbook(kind: WorkbookKind, form: FormData) {
  return kind === 'invoice'
    ? createInvoice(invoiceTemplate, form)
    : createReceipt(receiptTemplate, form);
}

export async function createBatchZip(
  kind: WorkbookKind,
  forms: FormData[],
  onProgress?: (completed: number, total: number) => void,
) {
  if (!forms.length) throw new Error('Tidak ada dokumen untuk diunduh.');
  const zip = new JSZip();
  for (const [index, form] of forms.entries()) {
    const workbook = await createWorkbook(kind, form);
    zip.file(workbookName(form, kind), new Uint8Array(await workbook.arrayBuffer()));
    onProgress?.(index + 1, forms.length);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function createApqoWorkbook(form: Extract<ParsedDocument, { format: 'apqo' }>['form']) {
  return createApqoRegistration(apqoRegistrationTemplate, form);
}

export async function createApqoBatchZip(
  entries: Array<{ fileName: string; document: Extract<ParsedDocument, { format: 'apqo' }> }>,
  onProgress?: (completed: number, total: number) => void,
) {
  if (!entries.length) throw new Error('Tidak ada formulir APQO untuk diunduh.');
  const zip = new JSZip();
  for (const [index, entry] of entries.entries()) {
    const workbook = await createApqoWorkbook(entry.document.form);
    zip.file(apqoWorkbookName(entry.fileName), new Uint8Array(await workbook.arrayBuffer()));
    onProgress?.(index + 1, entries.length);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
