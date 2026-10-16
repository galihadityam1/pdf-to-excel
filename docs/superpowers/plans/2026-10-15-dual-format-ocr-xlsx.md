# Dual-format PDF OCR and XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept Indonesian and APQO registration PDFs as digital files or scans, then produce the correct XLSX output for each format.

**Architecture:** A shared extraction layer first returns positioned text from PDF.js or local OCR. A detector sends that text to either an Indonesian parser or an APQO parser, which produce a discriminated document type. The existing invoice and receipt path remains exclusive to Indonesian documents, while APQO documents populate a client-provided registration workbook template.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, PDF.js, Tesseract.js 7, JSZip, Vitest, Open XML.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `src/document-types.ts` | Discriminated Indonesian and APQO document models. |
| `src/pdf/tokens.ts` | Positioned-token normalization and line grouping. |
| `src/pdf/detect.ts` | Text-label based format detection. |
| `src/pdf/indonesia.ts` | Existing Indonesian parser, moved behind the shared interface. |
| `src/pdf/apqo.ts` | APQO labels, fee rows, and participant-table parsing. |
| `src/pdf/extract.ts` | PDF.js text extraction plus canvas rendering for OCR fallback. |
| `src/ocr.ts` | Browser-only local Tesseract worker wrapper. |
| `src/pdf-parser.ts` | Public `parsePdf` facade and format dispatch. |
| `src/xlsx/apqo-registration.ts` | APQO workbook population and participant-row expansion. |
| `src/batch-download.ts` | Output routing and ZIP generation by document type. |
| `app/indonesia-review.tsx` | Existing Indonesian review editor extracted from the page. |
| `app/apqo-review.tsx` | APQO review editor. |
| `app/page.tsx` | Batch state, upload status, routing, and download controls. |
| `assets/templates/apqo-registration.xlsx` | Client workbook template, copied from the approved source file. |
| `scripts/embed-templates.mjs` | Builds the TypeScript base64 module for all XLSX templates. |
| `scripts/vendor-ocr-assets.mjs` | Copies worker, WASM core, and English/Indonesian OCR data into `public/vendor/ocr/`. |
| `tests/pdf-parsers.test.ts` | Detection and parser unit tests. |
| `tests/apqo-workbook.test.ts` | APQO workbook preservation and output tests. |
| `tests/batch.test.ts` | Mixed-batch routing and ZIP tests. |

### Task 1: Define the two document models and the format detector

**Files:**

- Create: `src/document-types.ts`
- Create: `src/pdf/tokens.ts`
- Create: `src/pdf/detect.ts`
- Create: `tests/pdf-parsers.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write the failing detector tests.**

```ts
import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/pdf/detect';
import { toRows, type PositionedToken } from '../src/pdf/tokens';

const token = (text: string, x = 40, y = 700): PositionedToken => ({ text, x, y });

