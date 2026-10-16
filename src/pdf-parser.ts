import type { ExtractionSource, ParsedDocument } from './document-types';
import { createOcrClient, type OcrClient } from './ocr';
import { parseApqo } from './pdf/apqo';
import { detectFormat } from './pdf/detect';
import { extractTokens } from './pdf/extract';
import { parseIndonesia } from './pdf/indonesia';
import { toRows, type PositionedToken } from './pdf/tokens';

type PdfItem = { str: string; transform: number[] };
type PdfPage = Parameters<typeof extractTokens>[0];
type PdfDocument = { getPage(page: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: { data: Uint8Array; isEvalSupported: false }): { promise: Promise<PdfDocument> };
};

function dispatch(tokens: PositionedToken[], invoiceNo: number, source: ExtractionSource): ParsedDocument {
  const rows = toRows(tokens);
  const format = detectFormat(rows);
  if (format === 'indonesia') return { format, source, form: parseIndonesia(rows, invoiceNo) };
  if (format === 'apqo') return { format, source, form: parseApqo(rows) };
  throw new Error('Format formulir tidak dikenali. Gunakan formulir TKMPN atau APQO.');
}

export function parsePdfItems(
  items: PdfItem[],
  invoiceNo: number,
  source: ExtractionSource = 'digital',
): ParsedDocument {
  return dispatch(items.map((item) => ({
    text: item.str,
    x: item.transform[4],
    y: item.transform[5],
  })), invoiceNo, source);
}

export function createPdfParserSession(onOcr?: (fileName: string) => void) {
  let ocrPromise: Promise<OcrClient> | null = null;
  const getOcr = (fileName: string) => {
    onOcr?.(fileName);
    ocrPromise ??= createOcrClient();
    return ocrPromise;
  };

  return {
    async parse(file: File, invoiceNo: number): Promise<ParsedDocument> {
      const pdfjs = (window as Window & { pdfjsLib?: PdfJs }).pdfjsLib;
      if (!pdfjs) throw new Error('Komponen pembaca PDF belum siap. Coba pilih berkas sekali lagi.');
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
      }).promise;
      try {
        const page = await pdf.getPage(1);
        const extracted = await extractTokens(page, () => getOcr(file.name));
        return dispatch(extracted.tokens, invoiceNo, extracted.source);
      } finally {
        await pdf.destroy();
      }
    },
    async terminate() {
      if (ocrPromise) await (await ocrPromise).terminate();
    },
  };
}

export async function parsePdf(file: File, invoiceNo: number): Promise<ParsedDocument> {
  const session = createPdfParserSession();
  try {
    return await session.parse(file, invoiceNo);
  } finally {
    await session.terminate();
  }
}
