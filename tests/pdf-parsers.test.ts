import { describe, expect, it, vi } from 'vitest';
import { detectFormat } from '../src/pdf/detect';
import { parseApqo } from '../src/pdf/apqo';
import { extractTokens } from '../src/pdf/extract';
import { toRows, type PositionedToken } from '../src/pdf/tokens';

const token = (text: string, x = 40, y = 700): PositionedToken => ({ text, x, y });

describe('detectFormat', () => {
  it('identifies the Indonesian registration form', () => {
    expect(detectFormat(toRows([
      token('Nama Perusahaan'),
      token('Nama PIC', 40, 680),
      token('TOTAL BIAYA', 40, 660),
    ]))).toBe('indonesia');
  });

  it('identifies APQO after OCR normalizes punctuation and casing', () => {
    expect(detectFormat(toRows([
      token('name of organizat1on'),
      token('REGISTRATION FEE', 40, 680),
      token('participation list', 40, 660),
    ]))).toBe('apqo');
  });

  it('rejects documents without enough format markers', () => {
    expect(detectFormat(toRows([token('Registration form')]))).toBe('unknown');
  });
});

describe('parseApqo', () => {
  it('reads identity, fees, and participant rows', () => {
    const rows = toRows([
      token('Name of Person in Charge', 60, 620), token(':', 290, 620), token('Septian Eko Hari Wicaksono', 310, 620),
      token('Name of Organization', 60, 590), token(':', 290, 590), token('PT Pamapersada Nusantara', 310, 590),
      token('Presenter', 100, 460), token('6,000,000', 350, 460), token('4', 440, 460), token('24,000,000', 520, 460),
      token('Observer', 100, 440), token('6,500,000', 350, 440), token('1', 440, 440), token('6,500,000', 520, 440),
      token('1 . ahmadzaki @ pamapersada.com', 60, 400),
      token('2 . aprian.bakti @ pamapersada.com', 60, 380),
      token('Presenter', 100, 330), token('Mr', 170, 330), token('AHMAD ZAKI', 260, 330), token('MAS JEKI', 430, 330),
      token('Secretariat : Jakarta, 25 September 2026', 60, 120),
      token('(Renggo Wijiarto.)', 470, 80),
    ]);

    const form = parseApqo(rows);
    expect(form.company).toBe('PT Pamapersada Nusantara');
    expect(form.fees).toEqual([
      { role: 'Presenter', price: 6000000, quantity: 4, total: 24000000 },
      { role: 'Observer', price: 6500000, quantity: 1, total: 6500000 },
    ]);
    expect(form.participants).toEqual([
      { role: 'Presenter', salutation: 'Mr', name: 'AHMAD ZAKI', team: 'MAS JEKI' },
    ]);
    expect(form.emails.slice(0, 2)).toEqual(['ahmadzaki@pamapersada.com', 'aprian.bakti@pamapersada.com']);
    expect(form.place).toBe('Jakarta');
    expect(form.date).toBe('25 September 2026');
    expect(form.signer).toBe('Renggo Wijiarto');
  });

  it('keeps table values from a sparse-text scan', () => {
    const rows = toRows([
      token('1. dhiyan@samoragroup.co.id', 288, 648), token('3. aldana@sujsugar.com', 404, 648),
      token('2. hirpanar@sujsugar.com', 288, 638), token('4. husnimubarakk120@gmail.com', 403, 638),
      token('Presenter', 58, 586), token('6.000.000', 365, 586), token('4', 427, 586), token('24.000.000', 524, 586),
      token('Observer', 56, 574), token('6.500.000', 365, 574), token('1', 427, 574), token('6.500.000', 527, 574),
      token('PARTICIPATION LIST', 40, 529),
      token('Presenter', 74, 469), token('Mr', 157, 469), token('HUSNI', 261, 469), token('BANYU IRENG', 432, 469),
      token('Presenter', 74, 458), token('Mr', 157, 458), token('ALFIAN ILHAM ALJIHAD', 236, 458), token('BANYU IRENG', 432, 458),
      token('Presenter', 74, 447), token('Ms', 157, 447), token('HIRPANA RAHAYU', 244, 447), token('BANYU IRENG', 432, 447),
      token('Presenter', 74, 436), token('Ms', 157, 436), token('ALDANA THIFALNI', 243, 436), token('BANYU IRENG', 432, 436),
      token('Observer', 75, 425), token('Ms', 157, 425), token('DHIYA NAJMAH PRATIWI', 234, 425),
      token('Notes', 39, 295),
    ]);

    const form = parseApqo(rows);
    expect(form.fees).toEqual([
      { role: 'Presenter', price: 6000000, quantity: 4, total: 24000000 },
      { role: 'Observer', price: 6500000, quantity: 1, total: 6500000 },
    ]);
    expect(form.participants).toHaveLength(5);
    expect(form.participants[0]).toMatchObject({ name: 'HUSNI', team: 'BANYU IRENG' });
    expect(form.participants[4]).toMatchObject({ role: 'Observer', name: 'DHIYA NAJMAH PRATIWI' });
    expect(form.emails).toEqual([
      'dhiyan@samoragroup.co.id',
      'hirpanar@sujsugar.com',
      'aldana@sujsugar.com',
      'husnimubarakk120@gmail.com',
    ]);
  });
});

describe('extractTokens', () => {
  it('keeps a usable PDF text layer and does not start OCR', async () => {
    const text = 'Name of Organization Registration Fee Participation List '.repeat(3);
    const getOcr = vi.fn();
    const extracted = await extractTokens({
      getTextContent: async () => ({ items: [{ str: text, transform: [1, 0, 0, 1, 10, 20] }] }),
      getViewport: vi.fn(),
      render: vi.fn(),
    } as never, getOcr);
    expect(extracted.source).toBe('digital');
    expect(getOcr).not.toHaveBeenCalled();
  });

  it('renders and recognizes a page when its text layer is insufficient', async () => {
    const canvas = { width: 0, height: 0, getContext: () => ({}) };
    vi.stubGlobal('document', { createElement: () => canvas });
    const recognize = vi.fn().mockResolvedValue([token('Name of Organization', 20, 40)]);
    const extracted = await extractTokens({
      getTextContent: async () => ({ items: [] }),
      getViewport: () => ({ width: 1200, height: 1600 }),
      render: () => ({ promise: Promise.resolve() }),
    } as never, async () => ({ recognize }));
    expect(extracted).toEqual({
      source: 'ocr',
      tokens: [{ text: 'Name of Organization', x: 20 / 3, y: 40 / 3 }],
    });
    expect(recognize).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
