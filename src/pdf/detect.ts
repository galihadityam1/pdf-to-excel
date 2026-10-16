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
