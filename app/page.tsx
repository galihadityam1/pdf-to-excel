'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { createBatchZip, createWorkbook, WorkbookKind } from '../src/batch-download';
import { fileKey, MAX_BATCH_FILES, nextBatchNumber, repeatedInvoiceNumbers, workbookName } from '../src/batch';
import { feeTotal, grandTotal, rupiah, vat } from '../src/calculations';
import { parsePdf } from '../src/pdf-parser';
import { FormData } from '../src/types';

type Entry = { id: string; fileName: string; form: FormData };

const identityFields = [
  ['company', 'Nama perusahaan'], ['pic', 'Nama PIC'], ['npwp', 'NPWP'],
  ['npwpAddress', 'Alamat NPWP'], ['deliveryAddress', 'Alamat kirim'],
  ['phone', 'No. HP'], ['email', 'Email'], ['greeting', 'Sapaan'], ['division', 'Divisi'],
] as const;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function storedNextNumber() {
  try { return Number(window.localStorage.getItem('tkmpn-next-no')) || 225; }
  catch { return 225; }
}

function saveNextNumber(invoiceNumbers: number[]) {
  try {
    window.localStorage.setItem('tkmpn-next-no', String(Math.max(storedNextNumber(), ...invoiceNumbers.map((number) => number + 1))));
    return true;
  } catch { return false; }
}

