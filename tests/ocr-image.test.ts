import { expect, it } from 'vitest';
import { removeTableLines } from '../src/ocr-image';

it('removes long table rules but preserves short character strokes', () => {
  const width = 200, height = 200;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const black = (x: number, y: number) => pixels.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  for (let x = 10; x < 190; x++) black(x, 30);
  for (let y = 10; y < 190; y++) black(10, y);
  for (let y = 60; y < 80; y++) black(80, y);
  removeTableLines(pixels, width, height);
  expect(pixels[(30 * width + 90) * 4]).toBe(255);
  expect(pixels[(90 * width + 10) * 4]).toBe(255);
  expect(pixels[(70 * width + 80) * 4]).toBe(0);
});

it('leaves a page without long rules unchanged', () => {
  const pixels = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  pixels.fill(90, 400, 440);
  const original = pixels.slice();
  removeTableLines(pixels, 100, 100);
  expect(pixels).toEqual(original);
});
