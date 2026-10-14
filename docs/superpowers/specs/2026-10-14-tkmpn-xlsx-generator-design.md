# Desain aplikasi TKMPN PDF ke XLSX

## Tujuan

Membangun aplikasi Next.js berbahasa Indonesia yang menerima satu PDF formulir TKMPN digital, menampilkan data hasil ekstraksi untuk ditinjau dan diubah, lalu mengunduh dua workbook XLSX berbasis template: invoice dan kwitansi.

## Keputusan arsitektur

- Next.js dengan static export (`output: 'export'`) agar dapat dideploy ke Vercel tanpa server runtime.
- Seluruh fitur berjalan di browser. Tidak ada API route, autentikasi, database, AI, atau layanan berbayar.
- pdf.js 3.11.174 dan JSZip di-vendor di `public/vendor`; template XLSX di-embed sebagai string base64 saat build.
- PDF diparsing dari text layer dan koordinat teks. Jika tidak ada text layer, aplikasi berhenti dengan pesan bahwa PDF hasil scan tidak didukung.
- Workbook ditulis dengan mengubah XML Open XML dalam ZIP. Bagian template yang tidak perlu diubah tetap dipertahankan.

## Alur data

1. Pengguna memilih atau menjatuhkan PDF.
2. Parser mengelompokkan text item pdf.js menurut baris dan posisi x/y, lalu membaca label identitas, tabel biaya, dan tabel peserta.
3. Hasil normalisasi ditampilkan dalam formulir review. Pengguna dapat mengedit semua data, nomor, tanggal, sapaan, dan divisi.
4. Kalkulator membandingkan subtotal, PPN 11%, dan total dari rincian dengan angka formulir.
5. Generator menyalin template dari base64, memperbarui XML cell/strings/rumus/cache, lalu mengunduh dua file.
6. Nomor tersimpan di localStorage setelah kedua blob berhasil dibuat. Nilai awalnya 225.

## Workbook

Invoice (`tkmpn`) mengubah I3, I4, B9 dan alamat berikutnya, area pengiriman L4, serta rincian pada baris 21-25. Baris tambahan disisipkan sebelum 26 apabila diperlukan, termasuk pergeseran cell, formula, merge, print area, dan anchor drawing. `calcChain` dan relasinya dihapus, sementara `calcPr fullCalcOnLoad="1"` ditetapkan.

Kwitansi (`kwitansi`) mengubah K1, N1, O1, B3, B9, J16, A19, cached value J1 dan C5. Formula dan proteksi sheet tetap ada, sedangkan cache formula selain J1/C5 dikosongkan agar Excel menghitung ulang.

## UI dan desain

Halaman tunggal mempunyai status kosong, proses, kesalahan, dan review. Fokus visual adalah area drop PDF atau tombol ekspor, sesuai tahap penggunaan. Palet memakai netral hangat, biru tua sebagai warna struktural, dan hijau sebagai satu aksen status. Tipografi sistem dipakai demi keterbacaan di lingkungan kantor dan tanpa dependensi jaringan. Komposisi formulir rapat, responsif, dan dapat dioperasikan dengan keyboard.

Design read: aplikasi utilitas administrasi untuk satu operator, dengan bahasa visual dokumen kerja yang tenang, dial ENERGY 1 / RHYTHM 1 / MOTION 1.

Alasan keputusan visual: palet dan struktur tabel memberi keterbacaan data keuangan; layout single-page mengikuti urutan kerja nyata; aksen hijau hanya mengkomunikasikan status valid; tidak ada ilustrasi, statistik, atau aset buatan.

## Validasi

- Kasus contoh harus menghasilkan 5 penyaji tim Solusi × Rp6.000.000 dan 1 peninjau × Rp6.200.000, subtotal Rp36.200.000, PPN Rp3.982.000, total Rp40.182.000.
- Uji input edit, alamat panjang, tambahan baris, PDF tanpa text layer, dan localStorage tidak tersedia.
- Lakukan pemeriksaan ZIP/XML untuk formula, proteksi, gambar, drawing relationship, dan tidak adanya `calcChain`.
- Jalankan browser terhadap static export dan uji semua kontrol. Uji workbook hasil dengan perangkat pembaca XLSX yang tersedia dan Microsoft Excel bila tersedia.

## Perubahan dari permintaan awal

Target utama berubah dari membuka langsung melalui `file://` menjadi static site Next.js untuk Vercel. Output tetap tanpa backend dan pemrosesan tetap 100% di browser. Static export dapat di-host di mana pun, tetapi tidak dijanjikan berjalan dari `file://` karena Next.js menghasilkan aset yang dibaca melalui HTTP(S).
