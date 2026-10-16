# Dua alur dokumen dengan OCR lokal

## Tujuan

Aplikasi menerima dua format formulir dengan keluaran yang berbeda:

- formulir Indonesia menghasilkan invoice dan kwitansi melalui alur yang sudah ada;
- formulir APQO berbahasa Inggris menghasilkan workbook registrasi dengan struktur dan tampilan yang mengikuti `Pamaoersada.2 (1).xlsx`.

Kedua format harus dapat diproses dari PDF digital yang memiliki text layer maupun PDF scan tanpa text layer. Pengguna tetap melewati urutan yang sama: unggah hingga 10 PDF, tinjau dan koreksi data, lalu unduh keluaran yang sesuai dengan format sumber.

## Batas pekerjaan

Perubahan mencakup ekstraksi PDF, OCR lokal, deteksi format, parser APQO, model data APQO, editor review APQO, generator workbook APQO, status proses, pesan kesalahan, unduhan batch, dan pengujian.

Alur Indonesia tetap memakai model data, perhitungan, template invoice, dan template kwitansi yang ada. Format APQO tidak menghasilkan invoice atau kwitansi. Tidak ada layanan OCR berbayar, pengiriman dokumen ke server, atau pilihan format manual.

Berkas milik pengguna tidak dimasukkan ke repositori sebagai fixture tes. Workbook dari client dipakai sebagai acuan template APQO; data contoh di dalamnya bukan nilai bawaan keluaran baru.

## Alur pemrosesan bersama

Setiap PDF melewati satu pipeline:

1. pdf.js membuka halaman pertama dan mengambil text item beserta koordinatnya.
2. Jika jumlah teks memadai, pipeline memakai text layer.
3. Jika teks kosong atau terlalu sedikit, pdf.js merender halaman ke canvas. Tesseract.js membaca gambar dengan model bahasa Inggris dan Indonesia yang disimpan bersama aset aplikasi.
4. Pipeline menormalisasi hasil digital atau OCR menjadi token teks dengan posisi.
5. Detektor mencari penanda format yang tahan terhadap variasi kapitalisasi, spasi, tanda baca, dan salah baca OCR ringan.
6. Token diteruskan ke parser Indonesia atau parser APQO.
7. Hasil parser masuk ke editor review yang sesuai, masih di dalam daftar batch yang sama.
8. Tombol unduh dan keluaran ditentukan oleh jenis dokumen.

OCR merupakan cara mengambil teks, bukan format ketiga. Empat kombinasi input memakai pipeline yang sama:

| Format sumber | PDF digital | PDF scan | Keluaran |
| --- | --- | --- | --- |
| Formulir Indonesia | text layer lalu parser Indonesia | OCR lalu parser Indonesia | Invoice dan kwitansi XLSX |
| Formulir APQO | text layer lalu parser APQO | OCR lalu parser APQO | Workbook registrasi APQO XLSX |

## Ekstraksi dan deteksi format

### Ekstraktor PDF

Ekstraktor mengembalikan token teks yang telah dinormalisasi serta jenis sumber, `digital` atau `ocr`. Ambang text layer memeriksa jumlah karakter bermakna, bukan hanya jumlah baris. PDF dengan beberapa teks dekoratif tetapi isi utama berupa gambar tetap masuk OCR.

OCR hanya berjalan ketika dibutuhkan. Satu worker Tesseract dipakai ulang untuk semua scan dalam satu batch, lalu dihentikan setelah batch selesai. Worker dan model bahasa dilayani dari aset lokal agar dokumen tidak keluar dari perangkat atau bergantung pada CDN saat diproses.

### Detektor format

Detektor berdiri terpisah dari kedua parser. Hasilnya `indonesia`, `apqo`, atau `unknown`, disertai daftar penanda yang ditemukan untuk tes dan diagnosis.

Penanda Indonesia meliputi `Nama Perusahaan`, `Nama PIC`, dan `TOTAL BIAYA`. Penanda APQO meliputi `Name of Organization`, `Name of Person in Charge`, `Registration Fee`, serta `Participation List`. Detektor memilih format setelah ekstraksi selesai, jadi aturan yang sama berlaku pada teks digital dan OCR.

## Model data dan parser

### Dokumen Indonesia

Parser Indonesia mempertahankan `FormData` yang sekarang. Logikanya dipindahkan di belakang antarmuka parser bersama, lalu diberi normalisasi input dan toleransi posisi yang diperlukan untuk membaca scan. Keluaran parser tetap masuk ke editor, kalkulator, generator invoice, dan generator kwitansi yang ada.

### Dokumen APQO

APQO memakai model data sendiri agar informasi pada workbook client tidak hilang. Model menyimpan:

- nama PIC dan designation;
- nama organisasi dan alamat;
- telepon kantor, nomor seluler, serta daftar email;
- biaya Presenter dan Observer, masing-masing dengan tarif, jumlah peserta, dan running total;
- daftar peserta berisi jenis partisipasi, salutation, nama lengkap, dan nama tim;
- tempat, tanggal, serta nama penanggung jawab bila terbaca dari sumber.

Parser membaca nilai berdasarkan label dan posisi tabel. Ia tidak mengandalkan urutan angka dari teks gabungan. Nilai `Presenter` dan `Observer` dipertahankan sebagai istilah APQO; parser tidak memetakannya ke kategori biaya invoice Indonesia.