describe('detectFormat', () => {
  it('identifies the Indonesian registration form', () => {
    expect(detectFormat(toRows([
      token('Nama Perusahaan'), token('Nama PIC'), token('TOTAL BIAYA'),
    ]))).toBe('indonesia');
  });

  it('identifies APQO after OCR normalizes punctuation and casing', () => {
    expect(detectFormat(toRows([
      token('name of organizat1on'), token('REGISTRATION FEE'), token('participation list'),
    ]))).toBe('apqo');
  });

  it('rejects documents without enough format markers', () => {
    expect(detectFormat(toRows([token('Registration form')]))).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails.**

Run: `npm test -- tests/pdf-parsers.test.ts`

Expected: FAIL because `src/pdf/detect.ts` does not exist.

- [ ] **Step 3: Add document and positioned-token types.**

```ts
// src/document-types.ts
import type { FormData } from './types';

export type DocumentFormat = 'indonesia' | 'apqo';
export type ExtractionSource = 'digital' | 'ocr';
export type ApqoRole = 'Presenter' | 'Observer';

export type ApqoFee = { role: ApqoRole; price: number; quantity: number; total: number };
export type ApqoParticipant = { role: ApqoRole; salutation: string; name: string; team: string };
export type ApqoForm = {
  pic: string; designation: string; company: string; address: string;
  landline: string; mobile: string; emails: string[]; place: string; date: string;
  signer: string; fees: ApqoFee[]; participants: ApqoParticipant[];
};

export type ParsedDocument =
  | { format: 'indonesia'; source: ExtractionSource; form: FormData }
  | { format: 'apqo'; source: ExtractionSource; form: ApqoForm };

export const emptyApqoForm = (): ApqoForm => ({
  pic: '', designation: '', company: '', address: '', landline: '', mobile: '', emails: ['', '', '', ''],
  place: '', date: '', signer: '',
  fees: [
    { role: 'Presenter', price: 0, quantity: 0, total: 0 },
    { role: 'Observer', price: 0, quantity: 0, total: 0 },
  ],
  participants: [],
});
```

```ts
// src/pdf/tokens.ts
export type PositionedToken = { text: string; x: number; y: number };
export type PdfRow = { y: number; items: PositionedToken[]; text: string };
export const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();
export const normalized = (value: string) => cleanText(value).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/1/g, 'i').replace(/0/g, 'o').replace(/[^a-z0-9]+/g, '');
export function toRows(tokens: PositionedToken[]): PdfRow[] {
  const rows: PdfRow[] = [];
  for (const item of tokens) {
    const text = cleanText(item.text);
    if (!text) continue;
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 3) ?? (() => {
      const created: PdfRow = { y: item.y, items: [], text: '' }; rows.push(created); return created;
    })();
    row.items.push({ ...item, text });
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => ({
    ...row, items: row.items.sort((a, b) => a.x - b.x), text: row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '),
  }));
}
```

- [ ] **Step 4: Implement the detector with three independent labels per format.**

```ts
// src/pdf/detect.ts
import type { PdfRow } from './tokens';
import { normalized } from './tokens';

export type DetectedFormat = 'indonesia' | 'apqo' | 'unknown';
const markers = {
  indonesia: ['namaperusahaan', 'namapic', 'totalbiaya'],
  apqo: ['nameoforganization', 'registrationfee', 'participationlist'],
} as const;

export function detectFormat(rows: PdfRow[]): DetectedFormat {
  const source = normalized(rows.map((row) => row.text).join(' '));
  const matches = (format: keyof typeof markers) => markers[format]
    .filter((marker) => source.includes(marker)).length;
  if (matches('indonesia') >= 2) return 'indonesia';
  if (matches('apqo') >= 2) return 'apqo';
  return 'unknown';
}
```

- [ ] **Step 5: Run the detector test.**

Run: `npm test -- tests/pdf-parsers.test.ts`

Expected: PASS for all three detector cases.

- [ ] **Step 6: Commit the model boundary.**

```bash
git add src/document-types.ts src/pdf/tokens.ts src/pdf/detect.ts tests/pdf-parsers.test.ts src/types.ts
git commit -m "feat: add document format detection"
```

### Task 2: Split parsers and parse APQO labels, fees, and participants

**Files:**

- Create: `src/pdf/indonesia.ts`
- Create: `src/pdf/apqo.ts`
- Modify: `src/pdf-parser.ts`
- Modify: `tests/pdf-parsers.test.ts`

- [ ] **Step 1: Add failing APQO parser tests with positional input.**

```ts
import { parseApqo } from '../src/pdf/apqo';

it('reads APQO identity, fees, and participant rows', () => {
  const rows = toRows([
    token('Name of Person in Charge', 60, 620), token(':', 290, 620), token('Septian Eko Hari Wicaksono', 310, 620),
    token('Name of Organization', 60, 590), token(':', 290, 590), token('PT Pamapersada Nusantara', 310, 590),
    token('Presenter', 100, 460), token('6,000,000', 350, 460), token('4', 470, 460), token('24,000,000', 520, 460),
    token('Observer', 100, 440), token('6,500,000', 350, 440), token('1', 470, 440), token('6,500,000', 520, 440),
    token('Presenter', 100, 330), token('Mr', 220, 330), token('AHMAD ZAKI', 300, 330), token('MAS JEKI', 470, 330),
  ]);
  const form = parseApqo(rows);
  expect(form.company).toBe('PT Pamapersada Nusantara');
  expect(form.fees).toEqual([
    { role: 'Presenter', price: 6000000, quantity: 4, total: 24000000 },
    { role: 'Observer', price: 6500000, quantity: 1, total: 6500000 },
  ]);
  expect(form.participants).toEqual([{ role: 'Presenter', salutation: 'Mr', name: 'AHMAD ZAKI', team: 'MAS JEKI' }]);
});
```

- [ ] **Step 2: Run the test and verify it fails.**

Run: `npm test -- tests/pdf-parsers.test.ts`

Expected: FAIL because `parseApqo` does not exist.

- [ ] **Step 3: Move the present Indonesian parser behind the shared parser interface.**

```ts
// src/pdf/indonesia.ts
import { emptyForm, type FormData, type Participant } from '../types';
import type { PdfRow } from './tokens';
import { cleanText } from './tokens';

export function parseIndonesia(source: PdfRow[], invoiceNo: number): FormData {
  const valueFor = (label: string) => {
    const row = source.find((candidate) => candidate.text.toLowerCase().includes(label.toLowerCase()));
    if (!row) return '';
    const index = row.items.findIndex((item) => item.text.toLowerCase().includes(label.toLowerCase()));
    return cleanText(row.items.slice(index + 1).map((item) => item.text).join(' ').replace(/^:\\s*/, ''));
  };
  const amount = (value: string) => Number(value.replace(/[^0-9]/g, '')) || 0;
  const form = emptyForm(invoiceNo);
  form.company = valueFor('Nama Perusahaan'); form.pic = valueFor('Nama PIC');
  form.npwp = valueFor('NPWP Perusahaan'); form.npwpAddress = valueFor('Alamat NPWP');
  form.deliveryAddress = valueFor('Alamat Pengiriman Invoice'); form.phone = valueFor('No. Telp / HP'); form.email = valueFor('Email');
  const totalRow = source.find((candidate) => /TOTAL BIAYA/i.test(candidate.text));
  form.sourceTotal = totalRow?.items.filter((item) => item.x > 450).map((item) => amount(item.text)).find(Boolean) ?? null;
  for (const [key, label] of [['individu', 'Individu'], ['tim', 'Tim >'], ['peninjau', 'Peserta Peninjau'], ['qsi', 'Quality Strategic'], ['gala', 'Gala Dinner']] as const) {
    const row = source.find((candidate) => candidate.text.includes(label)); if (!row) continue;
    const nearby = source.filter((candidate) => Math.abs(candidate.y - row.y) < 3).flatMap((candidate) => candidate.items);
    const fee = form.fees.find((candidate) => candidate.key === key)!;
    fee.quantity = nearby.filter((item) => item.x > 365 && item.x < 420).map((item) => amount(item.text)).find(Boolean) ?? 0;
    fee.total = nearby.filter((item) => item.x > 450).map((item) => amount(item.text)).find(Boolean) ?? 0;
  }
  form.participants = source.filter((row) => row.y < 390 && row.y > 220).flatMap((row) => {
    const role = row.items.find((item) => /^(Penyaji|Peninjau)$/i.test(item.text))?.text as Participant['role'] | undefined;
    return role ? [{ role, name: row.items.find((item) => item.x > 200 && item.x < 350)?.text ?? '', team: row.items.find((item) => item.x > 380 && item.x < 440)?.text ?? '', shirt: row.items.find((item) => item.x > 445)?.text ?? '' }] : [];
  });
  return form;
}
```

Keep the current labels, fee keys, participant coordinate range, and `sourceTotal` behavior. Replace the former private `rows()` helper with `toRows()` from `src/pdf/tokens.ts`. Keep `parsePdfItems` as a compatibility wrapper until Task 3 updates its callers.

- [ ] **Step 4: Implement APQO helpers and parser.**

```ts
// src/pdf/apqo.ts
import { emptyApqoForm, type ApqoRole } from '../document-types';
import type { PdfRow } from './tokens';
import { cleanText } from './tokens';

const amount = (value: string) => Number(value.replace(/[^0-9]/g, '')) || 0;
const afterLabel = (rows: PdfRow[], label: string) => {
  const row = rows.find((candidate) => candidate.text.toLowerCase().includes(label.toLowerCase()));
  if (!row) return '';
  const index = row.items.findIndex((item) => item.text.toLowerCase().includes(label.toLowerCase()));
  return cleanText(row.items.slice(index + 1).map((item) => item.text).join(' ').replace(/^:\s*/, ''));
};

export function parseApqo(rows: PdfRow[]) {
  const form = emptyApqoForm();
  form.pic = afterLabel(rows, 'Name of Person in Charge');
  form.designation = afterLabel(rows, 'Designation');
  form.company = afterLabel(rows, 'Name of Organization');
  form.address = afterLabel(rows, 'Address');
  form.landline = afterLabel(rows, 'Tel (Land Line)');
  form.mobile = afterLabel(rows, 'Mobile Number');
  form.emails = rows.filter((row) => /@/.test(row.text)).flatMap((row) => row.items)
    .map((item) => item.text).filter((value) => /@/.test(value)).slice(0, 4);
  form.fees = (['Presenter', 'Observer'] as const).map((role) => {
    const row = rows.find((candidate) => new RegExp(`\\b${role}\\b`, 'i').test(candidate.text) && candidate.y > 360);
    const cells = row?.items ?? [];
    return {
      role: role as ApqoRole,
      price: amount(cells.find((item) => item.x > 300 && item.x < 460)?.text ?? ''),
      quantity: amount(cells.find((item) => item.x >= 460 && item.x < 520)?.text ?? ''),
      total: amount(cells.find((item) => item.x >= 520)?.text ?? ''),
    };
  });
  form.participants = rows.filter((row) => row.y < 380 && row.y > 150).flatMap((row) => {
    const role = row.items.find((item) => /^(Presenter|Observer)$/i.test(item.text))?.text as ApqoRole | undefined;
    if (!role) return [];
    return [{ role, salutation: row.items.find((item) => item.x > 180 && item.x < 280)?.text ?? '', name: row.items.find((item) => item.x >= 280 && item.x < 460)?.text ?? '', team: row.items.find((item) => item.x >= 460)?.text ?? '' }];
  });
  return form;
}
```

- [ ] **Step 5: Replace `parsePdfItems` with a format-dispatching facade.**

```ts
export function parsePdfItems(items: PdfItem[], invoiceNo: number, source: ExtractionSource = 'digital'): ParsedDocument {
  const rows = toRows(items.map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] })));
  const format = detectFormat(rows);
  if (format === 'indonesia') return { format, source, form: parseIndonesia(rows, invoiceNo) };
  if (format === 'apqo') return { format, source, form: parseApqo(rows) };
  throw new Error('Format formulir tidak dikenali. Gunakan formulir Indonesia atau APQO.');
}
```

- [ ] **Step 6: Run parser tests and the existing test suite.**

Run: `npm test -- tests/pdf-parsers.test.ts tests/batch.test.ts`

Expected: PASS after adapting existing assertions to use `document.format === 'indonesia'` before accessing `form`.

- [ ] **Step 7: Commit parser work.**

```bash
git add src/pdf src/pdf-parser.ts tests/pdf-parsers.test.ts tests/batch.test.ts
git commit -m "feat: parse APQO registration forms"
```

### Task 3: Add local OCR fallback for both formats

**Files:**

- Create: `src/ocr.ts`
- Create: `src/pdf/extract.ts`
- Create: `scripts/vendor-ocr-assets.mjs`
- Modify: `package.json`
- Modify: `scripts/embed-templates.mjs`
- Modify: `src/pdf-parser.ts`
- Modify: `tests/pdf-parsers.test.ts`

- [ ] **Step 1: Add a failing extraction test that uses an OCR stub only when the digital text is insufficient.**

```ts
it('uses OCR only when the PDF text layer has too little usable text', async () => {
  const ocr = { recognize: vi.fn().mockResolvedValue([token('Name of Organization'), token('Registration Fee')]) };
  const extract = await extractTokens({ getTextContent: async () => ({ items: [] }) } as never, ocr);
  expect(extract.source).toBe('ocr');
  expect(ocr.recognize).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test and verify it fails.**

Run: `npm test -- tests/pdf-parsers.test.ts`

Expected: FAIL because `extractTokens` does not exist.

- [ ] **Step 3: Install and pin local OCR dependencies.**

Run:

```bash
npm install tesseract.js@7.0.0 @tesseract.js-data/eng@1.0.0 @tesseract.js-data/ind@1.0.0
```

Expected: `package.json` and `package-lock.json` contain exactly these direct dependencies.

- [ ] **Step 4: Vendor OCR assets during build.**

```js
// scripts/vendor-ocr-assets.mjs
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const destination = resolve('public/vendor/ocr');
await mkdir(destination, { recursive: true });
await cp(resolve('node_modules/tesseract.js/dist/worker.min.js'), resolve(destination, 'worker.min.js'));
await cp(resolve('node_modules/tesseract.js-core'), resolve(destination, 'core'), { recursive: true });
await cp(resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), resolve(destination, 'eng.traineddata.gz'));
await cp(resolve('node_modules/@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz'), resolve(destination, 'ind.traineddata.gz'));
```

Change the `prebuild` script to run `generate:templates` and `vendor:ocr`, then add `vendor:ocr` as `node scripts/vendor-ocr-assets.mjs`. Verify the actual package file paths after installation and make the copy list match them exactly.

- [ ] **Step 5: Implement the browser worker wrapper with fixed local paths.**

```ts
// src/ocr.ts
import type { PositionedToken } from './pdf/tokens';

export type OcrClient = { recognize(canvas: HTMLCanvasElement): Promise<PositionedToken[]>; terminate(): Promise<void> };
export async function createOcrClient(): Promise<OcrClient> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'ind'], 1, {
    workerPath: '/vendor/ocr/worker.min.js', corePath: '/vendor/ocr/core', langPath: '/vendor/ocr',
  });
  return {
    async recognize(canvas) {
      const result = await worker.recognize(canvas, {}, { blocks: true });
      return result.data.blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words.map((word) => ({ text: word.text, x: word.bbox.x0, y: canvas.height - word.bbox.y1 })))));
    },
    terminate: () => worker.terminate(),
  };
}
```

- [ ] **Step 6: Implement digital-first extraction and OCR canvas fallback.**

```ts
// src/pdf/extract.ts
export async function extractTokens(page: PdfPageLike, ocr: Pick<OcrClient, 'recognize'>): Promise<{ source: ExtractionSource; tokens: PositionedToken[] }> {
  const content = await page.getTextContent();
  const digital = (content.items as PdfItem[]).map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] })).filter((item) => cleanText(item.text));
  if (digital.map((item) => item.text).join('').length >= 80) return { source: 'digital', tokens: digital };
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  return { source: 'ocr', tokens: await ocr.recognize(canvas) };
}
```

Keep one `OcrClient` in `parsePdfBatch` for every scan selected in one upload operation, terminate it in `finally`, and report `Menjalankan OCR` through the progress callback. Do not instantiate a worker for digital PDFs.

- [ ] **Step 7: Run focused tests, then build.**

Run:

```bash
npm test -- tests/pdf-parsers.test.ts
npm run build
```

Expected: tests pass and `out/vendor/ocr/` includes worker, core, `eng.traineddata.gz`, and `ind.traineddata.gz`.

- [ ] **Step 8: Commit OCR support.**

```bash
git add package.json package-lock.json scripts/vendor-ocr-assets.mjs public/vendor/ocr src/ocr.ts src/pdf/extract.ts src/pdf-parser.ts tests/pdf-parsers.test.ts
git commit -m "feat: add local OCR fallback for scanned PDFs"
```

### Task 4: Generate APQO registration workbooks from the client template

**Files:**

- Create: `assets/templates/apqo-registration.xlsx`
- Create: `src/xlsx/apqo-registration.ts`
- Create: `tests/apqo-workbook.test.ts`
- Modify: `scripts/embed-templates.mjs`
- Modify: `src/templates.generated.ts`
- Modify: `src/xlsx/xml.ts`

- [ ] **Step 1: Create a blank APQO template and add it to the embed script.**

Start from `/Users/test/Downloads/Pamaoersada.2 (1).xlsx`, preserve its sheet name, merges, row and column dimensions, styles, borders, print area, page setup, and formula cells. Clear only variable values before saving it as `assets/templates/apqo-registration.xlsx`: `H12:H19`, `J18:J19`, `H23:K25`, `C32:K35`, `K47:K48`, and any data cells inserted for a participant overflow. Labels, fee headings, Notes, and static contact information remain unchanged. Extend the generated module with `apqoRegistrationTemplate` and keep the current invoice and receipt exports unchanged.

- [ ] **Step 2: Write failing workbook tests before adding the generator.**

```ts
import JSZip from 'jszip';
import { createApqoRegistration } from '../src/xlsx/apqo-registration';
import { apqoRegistrationTemplate } from '../src/templates.generated';

