# PDF formulir ke XLSX

Aplikasi Next.js static export. Pembacaan PDF, OCR, dan pembuatan XLSX berlangsung di browser tanpa API atau backend.

## Format formulir

- Formulir TKMPN menghasilkan invoice dan kwitansi.
- Formulir APQO menghasilkan workbook registrasi APQO dengan susunan yang mengikuti template client.
- PDF digital dibaca dari text layer. PDF scan dibaca memakai OCR lokal, lalu hasilnya dapat diperiksa sebelum XLSX diunduh.

## Menggunakan aplikasi

Pilih atau jatuhkan hingga 10 PDF digital maupun scan sekaligus. Aplikasi membaca berkas satu per satu; bila satu gagal, berkas lain yang berhasil tetap masuk daftar. Pilih dokumen pada daftar untuk memeriksa atau mengedit datanya. Nomor invoice hanya diberikan pada formulir TKMPN dan tidak boleh sama dalam satu batch.

Untuk formulir TKMPN, gunakan **Unduh invoice** atau **Unduh kwitansi**. Formulir APQO memakai tombol **Unduh formulir APQO**. Jika satu jenis formulir berjumlah dua atau lebih, hasilnya juga dapat diunduh sebagai ZIP. Tombol **Unggah file lain** menambah berkas ke batch yang sama; **Kosongkan daftar** memulai batch berikutnya.

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
