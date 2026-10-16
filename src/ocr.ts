import type { PositionedToken } from './pdf/tokens';
import { removeTableLines } from './ocr-image';

export type OcrClient = {
  recognize(canvas: HTMLCanvasElement): Promise<PositionedToken[]>;
  terminate(): Promise<void>;
};

export async function createOcrClient(): Promise<OcrClient> {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'ind'], 1, {
    workerPath: '/vendor/ocr/worker.min.js',
    corePath: '/vendor/ocr/core',
    langPath: '/vendor/ocr',
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

  return {
    async recognize(canvas) {
      const context = canvas.getContext('2d')!;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      removeTableLines(pixels.data, canvas.width, canvas.height);
      context.putImageData(pixels, 0, 0);
      const result = await worker.recognize(canvas, {}, { blocks: true });
      return (result.data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => (
        paragraph.lines.flatMap((line) => line.words.map((word) => ({
          text: word.text,
          x: word.bbox.x0,
          y: canvas.height - line.bbox.y1,
        })))
      )));
    },
    terminate: () => worker.terminate().then(() => undefined),
  };
}