function exportProblem(entries: Entry[], targets = entries) {
  const invalid = targets.find(({ form }) => !Number.isInteger(form.invoiceNo) || form.invoiceNo < 1 || !form.company.trim());
  if (invalid) return `Lengkapi perusahaan dan nomor invoice yang valid untuk ${invalid.fileName}.`;
  const repeated = repeatedInvoiceNumbers(entries);
  return repeated.length ? `Nomor invoice ${repeated.join(', ')} dipakai lebih dari sekali. Perbaiki sebelum mengunduh.` : '';
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const moreFileInput = useRef<HTMLInputElement>(null);
  const active = entries.find((entry) => entry.id === activeId) ?? entries[0];
  const form = active?.form;

  async function addFiles(files: File[]) {
    if (busy || !files.length) return;
    setBusy(true);
    setIssues([]);
    setMessage('');
    const added: Entry[] = [];
    const errors: string[] = [];
    const known = new Set(entries.map((entry) => entry.id));
    let nextNo = nextBatchNumber(entries, storedNextNumber());

    for (const [index, file] of files.entries()) {
      if (entries.length + added.length >= MAX_BATCH_FILES) {
        errors.push(`Batas ${MAX_BATCH_FILES} PDF per batch tercapai. ${files.length - index} berkas belum diproses.`);
        break;
      }
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        errors.push(`${file.name}: bukan berkas PDF.`);
        continue;
      }
      const id = fileKey(file);
      if (known.has(id)) {
        errors.push(`${file.name}: sudah ada dalam daftar.`);
        continue;
      }
      setProgress(`Membaca PDF ${index + 1} dari ${files.length}: ${file.name}`);
      try {
        const parsed = await parsePdf(file, nextNo);
        added.push({ id, fileName: file.name, form: parsed });
        known.add(id);
        nextNo++;
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'PDF tidak dapat diproses.'}`);
      }
    }

    if (added.length) {
      setEntries((current) => [...current, ...added]);
      setActiveId(added[0].id);
      setMessage(`${added.length} PDF berhasil dibaca. Tinjau data sebelum mengunduh.`);
    }
    setIssues(errors);
    setProgress('');
    setBusy(false);
  }

  function fileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addFiles(files);
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function editActive(change: (previous: FormData) => FormData) {
    if (!active) return;
    setEntries((current) => current.map((entry) => entry.id === active.id ? { ...entry, form: change(entry.form) } : entry));
  }

  function removeActive() {
    if (!active || busy) return;
    const remaining = entries.filter((entry) => entry.id !== active.id);
    setEntries(remaining);
    setActiveId(remaining[0]?.id ?? null);
    setIssues([]);
    setMessage(`${active.fileName} dihapus dari daftar.`);
  }

  function clearBatch() {
    if (busy || !window.confirm('Kosongkan daftar PDF dan semua perubahan yang belum diunduh?')) return;
    setEntries([]);
    setActiveId(null);
    setIssues([]);
    setMessage('Daftar PDF dikosongkan.');
  }

  async function downloadOne(kind: WorkbookKind) {
    if (!active || busy) return;
    const problem = exportProblem(entries, [active]);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    setMessage('');
    setProgress(`Membuat ${kind === 'invoice' ? 'invoice' : 'kwitansi'} ${active.form.invoiceNo}...`);
    try {
      download(await createWorkbook(kind, active.form), workbookName(active.form, kind));
      setMessage(`${kind === 'invoice' ? 'Invoice' : 'Kwitansi'} ${active.form.invoiceNo} berhasil dibuat.${saveNextNumber([active.form.invoiceNo]) ? '' : ' Nomor berikutnya tidak tersimpan; isi manual pada penggunaan berikutnya.'}`);
    } catch {
      setMessage('Workbook gagal dibuat. Periksa data lalu coba kembali.');
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  async function downloadBatch(kind: WorkbookKind) {
    if (entries.length < 2 || busy) return;
    const problem = exportProblem(entries);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    setMessage('');
    try {
      const numbers = entries.map((entry) => entry.form.invoiceNo);
      const first = Math.min(...numbers);
      const last = Math.max(...numbers);
      const archive = await createBatchZip(kind, entries.map((entry) => entry.form), (completed, count) => {
        setProgress(`Membuat ${kind === 'invoice' ? 'invoice' : 'kwitansi'} ${completed} dari ${count}...`);
      });
      download(archive, `${kind === 'invoice' ? 'invoice' : 'kwitansi'} TKMPN ${first}-${last}.zip`);
      setMessage(`ZIP ${kind === 'invoice' ? 'invoice' : 'kwitansi'} untuk ${entries.length} PDF berhasil dibuat.${saveNextNumber(entries.map((entry) => entry.form.invoiceNo)) ? '' : ' Nomor berikutnya tidak tersimpan; isi manual pada penggunaan berikutnya.'}`);
    } catch {
      setMessage('ZIP gagal dibuat. Periksa data lalu coba kembali.');
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  const total = form ? feeTotal(form) : 0;
  const tax = form ? vat(form) : 0;
  const all = form ? grandTotal(form) : 0;

  return <main>
    <header>
      <p className="kicker">WKM / TKMPN 2026</p>
      <h1>Formulir menjadi dokumen penagihan.</h1>
      <p>Pilih hingga {MAX_BATCH_FILES} PDF digital. Semua diproses langsung di perangkat Anda.</p>
    </header>

    {!entries.length && <label className="dropzone" onDrop={drop} onDragOver={(event) => event.preventDefault()}>
      <input type="file" accept="application/pdf,.pdf" multiple onChange={fileChange} disabled={busy}/>
      <strong>{busy ? 'Membaca formulir...' : 'Pilih atau jatuhkan PDF formulir'}</strong>
      <span>Hingga {MAX_BATCH_FILES} PDF per batch. PDF scan tanpa text layer tidak dapat diproses.</span>
    </label>}

    {entries.length > 0 && <section className="batch-panel" aria-labelledby="batch-heading">
      <div className="batch-heading">
        <div><p className="kicker">Daftar PDF</p><h2 id="batch-heading">{entries.length} dari {MAX_BATCH_FILES} formulir</h2></div>
        <div className="toolbar-actions">
          <input ref={moreFileInput} className="review-file-input" type="file" accept="application/pdf,.pdf" multiple aria-label="Pilih PDF formulir lain" onChange={fileChange} disabled={busy}/>
          <button type="button" className="secondary-button" disabled={busy || entries.length >= MAX_BATCH_FILES} onClick={() => moreFileInput.current?.click()}>Unggah file lain</button>
          <button type="button" className="text-button" disabled={busy} onClick={clearBatch}>Kosongkan daftar</button>
        </div>
      </div>
      <ol className="document-list">{entries.map((entry) => <li key={entry.id}>
        <button type="button" className={entry.id === active?.id ? 'document-choice selected' : 'document-choice'} aria-pressed={entry.id === active?.id} disabled={busy} onClick={() => { setActiveId(entry.id); setMessage(''); }}>
          <span className="document-number">{entry.form.invoiceNo}</span>
          <span><strong>{entry.form.company || 'Perusahaan belum diisi'}</strong><small>{entry.fileName}</small></span>
        </button>
      </li>)}</ol>
      {entries.length > 1 && <div className="batch-downloads">
        <button type="button" disabled={busy} onClick={() => void downloadBatch('invoice')}>Unduh semua invoice (ZIP)</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void downloadBatch('receipt')}>Unduh semua kwitansi (ZIP)</button>
      </div>}
    </section>}

    {progress && <p className="progress" role="status">{progress}</p>}
    {issues.length > 0 && <div className="error" role="alert"><strong>Beberapa berkas tidak diproses:</strong><ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}

    {form && <section className="review">
      <div className="toolbar">
        <div><p className="kicker">Tinjau data</p><h2>{form.company || 'Perusahaan belum diisi'}</h2></div>
        <div className="toolbar-actions">
          <button type="button" className="text-button" disabled={busy} onClick={removeActive}>Hapus PDF ini</button>
          <button type="button" disabled={busy} onClick={() => void downloadOne('invoice')}>Unduh invoice</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void downloadOne('receipt')}>Unduh kwitansi</button>
        </div>
      </div>
      <div className="grid">
        <fieldset disabled={busy}><legend>Identitas</legend>
          {identityFields.map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={(event) => editActive((old) => ({ ...old, [key]: event.target.value }))}/></label>)}
        </fieldset>
        <fieldset disabled={busy}><legend>Dokumen dan total</legend>
          <label>Nomor invoice<input type="number" min="1" step="1" value={form.invoiceNo} onChange={(event) => editActive((old) => ({ ...old, invoiceNo: Number(event.target.value) }))}/></label>
          <label>Tanggal<input type="date" value={form.date} onChange={(event) => editActive((old) => ({ ...old, date: event.target.value }))}/></label>
          <label>Total biaya di formulir<input type="number" min="0" value={form.sourceTotal ?? ''} onChange={(event) => editActive((old) => ({ ...old, sourceTotal: event.target.value === '' ? null : Number(event.target.value) }))}/></label>
          <dl><div><dt>Subtotal</dt><dd>{rupiah(total)}</dd></div><div><dt>PPN 11%</dt><dd>{rupiah(tax)}</dd></div><div><dt>Total hitungan</dt><dd>{rupiah(all)}</dd></div></dl>
          <p className={form.sourceTotal !== null && all === form.sourceTotal ? 'match' : 'warning'}>
            {form.sourceTotal === null ? 'Total formulir belum terbaca. Isi manual untuk memeriksa selisih.' : all === form.sourceTotal ? 'Cocok dengan total di formulir.' : `Selisih ${rupiah(all - form.sourceTotal)} dari formulir. Periksa rincian biaya.`}
          </p>
        </fieldset>
      </div>
      <fieldset disabled={busy}><legend>Kategori biaya</legend><div className="fees">{form.fees.map((fee, index) => <div key={fee.key}>
        <strong>{fee.label}</strong>
        <label>Jumlah<input type="number" min="0" value={fee.quantity} onChange={(event) => editActive((old) => ({ ...old, fees: old.fees.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item) }))}/></label>
        <label>Total<input type="number" min="0" value={fee.total} onChange={(event) => editActive((old) => ({ ...old, fees: old.fees.map((item, i) => i === index ? { ...item, total: Number(event.target.value) } : item) }))}/></label>
      </div>)}</div></fieldset>
      <fieldset disabled={busy}><legend>Peserta</legend><div className="table-scroll"><table><thead><tr><th>Peran</th><th>Nama</th><th>Tim</th><th>Kaos</th></tr></thead><tbody>{form.participants.map((participant, index) => <tr key={index}>{(['role', 'name', 'team', 'shirt'] as const).map((key) => <td key={key}><input value={participant[key]} onChange={(event) => editActive((old) => ({ ...old, participants: old.participants.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) }))}/></td>)}</tr>)}</tbody></table></div></fieldset>
      <p className="notice" role="status">{message}</p>
    </section>}
    {!form && !busy && message && <p className="notice" role="status">{message}</p>}
  </main>;
}
