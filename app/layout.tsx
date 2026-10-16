import './globals.css';
import Script from 'next/script';

export const metadata = { title: 'WKM Dokumen', description: 'Konversi formulir TKMPN dan APQO menjadi dokumen XLSX.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body><Script src="/vendor/pdf.min.js" strategy="beforeInteractive" />{children}</body></html>; }
