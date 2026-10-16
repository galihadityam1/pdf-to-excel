'use client';

import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
import { ApqoReview } from './apqo-review';
import { IndonesiaReview } from './indonesia-review';
import { createApqoBatchZip, createApqoWorkbook, createBatchZip, createWorkbook, type WorkbookKind } from '../src/batch-download';
import { apqoWorkbookName, fileKey, isIndonesia, MAX_BATCH_FILES, nextBatchNumber, repeatedInvoiceNumbers, workbookName } from '../src/batch';
import type { ApqoForm, ParsedDocument } from '../src/document-types';
import { createPdfParserSession } from '../src/pdf-parser';
import type { FormData } from '../src/types';

type Entry = { id: string; fileName: string; document: ParsedDocument };
type ApqoEntry = Entry & { document: Extract<ParsedDocument, { format: 'apqo' }> };

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

function exportProblem(entries: Entry[], targets: Entry[] = entries) {
  const invalid = targets.filter(isIndonesia).find(({ document }) => (
    !Number.isInteger(document.form.invoiceNo) || document.form.invoiceNo < 1 || !document.form.company.trim()
  ));
  if (invalid) return `Lengkapi perusahaan dan nomor invoice yang valid untuk ${invalid.fileName}.`;
  const repeated = repeatedInvoiceNumbers(entries);
  return repeated.length ? `Nomor invoice ${repeated.join(', ')} dipakai lebih dari sekali. Perbaiki sebelum mengunduh.` : '';
}

