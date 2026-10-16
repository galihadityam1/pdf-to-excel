'use client';

import type { ApqoForm, ApqoRole } from '../src/document-types';

const identityFields = [
  ['pic', 'Person in Charge'],
  ['designation', 'Designation'],
  ['company', 'Organization'],
  ['address', 'Address'],
  ['landline', 'Land line'],
  ['mobile', 'Mobile number'],
  ['place', 'Place'],
  ['date', 'Date'],
  ['signer', 'Signer'],
] as const;

export function ApqoReview({
  form,
  busy,
  onChange,
  onRemove,
  onDownload,
}: {
  form: ApqoForm;
  busy: boolean;
  onChange: (change: (previous: ApqoForm) => ApqoForm) => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const total = form.fees.reduce((sum, fee) => sum + fee.price * fee.quantity, 0);

  return <section className="review apqo-review" aria-labelledby="apqo-review-heading">
    <div className="toolbar">
      <div><p className="kicker">Tinjau data APQO</p><h2 id="apqo-review-heading">{form.company || 'Organisasi belum diisi'}</h2></div>
      <div className="toolbar-actions">
        <button type="button" className="text-button" disabled={busy} onClick={onRemove}>Hapus PDF ini</button>
        <button type="button" disabled={busy} onClick={onDownload}>Unduh formulir APQO</button>
      </div>
    </div>

    <div className="grid">
      <fieldset disabled={busy}><legend>Delegate details</legend>
        {identityFields.map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={(event) => onChange((old) => ({ ...old, [key]: event.target.value }))}/></label>)}
      </fieldset>
      <fieldset disabled={busy}><legend>Email dan total</legend>
        {form.emails.map((email, index) => <label key={index}>Email {index + 1}<input type="email" value={email} onChange={(event) => onChange((old) => ({ ...old, emails: old.emails.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))}/></label>)}
        <dl><div><dt>Total registrasi</dt><dd>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(total)}</dd></div></dl>
      </fieldset>
    </div>

    <fieldset disabled={busy}><legend>Registration fee</legend><div className="apqo-fees">{form.fees.map((fee, index) => <div key={fee.role}>
      <strong>{fee.role}</strong>
      <label>Biaya per peserta<input type="number" min="0" value={fee.price} onChange={(event) => onChange((old) => ({ ...old, fees: old.fees.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value), total: Number(event.target.value) * item.quantity } : item) }))}/></label>
      <label>Jumlah peserta<input type="number" min="0" value={fee.quantity} onChange={(event) => onChange((old) => ({ ...old, fees: old.fees.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value), total: item.price * Number(event.target.value) } : item) }))}/></label>
    </div>)}</div></fieldset>

    <fieldset disabled={busy}><legend>Participation list</legend>
      <div className="table-scroll"><table><thead><tr><th>Type</th><th>Salutation</th><th>Full name</th><th>Team</th><th><span className="visually-hidden">Tindakan</span></th></tr></thead><tbody>{form.participants.map((participant, index) => <tr key={index}>
        <td><select aria-label={`Type peserta ${index + 1}`} value={participant.role} onChange={(event) => onChange((old) => ({ ...old, participants: old.participants.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value as ApqoRole } : item) }))}><option>Presenter</option><option>Observer</option></select></td>
        <td><input aria-label={`Salutation peserta ${index + 1}`} value={participant.salutation} onChange={(event) => onChange((old) => ({ ...old, participants: old.participants.map((item, itemIndex) => itemIndex === index ? { ...item, salutation: event.target.value } : item) }))}/></td>
        <td><input aria-label={`Nama peserta ${index + 1}`} value={participant.name} onChange={(event) => onChange((old) => ({ ...old, participants: old.participants.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))}/></td>
        <td><input aria-label={`Tim peserta ${index + 1}`} value={participant.team} onChange={(event) => onChange((old) => ({ ...old, participants: old.participants.map((item, itemIndex) => itemIndex === index ? { ...item, team: event.target.value } : item) }))}/></td>
        <td><button type="button" className="text-button compact-button" onClick={() => onChange((old) => ({ ...old, participants: old.participants.filter((_item, itemIndex) => itemIndex !== index) }))}>Hapus</button></td>
      </tr>)}</tbody></table></div>
      <button type="button" className="secondary-button add-participant" onClick={() => onChange((old) => ({ ...old, participants: [...old.participants, { role: 'Presenter', salutation: '', name: '', team: '' }] }))}>Tambah peserta</button>
    </fieldset>
  </section>;
}
