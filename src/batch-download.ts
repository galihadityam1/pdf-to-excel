import JSZip from 'jszip';
import { workbookName } from './batch';
import { invoiceTemplate, receiptTemplate } from './templates.generated';
import { FormData } from './types';
import { createInvoice } from './xlsx/invoice';
import { createReceipt } from './xlsx/receipt';

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
