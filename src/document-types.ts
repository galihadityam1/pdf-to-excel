import type { FormData } from './types';

export type DocumentFormat = 'indonesia' | 'apqo';
export type ExtractionSource = 'digital' | 'ocr';
export type ApqoRole = 'Presenter' | 'Observer';

export type ApqoFee = {
  role: ApqoRole;
  price: number;
  quantity: number;
  total: number;
};

export type ApqoParticipant = {
  role: ApqoRole;
  salutation: string;
  name: string;
  team: string;
};

export type ApqoForm = {
  pic: string;
  designation: string;
  company: string;
  address: string;
  landline: string;
  mobile: string;
  emails: string[];
  place: string;
  date: string;
  signer: string;
  fees: ApqoFee[];
  participants: ApqoParticipant[];
};

export type ParsedDocument =
  | { format: 'indonesia'; source: ExtractionSource; form: FormData }
  | { format: 'apqo'; source: ExtractionSource; form: ApqoForm };

export const emptyApqoForm = (): ApqoForm => ({
  pic: '',
  designation: '',
  company: '',
  address: '',
  landline: '',
  mobile: '',
  emails: ['', '', '', ''],
  place: '',
  date: new Date().toISOString().slice(0, 10),
  signer: '',
  fees: [
    { role: 'Presenter', price: 0, quantity: 0, total: 0 },
    { role: 'Observer', price: 0, quantity: 0, total: 0 },
  ],
  participants: [],
});
