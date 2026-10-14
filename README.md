# TKMPN PDF ke Invoice dan Kwitansi

Aplikasi Next.js static export. Semua pemrosesan terjadi di browser, tanpa API atau backend.

## Menggunakan aplikasi

Pilih atau jatuhkan hingga 10 PDF formulir digital sekaligus. Aplikasi membaca berkas satu per satu; bila satu gagal, berkas lain yang berhasil tetap masuk daftar. Pilih dokumen pada daftar untuk meninjau atau mengedit datanya. Nomor invoice diberikan berurutan dan boleh diedit, tetapi tidak boleh sama dalam satu batch.

Gunakan **Unduh invoice** atau **Unduh kwitansi** untuk dokumen yang sedang dipilih. Untuk beberapa PDF, gunakan **Unduh semua invoice (ZIP)** dan **Unduh semua kwitansi (ZIP)** agar browser hanya mengunduh satu arsip per jenis. Tombol **Unggah file lain** menambah berkas ke batch yang sama; **Kosongkan daftar** memulai batch berikutnya.

## Menjalankan lokal

```bash
npm install
npm run generate:templates
npm run dev
```

## Build dan deploy Vercel

```bash
npm run build
```

Direktori `out` adalah static export dan dapat dideploy di Vercel sebagai proyek Next.js. Template XLSX disimpan sebagai base64 pada `src/templates.generated.ts`, yang dihasilkan dari berkas pada `assets/templates`.
