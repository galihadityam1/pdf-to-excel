import { FormData } from './types';

export const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
export const feeTotal = (form: FormData) => form.fees.reduce((sum, fee) => sum + fee.total, 0);
export const vat = (form: FormData) => Math.round(feeTotal(form) * 0.11);
export const grandTotal = (form: FormData) => feeTotal(form) + vat(form);
export const unitPrice = (quantity: number, total: number) => quantity ? Math.round(total / quantity) : 0;
export const romanMonth = (date: string) => ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][new Date(`${date}T12:00:00`).getMonth()];
export const excelDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
};