const isApqo = (entry: Entry): entry is ApqoEntry => entry.document.format === 'apqo';

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const moreFileInput = useRef<HTMLInputElement>(null);
  const active = entries.find((entry) => entry.id === activeId) ?? entries[0];
  const indonesiaEntries = entries.filter(isIndonesia);
  const apqoEntries = entries.filter(isApqo);

  async function addFiles(files: File[]) {
    if (busy || !files.length) return;
    setBusy(true);
    setIssues([]);
    setMessage('');
    const added: Entry[] = [];
    const errors: string[] = [];
    const known = new Set(entries.map((entry) => entry.id));
    let nextNo = nextBatchNumber(entries, storedNextNumber());
    const parser = createPdfParserSession((fileName) => setProgress(`Menjalankan OCR lokal: ${fileName}`));

    try {
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
          const parsed = await parser.parse(file, nextNo);
          added.push({ id, fileName: file.name, document: parsed });
          known.add(id);
          if (parsed.format === 'indonesia') nextNo += 1;
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : 'PDF tidak dapat diproses.'}`);
        }
      }
    } finally {
      await parser.terminate();
      setProgress('');
      setBusy(false);
    }

    if (added.length) {
      setEntries((current) => [...current, ...added]);
      setActiveId(added[0].id);
      setMessage(`${added.length} PDF berhasil dibaca. Tinjau data sebelum mengunduh.`);
    }
    setIssues(errors);
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

  function editIndonesia(change: (previous: FormData) => FormData) {
    if (!active || active.document.format !== 'indonesia') return;
    setEntries((current) => current.map((entry) => (
      entry.id === active.id && entry.document.format === 'indonesia'
        ? { ...entry, document: { ...entry.document, form: change(entry.document.form) } }
        : entry
    )));
  }

  function editApqo(change: (previous: ApqoForm) => ApqoForm) {
    if (!active || active.document.format !== 'apqo') return;
    setEntries((current) => current.map((entry) => (
      entry.id === active.id && entry.document.format === 'apqo'
        ? { ...entry, document: { ...entry.document, form: change(entry.document.form) } }
        : entry
    )));
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

  async function downloadIndonesia(kind: WorkbookKind) {
    if (!active || active.document.format !== 'indonesia' || busy) return;
    const problem = exportProblem(entries, [active]);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    setMessage('');
    const form = active.document.form;
    setProgress(`Membuat ${kind === 'invoice' ? 'invoice' : 'kwitansi'} ${form.invoiceNo}...`);
    try {
      download(await createWorkbook(kind, form), workbookName(form, kind));
      setMessage(`${kind === 'invoice' ? 'Invoice' : 'Kwitansi'} ${form.invoiceNo} berhasil dibuat.${saveNextNumber([form.invoiceNo]) ? '' : ' Nomor berikutnya tidak tersimpan; isi manual pada penggunaan berikutnya.'}`);
    } catch {
      setMessage('Workbook gagal dibuat. Periksa data lalu coba kembali.');
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  async function downloadApqo() {
    if (!active || active.document.format !== 'apqo' || busy) return;
    setBusy(true);
    setMessage('');
    setProgress('Membuat formulir APQO...');
    try {
      download(await createApqoWorkbook(active.document.form), apqoWorkbookName(active.fileName));
      setMessage('Formulir APQO berhasil dibuat.');
    } catch {
      setMessage('Formulir APQO gagal dibuat. Periksa data lalu coba kembali.');
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  async function downloadIndonesiaBatch(kind: WorkbookKind) {
    if (indonesiaEntries.length < 2 || busy) return;
    const problem = exportProblem(entries, indonesiaEntries);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    setMessage('');
    try {
      const numbers = indonesiaEntries.map((entry) => entry.document.form.invoiceNo);
      const archive = await createBatchZip(kind, indonesiaEntries.map((entry) => entry.document.form), (completed, count) => {
        setProgress(`Membuat ${kind === 'invoice' ? 'invoice' : 'kwitansi'} ${completed} dari ${count}...`);
      });
      download(archive, `${kind === 'invoice' ? 'invoice' : 'kwitansi'} TKMPN ${Math.min(...numbers)}-${Math.max(...numbers)}.zip`);
      setMessage(`ZIP ${kind === 'invoice' ? 'invoice' : 'kwitansi'} untuk ${indonesiaEntries.length} formulir TKMPN berhasil dibuat.${saveNextNumber(numbers) ? '' : ' Nomor berikutnya tidak tersimpan; isi manual pada penggunaan berikutnya.'}`);
    } catch {
      setMessage('ZIP gagal dibuat. Periksa data lalu coba kembali.');
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  async function downloadApqoBatch() {
    if (apqoEntries.length < 2 || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const archive = await createApqoBatchZip(apqoEntries, (completed, count) => {
        setProgress(`Membuat formulir APQO ${completed} dari ${count}...`);
      });
      download(archive, 'formulir APQO.zip');
      setMessage(`ZIP formulir APQO untuk ${apqoEntries.length} PDF berhasil dibuat.`);
    } catch {
      setMessage('ZIP APQO gagal dibuat. Periksa data lalu coba kembali.');
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  return <main>
    <header>
      <p className="kicker">WKM / TKMPN / APQO 2026</p>
      <h1>Formulir menjadi dokumen kerja.</h1>
      <p>Pilih hingga {MAX_BATCH_FILES} PDF digital atau scan. Semua diproses langsung di perangkat Anda.</p>
    </header>

    {!entries.length && <label className="dropzone" onDrop={drop} onDragOver={(event) => event.preventDefault()}>
      <input type="file" accept="application/pdf,.pdf" multiple onChange={fileChange} disabled={busy}/>
      <strong>{busy ? 'Membaca formulir...' : 'Pilih atau jatuhkan PDF formulir'}</strong>
      <span>Formulir TKMPN dan APQO didukung. Scan dibaca dengan OCR lokal.</span>
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
      <ol className="document-list">{entries.map((entry) => {
        const label = entry.document.format === 'indonesia' ? entry.document.form.company || 'Perusahaan belum diisi' : entry.document.form.company || 'Organisasi belum diisi';
        return <li key={entry.id}>
          <button type="button" className={entry.id === active?.id ? 'document-choice selected' : 'document-choice'} aria-pressed={entry.id === active?.id} disabled={busy} onClick={() => { setActiveId(entry.id); setMessage(''); }}>
            <span className="document-number">{entry.document.format === 'indonesia' ? entry.document.form.invoiceNo : 'APQO'}</span>
            <span><strong>{label}</strong><small>{entry.fileName}</small><span className="document-meta"><span>{entry.document.format === 'indonesia' ? 'TKMPN' : 'APQO'}</span><span>{entry.document.source === 'ocr' ? 'Hasil OCR' : 'Teks digital'}</span></span></span>
          </button>
        </li>;
      })}</ol>
      {(indonesiaEntries.length >= 2 || apqoEntries.length >= 2) && <div className="batch-downloads">
        {indonesiaEntries.length >= 2 && <>
          <button type="button" disabled={busy} onClick={() => void downloadIndonesiaBatch('invoice')}>Unduh semua invoice (ZIP)</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void downloadIndonesiaBatch('receipt')}>Unduh semua kwitansi (ZIP)</button>
        </>}
        {apqoEntries.length >= 2 && <button type="button" className="secondary-button" disabled={busy} onClick={() => void downloadApqoBatch()}>Unduh semua formulir APQO (ZIP)</button>}
      </div>}
    </section>}

    {progress && <p className="progress" role="status">{progress}</p>}
    {issues.length > 0 && <div className="error" role="alert"><strong>Beberapa berkas tidak diproses:</strong><ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}

    {active?.document.format === 'indonesia' && <IndonesiaReview
      form={active.document.form}
      busy={busy}
      onChange={editIndonesia}
      onRemove={removeActive}
      onDownloadInvoice={() => void downloadIndonesia('invoice')}
      onDownloadReceipt={() => void downloadIndonesia('receipt')}
    />}
    {active?.document.format === 'apqo' && <ApqoReview
      form={active.document.form}
      busy={busy}
      onChange={editApqo}
      onRemove={removeActive}
      onDownload={() => void downloadApqo()}
    />}
    {message && <p className="notice" role="status">{message}</p>}
  </main>;
}