Jika total sumber kosong atau berupa tanda hubung, nilai tersebut tetap kosong kecuali rincian sumber memberikan angka yang jelas. Parser tidak menebak designation, salutation, tim, alamat, atau angka yang gagal dibaca.

## Review

Daftar batch, navigasi antarberkas, penghapusan berkas, status, dan pola koreksi tetap sama. Isi editor mengikuti jenis dokumen:

- dokumen Indonesia menampilkan editor yang sekarang;
- dokumen APQO menampilkan field identitas, tabel biaya, dan daftar peserta sesuai workbook client.

Setiap entri menampilkan jenis format dan sumber ekstraksi agar pengguna tahu apakah datanya berasal dari text layer atau OCR. Nilai OCR tetap dapat diedit sebelum unduhan dibuat.

Pesan proses membedakan `Membaca teks` dan `Menjalankan OCR`. Scan mungkin membutuhkan waktu lebih lama, tetapi tidak memakai alur terpisah.

## Keluaran

### Format Indonesia

Tombol invoice, kwitansi, ZIP invoice, dan ZIP kwitansi tetap bekerja seperti sekarang. Penomoran invoice hanya berlaku pada format Indonesia.

### Format APQO

Setiap dokumen menghasilkan satu workbook XLSX dari template yang mengikuti `Pamaoersada.2 (1).xlsx`. Generator mengganti seluruh data contoh pada area berikut dengan hasil review:

- `DELEGATE/PARTICIPANT/PRESENTER DETAILS`;
- `Registration Fee`;
- `PARTICIPATION LIST`;
- tempat, tanggal, dan nama penanggung jawab jika tersedia.

Generator mempertahankan nama sheet, penggabungan sel, ukuran baris dan kolom, gaya, format angka, formula total, print setup, serta elemen gambar yang memang menjadi bagian template. Baris peserta yang tidak terpakai dikosongkan. Jika jumlah peserta melampaui kapasitas template, generator menambah baris dengan menyalin struktur dan gaya baris peserta sebelum bagian Notes.

Nama unduhan memakai nama PDF sumber dengan ekstensi `.xlsx`. Untuk batch APQO, aplikasi menyediakan satu ZIP yang berisi satu workbook per PDF.

Batch campuran menampilkan tindakan unduh per jenis. Aplikasi tidak menawarkan invoice atau kwitansi untuk entri APQO dan tidak menawarkan workbook APQO untuk entri Indonesia.

## Kesalahan dan data yang kurang

Kegagalan satu berkas tidak menghentikan berkas lain. Pesan kesalahan menyebut nama berkas dan penyebabnya:

- PDF rusak atau terenkripsi;
- OCR gagal dimuat;
- teks terbaca tetapi format tidak dikenali;
- format dikenali tetapi data pokok tidak ditemukan;
- workbook APQO gagal dibuat.

Jika OCR selesai tetapi beberapa field tidak terbaca, aplikasi tetap membuka review selama format dan identitas pokok dikenali. Field yang meragukan dibiarkan kosong dan dapat dikoreksi pengguna.

## Kinerja dan privasi

PDF digital tidak menjalankan OCR. Untuk scan, halaman dirender dan dibaca di browser sehingga waktu proses mengikuti kemampuan perangkat. Model OCR menambah ukuran aset statis dan bandwidth unduhan biasa, tetapi tidak menimbulkan biaya API per dokumen.

Isi PDF, gambar halaman, dan hasil OCR tidak dikirim ke server. Browser boleh menyimpan cache model OCR agar pemrosesan berikutnya lebih cepat.

## Pengujian

Tes unit mencakup normalisasi token, ambang OCR, deteksi format, parser Indonesia, parser APQO, tabel biaya, peserta, total, dan kegagalan format. Setiap parser diuji dengan token digital serta token OCR yang memiliki variasi spasi dan salah baca ringan.

Tes integrasi mengganti dependency OCR dengan stub agar hasil tes tetap cepat dan konsisten. Fixture scan dibuat dari data sintetis. Tes batch mencampur empat kombinasi format dan jenis PDF, termasuk satu kegagalan yang tidak boleh menggagalkan berkas lain.

Tes generator APQO membandingkan area tetap template sebelum dan sesudah pembuatan workbook, memeriksa seluruh field yang diganti, formula total, gambar, print setup, dan penambahan baris peserta. Data contoh dari template tidak boleh tersisa pada keluaran.

Pemeriksaan browser memakai satu PDF digital dan satu scan untuk setiap format. Dokumen Indonesia harus menghasilkan invoice serta kwitansi; dokumen APQO harus menghasilkan workbook registrasi. Semua hasil harus melewati review tanpa error console.

## Kriteria penerimaan

- Format Indonesia dan APQO bekerja dari PDF digital maupun scan.
- Sistem memilih format otomatis tanpa kontrol format baru.
- OCR berjalan lokal dan hanya dipakai jika text layer tidak memadai.
- Format Indonesia tetap menghasilkan invoice dan kwitansi.
- Format APQO hanya menghasilkan workbook yang mengikuti template client.
- Review menyediakan semua field yang dibutuhkan oleh keluaran masing-masing.
- Batch campuran tidak menawarkan tipe keluaran yang salah.
- Kesalahan satu berkas tidak menghentikan batch.
- Data yang tidak terbaca dibiarkan kosong dan dapat diperbaiki pengguna.
- Tes otomatis, build produksi, dan pemeriksaan browser untuk empat kombinasi input lulus.
