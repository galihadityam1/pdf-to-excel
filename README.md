# TKMPN PDF ke Invoice dan Kwitansi

Aplikasi Next.js static export. Semua pemrosesan terjadi di browser, tanpa API atau backend.

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
