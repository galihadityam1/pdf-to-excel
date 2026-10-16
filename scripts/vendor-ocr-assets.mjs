import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const destination = resolve('public/vendor/ocr');
await mkdir(resolve(destination, 'core'), { recursive: true });
await cp(resolve('node_modules/tesseract.js/dist/worker.min.js'), resolve(destination, 'worker.min.js'));
await cp(resolve('node_modules/tesseract.js-core'), resolve(destination, 'core'), { recursive: true });
await cp(
  resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
  resolve(destination, 'eng.traineddata.gz'),
);
await cp(
  resolve('node_modules/@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz'),
  resolve(destination, 'ind.traineddata.gz'),
);