it('writes APQO values without changing the client template structure', async () => {
  const book = await JSZip.loadAsync(await (await createApqoRegistration(apqoRegistrationTemplate, apqoForm())).arrayBuffer());
  const sheet = await book.file('xl/worksheets/sheet1.xml')!.async('text');
  expect(sheet).toContain('PT Contoh APQO');
  expect(sheet).toContain('=SUM(K23:K24)');
  expect(book.file('xl/printerSettings/printerSettings1.bin')).toBeTruthy();
});

it('adds a styled participant row before Notes when the template capacity is exceeded', async () => {
  const form = apqoForm();
  form.participants = Array.from({ length: 5 }, (_, index) => ({ role: 'Presenter', salutation: 'Mr', name: `Peserta ${index + 1}`, team: 'Team A' }));
  const book = await JSZip.loadAsync(await (await createApqoRegistration(apqoRegistrationTemplate, form)).arrayBuffer());
  const sheet = await book.file('xl/worksheets/sheet1.xml')!.async('text');
  expect(sheet).toContain('Peserta 5');
  expect(sheet).toMatch(/<row r="38"/);
});
```

- [ ] **Step 3: Run the tests and verify they fail.**

Run: `npm test -- tests/apqo-workbook.test.ts`

Expected: FAIL because `createApqoRegistration` does not exist.

- [ ] **Step 4: Add XML helpers that preserve cell styles and update formula caches.**

```ts
// src/xlsx/xml.ts
export function replaceFormulaCell(sheet: string, reference: string, style: number, formula: string, value: number) {
  const pattern = new RegExp(`<c r="${reference}"[^>]*?(?:/>|>[\\s\\S]*?<\\/c>)`);
  const next = `<c r="${reference}" s="${style}"><f>${formula}</f><v>${value}</v></c>`;
  if (!pattern.test(sheet)) throw new Error(`Sel template ${reference} tidak ditemukan.`);
  return sheet.replace(pattern, next);
}
```

- [ ] **Step 5: Implement the APQO generator with explicit template-cell mapping.**

```ts
const identityCells: Array<[keyof ApqoForm, string]> = [
  ['pic', 'H12'], ['designation', 'H13'], ['company', 'H14'], ['address', 'H15'],
  ['landline', 'H16'], ['mobile', 'H17'], ['place', 'K47'], ['signer', 'K48'],
];
const emailCells = ['H18', 'H19', 'J18', 'J19'];
const feeRows: Array<[ApqoRole, number]> = [['Presenter', 23], ['Observer', 24]];
const participantStart = 32;
const participantCapacity = 4;
```

For each fee row write price to `H`, quantity to `J`, and `=H{row}*J{row}` with the numeric cache to `K`. Set `K25` to `=SUM(K23:K24)` and its matching cache. Write participant number, role, salutation, full name, and team to `C`, `D`, `E`, `F`, and `I` respectively. Clear all four template email cells and every unused participant cell before writing values.

For participant overflow, clone row 35, insert it before row 36, then shift each following row, cell reference, merge range, print-area range, and formula reference by the overflow count. Remove `xl/calcChain.xml`, remove its relationship and content-type entry, and set `<calcPr ... fullCalcOnLoad="1" forceFullCalc="1"/>`.

- [ ] **Step 6: Run APQO workbook tests and the existing generator tests.**

Run: `npm test -- tests/apqo-workbook.test.ts tests/generator.test.ts`

Expected: PASS. Existing invoice and receipt tests remain unchanged.

- [ ] **Step 7: Commit the APQO workbook generator.**

```bash
git add assets/templates/apqo-registration.xlsx scripts/embed-templates.mjs src/templates.generated.ts src/xlsx/xml.ts src/xlsx/apqo-registration.ts tests/apqo-workbook.test.ts
git commit -m "feat: generate APQO registration workbooks"
```

### Task 5: Route downloads and mixed batches by document format

**Files:**

- Modify: `src/batch.ts`
- Modify: `src/batch-download.ts`
- Modify: `tests/batch.test.ts`

- [ ] **Step 1: Write failing mixed-batch tests.**

```ts
it('creates APQO ZIP files only for APQO documents', async () => {
  const archive = await createApqoBatchZip([
    { fileName: 'apqo.pdf', document: { format: 'apqo', source: 'digital', form: apqoForm() } },
  ]);
  const zip = await JSZip.loadAsync(await archive.arrayBuffer());
  expect(Object.keys(zip.files)).toEqual(['apqo.xlsx']);
});

