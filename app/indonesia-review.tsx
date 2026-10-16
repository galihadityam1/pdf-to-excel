'use client';

import { feeTotal, grandTotal, rupiah, vat } from '../src/calculations';
import type { FormData } from '../src/types';

const identityFields = [
  ['company', 'Nama perusahaan'], ['pic', 'Nama PIC'], ['npwp', 'NPWP'],
  ['npwpAddress', 'Alamat NPWP'], ['deliveryAddress', 'Alamat kirim'],
  ['phone', 'No. HP'], ['email', 'Email'], ['greeting', 'Sapaan'], ['division', 'Divisi'],
] as const;

export function IndonesiaReview({
  form,
  busy,
  onChange,
  onRemove,
  onDownloadInvoice,
  onDownloadReceipt,
}: {
  form: FormData;
  busy: boolean;
  onChange: (change: (previous: FormData) => FormData) => void;
  onRemove: () => void;
  onDownloadInvoice: () => void;
  onDownloadReceipt: () => void;
}) {
  const total = feeTotal(form);
  const tax = vat(form);
  const all = grandTotal(form);

  return <section className="review" aria-labelledby="indonesia-review-heading">
    <div className="toolbar">
      <div><p className="kicker">Tinjau data TKMPN</p><h2 id="indonesia-review-heading">{form.company || 'Perusahaan belum diisi'}</h2></div>
      <div className="toolbar-actions">
        <button type="button" className="text-button" disabled={busy} onClick={onRemove}>Hapus PDF ini</button>
        <button type="button" disabled={busy} onClick={onDownloadInvoice}>Unduh invoice</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onDownloadReceipt}>Unduh kwitansi</button>
      </div>
    </div>
    <div className="grid">
      <fieldset disabled={busy}><legend>Identitas</legend>
        {identityFields.map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={(event) => onChange((old) => ({ ...old, [key]: event.target.value }))}/></label>)}
      </fieldset>
      <fieldset disabled={busy}><legend>Dokumen dan total</legend>
        <label>Nomor invoice<input type="number" min="1" step="1" value={form.invoiceNo} onChange={(event) => onChange((old) => ({ ...old, invoiceNo: Number(event.target.value) }))}/></label>
        <label>Tanggal<input type="date" value={form.date} onChange={(event) => onChange((old) => ({ ...old, date: event.target.value }))}/></label>
        <label>Total biaya di formulir<input type="number" min="0" value={form.sourceTotal ?? ''} onChange={(event) => onChange((old) => ({ ...old, sourceTotal: event.target.value === '' ? null : Number(event.target.value) }))}/></label>
        <dl><div><dt>Subtotal</dt><dd>{rupiah(total)}</dd></div><div><dt>PPN 11%</dt><dd>{rupiah(tax)}</dd></div><div><dt>Total hitungan</dt><dd>{rupiah(all)}</dd></div></dl>
        <p className={form.sourceTotal !== null && all === form.sourceTotal ? 'match' : 'warning'}>
          {form.sourceTotal === null ? 'Total formulir belum terbaca. Isi manual untuk memeriksa selisih.' : all === form.sourceTotal ? 'Cocok dengan total di formulir.' : `Selisih ${rupiah(all - form.sourceTotal)} dari formulir. Periksa rincian biaya.`}
        </p>
      </fieldset>
    </div>
    <fieldset disabled={busy}><legend>Kategori biaya</legend><div className="fees">{form.fees.map((fee, index) => <div key={fee.key}>
      <strong>{fee.label}</strong>
      <label>Jumlah<input type="number" min="0" value={fee.quantity} onChange={(event) => onChange((old) => ({ ...old, fees: old.fees.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item) }))}/></label>
      <label>Total<input type="number" min="0" value={fee.total} onChange={(event) => onChange((old) => ({ ...old, fees: old.fees.map((item, itemIndex) => itemIndex === index ? { ...item, total: Number(event.target.value) } : item) }))}/></label>
    </div>)}</div></fieldset>
    <fieldset disabled={busy}><legend>Peserta</legend><div className="table-scroll"><table><thead><tr><th>Peran</th><th>Nama</th><th>Tim</th><th>Kaos</th></tr></thead><tbody>{form.participants.map((participant, index) => <tr key={index}>{(['role', 'name', 'team', 'shirt'] as const).map((key) => <td key={key}><input aria-label={`${key} peserta ${index + 1}`} value={participant[key]} onChange={(event) => onChange((old) => ({ ...old, participants: old.participants.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item) }))}/></td>)}</tr>)}</tbody></table></div></fieldset>
  </section>;
}
