import type { ExtractionSource } from '../document-types';
import type { OcrClient } from '../ocr';
import { cleanText, type PositionedToken } from './tokens';

type PdfTextItem = { str: string; transform: number[] };
type PdfPageLike = {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<void> };
};

export type ExtractedTokens = { source: ExtractionSource; tokens: PositionedToken[] };
export type OcrProvider = () => Promise<Pick<OcrClient, 'recognize'>>;

export async function extractTokens(page: PdfPageLike, getOcr: OcrProvider): Promise<ExtractedTokens> {
  const content = await page.getTextContent();
  const digital = (content.items as PdfTextItem[])
    .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
    .filter((item) => cleanText(item.text));
  const meaningfulLength = digital.map((item) => cleanText(item.text)).join('').length;
  if (meaningfulLength >= 80) return { source: 'digital', tokens: digital };

  const scale = 3;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Kanvas OCR tidak tersedia pada peramban ini.');
  await page.render({ canvasContext: context, viewport }).promise;
  const ocr = await getOcr();
  const tokens = (await ocr.recognize(canvas)).map((item) => ({
    ...item,
    x: item.x / scale,
    y: item.y / scale,
  }));
  return { source: 'ocr', tokens };
}