it('does not include APQO documents in invoice-number validation', () => {
  expect(repeatedInvoiceNumbers([
    { document: { format: 'indonesia', source: 'digital', form: emptyForm(225) } },
    { document: { format: 'apqo', source: 'digital', form: apqoForm() } },
  ])).toEqual([]);
});
```

- [ ] **Step 2: Run the batch test and verify it fails.**

Run: `npm test -- tests/batch.test.ts`

Expected: FAIL because APQO routing functions are absent.

- [ ] **Step 3: Make batch helpers operate on `ParsedDocument`.**

```ts
export const isIndonesia = (entry: { document: ParsedDocument }) => entry.document.format === 'indonesia';
export const apqoWorkbookName = (fileName: string) => `${fileName.replace(/\.pdf$/i, '') || 'formulir-apqo'}.xlsx`;
export const repeatedInvoiceNumbers = (entries: ReadonlyArray<{ document: ParsedDocument }>) => {
  const numbers = entries.filter(isIndonesia).map(({ document }) => document.form.invoiceNo);
  return numbers.filter((number, index) => numbers.indexOf(number) !== index).filter((number, index, values) => values.indexOf(number) === index).sort((a, b) => a - b);
};
```

- [ ] **Step 4: Add APQO output functions without changing Indonesian functions.**

```ts
export async function createApqoBatchZip(entries: Array<{ fileName: string; document: Extract<ParsedDocument, { format: 'apqo' }> }>, onProgress?: (done: number, total: number) => void) {
  const zip = new JSZip();
  for (const [index, entry] of entries.entries()) {
    const workbook = await createApqoRegistration(apqoRegistrationTemplate, entry.document.form);
    zip.file(apqoWorkbookName(entry.fileName), new Uint8Array(await workbook.arrayBuffer()));
    onProgress?.(index + 1, entries.length);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
```

- [ ] **Step 5: Run all batch and generator tests.**

Run: `npm test -- tests/batch.test.ts tests/generator.test.ts tests/apqo-workbook.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit routing behavior.**

```bash
git add src/batch.ts src/batch-download.ts tests/batch.test.ts
git commit -m "feat: route APQO batch downloads to registration workbooks"
```

### Task 6: Keep one user flow while giving each format the right review and download controls

**Files:**

- Create: `app/indonesia-review.tsx`
- Create: `app/apqo-review.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Move the current review JSX to `IndonesiaReview` without behavior changes.**

Create `IndonesiaReview` with the existing review `<section>` from `app/page.tsx`, beginning at `{form && <section className="review">` and ending at its closing section tag. Pass `form`, `busy`, `editActive`, `downloadOne('invoice')`, and `downloadOne('receipt')` as explicit props. Keep every identity field, fee field, participant field, total calculation, warning message, and control label unchanged.

- [ ] **Step 2: Add the APQO review editor with every template field.**

```tsx
export function ApqoReview({ form, busy, onChange, onDownload }: {
  form: ApqoForm; busy: boolean; onChange: (change: (previous: ApqoForm) => ApqoForm) => void; onDownload(): void;
}) {
  return <section className="review apqo-review">
    <div className="toolbar"><div><p className="kicker">APQO</p><h2>{form.company || 'Organisasi belum diisi'}</h2></div><button type="button" disabled={busy} onClick={onDownload}>Unduh formulir APQO</button></div>
  </section>;
}
```

The completed component must use controlled fields for every `ApqoForm` property, a select for the two role values, number inputs for price and quantity, and a button that appends an empty participant. It must show the calculated total as the sum of its two fee totals.

- [ ] **Step 3: Replace page state with a document union and progress callback.**

```ts
type Entry = { id: string; fileName: string; document: ParsedDocument };
const [entries, setEntries] = useState<Entry[]>([]);
const activeDocument = active?.document;
```

Pass `{ onProgress: setProgress }` into parsing. On `digital` entries show `Teks digital`; on `ocr` entries show `Hasil OCR`. Keep invoice numbers and localStorage updates restricted to Indonesia entries.

- [ ] **Step 4: Render download controls only for supported output types.**

```tsx
{activeDocument?.format === 'indonesia' && <IndonesiaReview form={activeDocument.form} busy={busy} onChange={editIndonesia} onDownloadInvoice={() => void downloadIndonesia('invoice')} onDownloadReceipt={() => void downloadIndonesia('receipt')} />}
{activeDocument?.format === 'apqo' && <ApqoReview form={activeDocument.form} busy={busy} onChange={editApqo} onDownload={() => void downloadApqo(active)} />}
```

In a batch, calculate `indonesiaEntries` and `apqoEntries` separately. Show a ZIP control only when its group contains at least two entries. Update the empty dropzone text to state that digital PDFs and scans are accepted, then remove the claim that scans cannot be processed.

- [ ] **Step 5: Add small format/source labels without changing the established page character.**

```css
.document-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.document-meta span { border: 1px solid var(--line); color: var(--ink); font-size: .72rem; padding: 2px 6px; }
.apqo-fees { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 760px) { .apqo-fees { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Verify keyboard behavior and the three UI states.**

Run: `npm run dev`

Manual checks:

1. Empty state accepts PDF selection by keyboard and describes OCR support.
2. Loading state announces `Membaca teks` or `Menjalankan OCR` with `role="status"`.
3. Invalid, unknown, and OCR-failure inputs appear in the existing alert region.
4. Indonesian entry exposes only invoice and kwitansi controls.
5. APQO entry exposes only its registration-workbook control.
6. All controls are reachable by Tab and show the existing focus outline.

- [ ] **Step 7: Commit the user-flow changes.**

```bash
git add app/page.tsx app/indonesia-review.tsx app/apqo-review.tsx app/globals.css
git commit -m "feat: review and download two registration formats"
```

### Task 7: Finish verification and document the client-visible behavior

**Files:**

- Modify: `README.md`
- Modify: `tests/batch.test.ts`
- Modify: `tests/pdf-parsers.test.ts`

- [ ] **Step 1: Add the final user-facing README section.**

```md
## Format formulir

- Formulir Indonesia menghasilkan invoice dan kwitansi.
- Formulir APQO menghasilkan workbook registrasi APQO.
- PDF digital dibaca dari text layer. Untuk scan, OCR berjalan di browser dan hasilnya tetap perlu ditinjau sebelum diunduh.
```

- [ ] **Step 2: Run the full automated suite.**

Run: `npm test`

Expected: PASS with Indonesian, APQO, OCR-stub, workbook, and mixed-batch coverage.

- [ ] **Step 3: Build the static application and confirm the local OCR assets are exported.**

Run:

```bash
npm run build
test -f out/vendor/ocr/worker.min.js
test -f out/vendor/ocr/eng.traineddata.gz
test -f out/vendor/ocr/ind.traineddata.gz
```

Expected: build exits with code 0 and every file check exits with code 0.

- [ ] **Step 4: Exercise real supplied samples locally.**

Run the app and upload `Papersada new 2.pdf` to confirm the APQO digital route. Upload `samora.pdf` to confirm the APQO OCR route. Confirm both open the APQO review editor and each downloads a workbook with the same template structure. Do not commit the supplied PDFs or their generated workbooks.

- [ ] **Step 5: Commit documentation and final verification.**

```bash
git add README.md tests/batch.test.ts tests/pdf-parsers.test.ts
git commit -m "docs: explain supported PDF formats and local OCR"
```
