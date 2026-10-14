'use client';
import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { emptyForm, FormData } from '../src/types';
import { feeTotal, grandTotal, rupiah, vat } from '../src/calculations';
import { parsePdf } from '../src/pdf-parser';
import { invoiceTemplate, receiptTemplate } from '../src/templates.generated';
import { createInvoice } from '../src/xlsx/invoice';
import { createReceipt } from '../src/xlsx/receipt';

const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const safeName = (value: string) => value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() || 'PERUSAHAAN';
const nextInvoiceNo = (fallback = 225) => { try { return Number(window.localStorage.getItem('tkmpn-next-no')) || fallback; } catch { return fallback; } };

export default function Home() {
  const [form, setForm] = useState<FormData>(() => emptyForm(typeof window === 'undefined' ? 225 : nextInvoiceNo()));
  const [status, setStatus] = useState<'empty' | 'loading' | 'review' | 'error'>('empty'); const [message, setMessage] = useState('');
  const reviewFileInput = useRef<HTMLInputElement>(null);
  const update = (key: keyof FormData, value: string | number) => setForm((previous) => ({ ...previous, [key]: value }));
  const load = async (file?: File) => { if (!file) return; setMessage(''); setStatus('loading'); try { setForm(await parsePdf(file, nextInvoiceNo(form.invoiceNo))); setStatus('review'); } catch (error) { setMessage(error instanceof Error ? error.message : 'PDF tidak dapat diproses.'); setStatus('error'); } };
  const exportFiles = async () => { try { setMessage('Membuat dua workbook...'); const [invoice, receipt] = await Promise.all([createInvoice(invoiceTemplate, form), createReceipt(receiptTemplate, form)]); const name = safeName(form.company); download(invoice, `${form.invoiceNo} ${name}.xlsx`); download(receipt, `${form.invoiceNo} kwitansi ${name}.xlsx`); localStorage.setItem('tkmpn-next-no', String(form.invoiceNo + 1)); setMessage('Dua file XLSX berhasil dibuat.'); } catch { setMessage('Workbook gagal dibuat. Periksa data lalu coba kembali.'); } };
  const fileChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; void load(file); };
  const drop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); load(event.dataTransfer.files[0]); };
  const total = feeTotal(form), tax = vat(form), all = grandTotal(form);
  return <main><header><p className="kicker">WKM / TKMPN 2026</p><h1>Formulir menjadi dokumen penagihan.</h1><p>PDF digital diproses langsung di perangkat Anda.</p></header>
    {status !== 'review' && <label className="dropzone" onDrop={drop} onDragOver={(event) => event.preventDefault()}><input type="file" accept="application/pdf" onChange={fileChange}/><strong>{status === 'loading' ? 'Membaca formulir...' : 'Pilih atau jatuhkan PDF formulir'}</strong><span>PDF hasil scan tanpa text layer tidak dapat diproses.</span></label>}
    {status === 'error' && <p className="error" role="alert">{message}</p>}
    {status === 'review' && <section className="review"><div className="toolbar"><div><p className="kicker">Tinjau data</p><h2>{form.company || 'Perusahaan belum diisi'}</h2></div><div className="toolbar-actions"><input ref={reviewFileInput} className="review-file-input" type="file" accept="application/pdf" aria-label="Pilih PDF formulir lain" onChange={fileChange}/><button type="button" className="secondary-button" onClick={() => reviewFileInput.current?.click()}>Unggah file lain</button><button type="button" onClick={exportFiles}>Unduh invoice dan kwitansi</button></div></div>
      <div className="grid"><fieldset><legend>Identitas</legend>{[['company','Nama perusahaan'],['pic','Nama PIC'],['npwp','NPWP'],['npwpAddress','Alamat NPWP'],['deliveryAddress','Alamat kirim'],['phone','No. HP'],['email','Email'],['greeting','Sapaan'],['division','Divisi']].map(([key,label]) => <label key={key}>{label}<input value={String(form[key as keyof FormData] ?? '')} onChange={(event) => update(key as keyof FormData, event.target.value)}/></label>)}</fieldset>
      <fieldset><legend>Dokumen dan total</legend><label>Nomor invoice<input type="number" value={form.invoiceNo} onChange={(event) => update('invoiceNo', Number(event.target.value))}/></label><label>Tanggal<input type="date" value={form.date} onChange={(event) => update('date', event.target.value)}/></label><dl><div><dt>Subtotal</dt><dd>{rupiah(total)}</dd></div><div><dt>PPN 11%</dt><dd>{rupiah(tax)}</dd></div><div><dt>Total biaya</dt><dd>{rupiah(all)}</dd></div></dl><p className={all === 40182000 ? 'match' : 'warning'}>{all === 40182000 ? 'Cocok dengan total formulir contoh.' : 'Periksa selisih total dengan formulir.'}</p></fieldset></div>
      <fieldset><legend>Kategori biaya</legend><div className="fees">{form.fees.map((fee, index) => <div key={fee.key}><strong>{fee.label}</strong><label>Jumlah<input type="number" value={fee.quantity} onChange={(event) => setForm((old) => ({...old, fees: old.fees.map((item,i) => i === index ? {...item, quantity: Number(event.target.value)} : item)}))}/></label><label>Total<input type="number" value={fee.total} onChange={(event) => setForm((old) => ({...old, fees: old.fees.map((item,i) => i === index ? {...item, total: Number(event.target.value)} : item)}))}/></label></div>)}</div></fieldset>
      <fieldset><legend>Peserta</legend><table><thead><tr><th>Peran</th><th>Nama</th><th>Tim</th><th>Kaos</th></tr></thead><tbody>{form.participants.map((participant,index) => <tr key={index}>{(['role','name','team','shirt'] as const).map((key) => <td key={key}><input value={participant[key]} onChange={(event) => setForm((old) => ({...old, participants: old.participants.map((item,i) => i === index ? {...item,[key]: event.target.value} : item)}))}/></td>)}</tr>)}</tbody></table></fieldset><p className="notice" role="status">{message}</p></section>}
  </main>;
}
