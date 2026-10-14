export type Role = 'Penyaji' | 'Peninjau';

export type Participant = { role: Role; name: string; team: string; shirt: string };
export type Fee = { key: 'individu' | 'tim' | 'peninjau' | 'qsi' | 'gala'; label: string; quantity: number; total: number };
export type FormData = {
  company: string; pic: string; npwp: string; npwpAddress: string; deliveryAddress: string;
  phone: string; email: string; greeting: string; division: string; invoiceNo: number; date: string;
  fees: Fee[]; participants: Participant[];
};

export const emptyForm = (invoiceNo = 225): FormData => ({
  company: '', pic: '', npwp: '', npwpAddress: '', deliveryAddress: '', phone: '', email: '', greeting: '', division: '',
  invoiceNo, date: new Date().toISOString().slice(0, 10),
  fees: [
    { key: 'individu', label: 'Penyaji Individu', quantity: 0, total: 0 },
    { key: 'tim', label: 'Penyaji Tim', quantity: 0, total: 0 },
    { key: 'peninjau', label: 'Peninjau', quantity: 0, total: 0 },
    { key: 'qsi', label: 'QSI', quantity: 0, total: 0 },
    { key: 'gala', label: 'Gala Dinner', quantity: 0, total: 0 },
  ], participants: [],
});
