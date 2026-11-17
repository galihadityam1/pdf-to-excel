# PDF formulir ke XLSX

Aplikasi Next.js static export. Pembacaan PDF, OCR, dan pembuatan XLSX berlangsung di browser tanpa API atau backend.

## Format formulir

- Formulir TKMPN menghasilkan invoice dan kwitansi.
- Formulir APQO menghasilkan workbook registrasi, invoice, dan kwitansi dengan susunan yang mengikuti contoh masing-masing.
- PDF digital dibaca dari text layer. PDF scan dibaca memakai OCR lokal, lalu hasilnya dapat diperiksa sebelum XLSX diunduh.

## Menggunakan aplikasi

Pilih atau jatuhkan hingga 10 PDF digital maupun scan sekaligus. Aplikasi membaca berkas satu per satu; bila satu gagal, berkas lain yang berhasil tetap masuk daftar. Pilih dokumen pada daftar untuk memeriksa atau mengedit datanya. Nomor invoice harus unik dalam satu batch untuk tiap jenis formulir.

Untuk formulir TKMPN, gunakan **Unduh invoice** atau **Unduh kwitansi**. Formulir APQO memakai tombol **Unduh formulir APQO** atau **Unduh invoice APQO**. Sebelum mengunduh invoice APQO, isi nomor dan tinjau tanggal, tahap tagihan, PPN, organisasi, alamat, peserta, serta biaya. Tahap 50% dan PPN 11% mengikuti contoh invoice dan dapat diubah. Jika satu jenis formulir berjumlah dua atau lebih, workbook registrasi APQO atau dokumen TKMPN juga dapat diunduh sebagai ZIP. Tombol **Unggah file lain** menambah berkas ke batch yang sama; **Kosongkan daftar** memulai batch berikutnya.

Tombol **Unduh kwitansi APQO** menghasilkan XLSX mengikuti contoh kwitansi yang diberikan. Nomor dan tanggal mengikuti isian invoice; nominal mengikuti tahap tagihan beserta PPN, dibulatkan ke rupiah penuh dan ditulis juga sebagai terbilang. Jumlah peserta berasal dari jumlah pada biaya registrasi. Untuk pembayaran penuh, atur tahap tagihan menjadi 100%. Template hanya menyimpan area kwitansi, tanpa data historis atau lembar lain dari file contoh.

## Menjalankan lokal

```bash
npm install
npm run dev
```

## Build dan deploy Vercel

```bash
npm run build
```

Direktori `out` adalah static export dan dapat dipasang di Vercel sebagai proyek Next.js. Saat build, template XLSX diubah menjadi base64 dan aset OCR disalin ke `public/vendor/ocr`.
