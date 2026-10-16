'use client';

import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
import { ApqoReview } from './apqo-review';
import { IndonesiaReview } from './indonesia-review';
import { createApqoBatchZip, createApqoInvoiceWorkbook, createApqoWorkbook, createBatchZip, createWorkbook, type WorkbookKind } from '../src/batch-download';
import { apqoInvoiceWorkbookName, apqoWorkbookName, fileKey, isIndonesia, MAX_BATCH_FILES, nextBatchNumber, repeatedInvoiceNumbers, workbookName } from '../src/batch';
import type { ApqoForm, ParsedDocument } from '../src/document-types';
import { createPdfParserSession } from '../src/pdf-parser';
import type { FormData } from '../src/types';
import { apqoInvoiceProblem } from '../src/xlsx/apqo-invoice';

type Entry = { id: string; fileName: string; document: ParsedDocument };
type ApqoEntry = Entry & { document: Extract<ParsedDocument, { format: 'apqo' }> };
type LoadingAction = '' | 'read' | 'tkmpn-invoice' | 'tkmpn-receipt' | 'apqo-form' | 'apqo-invoice' | 'tkmpn-invoice-zip' | 'tkmpn-receipt-zip' | 'apqo-form-zip';

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
  const [loadingAction, setLoadingAction] = useState<LoadingAction>('');
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [invoiceError, setInvoiceError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const moreFileInput = useRef<HTMLInputElement>(null);
  const invoiceNumberRef = useRef<HTMLInputElement>(null);
  const active = entries.find((entry) => entry.id === activeId) ?? entries[0];
  const indonesiaEntries = entries.filter(isIndonesia);
  const apqoEntries = entries.filter(isApqo);

  async function addFiles(files: File[]) {
    if (busy || !files.length) return;
    setBusy(true);
    setLoadingAction('read');
    setIssues([]);
    setMessage('');
    setInvoiceError('');
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
      setLoadingAction('');
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
    setInvoiceError('');
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
    setInvoiceError('');
    setIssues([]);
    setMessage(`${active.fileName} dihapus dari daftar.`);
  }

  function clearBatch() {
    if (busy || !window.confirm('Kosongkan daftar PDF dan semua perubahan yang belum diunduh?')) return;
    setEntries([]);
    setActiveId(null);
    setInvoiceError('');
    setIssues([]);
    setMessage('Daftar PDF dikosongkan.');
  }

  async function downloadIndonesia(kind: WorkbookKind) {
    if (!active || active.document.format !== 'indonesia' || busy) return;
    const problem = exportProblem(entries, [active]);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    setLoadingAction(kind === 'invoice' ? 'tkmpn-invoice' : 'tkmpn-receipt');
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
      setLoadingAction('');
    }
  }

  async function downloadApqo() {
    if (!active || active.document.format !== 'apqo' || busy) return;
    setBusy(true);
    setLoadingAction('apqo-form');
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
      setLoadingAction('');
    }
  }

  async function downloadApqoInvoice() {
    if (!active || active.document.format !== 'apqo' || busy) return;
    const form = active.document.form;
    const problem = apqoInvoiceProblem(form);
    if (problem) {
      setInvoiceError(problem);
      setMessage(problem);
      if (problem.includes('nomor invoice')) invoiceNumberRef.current?.focus();
      return;
    }
    if (entries.some((entry) => entry.id !== active.id && entry.document.format === 'apqo' &&
      entry.document.form.invoice.number.trim() === form.invoice.number.trim())) {
      const duplicate = `Nomor invoice APQO ${form.invoice.number} dipakai lebih dari sekali dalam batch.`;
      setInvoiceError(duplicate);
      setMessage(duplicate);
      invoiceNumberRef.current?.focus();
      return;
    }
    setInvoiceError('');
    setBusy(true);
    setLoadingAction('apqo-invoice');
    setMessage('');
    setProgress('Membuat invoice APQO...');
    try {
      download(await createApqoInvoiceWorkbook(form), apqoInvoiceWorkbookName(form.invoice.number, form.company));
      setMessage(`Invoice APQO ${form.invoice.number} berhasil dibuat.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invoice APQO gagal dibuat.');
    } finally {
      setProgress('');
      setBusy(false);
      setLoadingAction('');
    }
  }

  async function downloadIndonesiaBatch(kind: WorkbookKind) {
    if (indonesiaEntries.length < 2 || busy) return;
    const problem = exportProblem(entries, indonesiaEntries);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    setLoadingAction(kind === 'invoice' ? 'tkmpn-invoice-zip' : 'tkmpn-receipt-zip');
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
      setLoadingAction('');
    }
  }

  async function downloadApqoBatch() {
    if (apqoEntries.length < 2 || busy) return;
    setBusy(true);
    setLoadingAction('apqo-form-zip');
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
      setLoadingAction('');
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
      <strong>{busy ? 'Memproses formulir…' : 'Pilih atau jatuhkan PDF formulir'}</strong>
      <span>Formulir TKMPN dan APQO didukung. Scan dibaca dengan OCR lokal.</span>
    </label>}

    {entries.length > 0 && <section className="batch-panel" aria-labelledby="batch-heading">
      <div className="batch-heading">
        <div><p className="kicker">Daftar PDF</p><h2 id="batch-heading">{entries.length} dari {MAX_BATCH_FILES} formulir</h2></div>
        <div className="toolbar-actions">
          <input ref={moreFileInput} className="review-file-input" type="file" accept="application/pdf,.pdf" multiple aria-label="Pilih PDF formulir lain" onChange={fileChange} disabled={busy}/>
          <button type="button" className="secondary-button" disabled={busy || entries.length >= MAX_BATCH_FILES} aria-busy={loadingAction === 'read'} onClick={() => moreFileInput.current?.click()}>{loadingAction === 'read' ? 'Memproses PDF…' : 'Unggah file lain'}</button>
          <button type="button" className="text-button" disabled={busy} onClick={clearBatch}>Kosongkan daftar</button>
        </div>
      </div>
      <ol className="document-list">{entries.map((entry) => {
        const label = entry.document.format === 'indonesia' ? entry.document.form.company || 'Perusahaan belum diisi' : entry.document.form.company || 'Organisasi belum diisi';
        return <li key={entry.id}>
          <button type="button" className={entry.id === active?.id ? 'document-choice selected' : 'document-choice'} aria-pressed={entry.id === active?.id} disabled={busy} onClick={() => { setActiveId(entry.id); setMessage(''); setInvoiceError(''); }}>
            <span className="document-number">{entry.document.format === 'indonesia' ? entry.document.form.invoiceNo : 'APQO'}</span>
            <span><strong>{label}</strong><small>{entry.fileName}</small><span className="document-meta"><span>{entry.document.format === 'indonesia' ? 'TKMPN' : 'APQO'}</span><span>{entry.document.source === 'ocr' ? 'Hasil OCR' : 'Teks digital'}</span></span></span>
          </button>
        </li>;
      })}</ol>
      {(indonesiaEntries.length >= 2 || apqoEntries.length >= 2) && <div className="batch-downloads">
        {indonesiaEntries.length >= 2 && <>
          <button type="button" disabled={busy} aria-busy={loadingAction === 'tkmpn-invoice-zip'} onClick={() => void downloadIndonesiaBatch('invoice')}>{loadingAction === 'tkmpn-invoice-zip' ? 'Membuat ZIP invoice…' : 'Unduh semua invoice (ZIP)'}</button>
          <button type="button" className="secondary-button" disabled={busy} aria-busy={loadingAction === 'tkmpn-receipt-zip'} onClick={() => void downloadIndonesiaBatch('receipt')}>{loadingAction === 'tkmpn-receipt-zip' ? 'Membuat ZIP kwitansi…' : 'Unduh semua kwitansi (ZIP)'}</button>
        </>}
        {apqoEntries.length >= 2 && <button type="button" className="secondary-button" disabled={busy} aria-busy={loadingAction === 'apqo-form-zip'} onClick={() => void downloadApqoBatch()}>{loadingAction === 'apqo-form-zip' ? 'Membuat ZIP APQO…' : 'Unduh semua formulir APQO (ZIP)'}</button>}
      </div>}
    </section>}

    {progress && <p className="progress" role="status">{progress}</p>}
    {issues.length > 0 && <div className="error" role="alert"><strong>Beberapa berkas tidak diproses:</strong><ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}
    {message && <p className="notice" role="status">{message}</p>}

    {active?.document.format === 'indonesia' && <IndonesiaReview
      form={active.document.form}
      busy={busy}
      loadingAction={loadingAction}
      onChange={editIndonesia}
      onRemove={removeActive}
      onDownloadInvoice={() => void downloadIndonesia('invoice')}
      onDownloadReceipt={() => void downloadIndonesia('receipt')}
    />}
    {active?.document.format === 'apqo' && <ApqoReview
      form={active.document.form}
      busy={busy}
      loadingAction={loadingAction}
      onChange={editApqo}
      onRemove={removeActive}
      onDownload={() => void downloadApqo()}
      onDownloadInvoice={() => void downloadApqoInvoice()}
      invoiceError={invoiceError}
      invoiceNumberRef={invoiceNumberRef}
    />}
  </main>;
}
