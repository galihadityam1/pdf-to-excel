import './globals.css';
import Script from 'next/script';

export const metadata = { title: 'TKMPN Dokumen', description: 'Konversi formulir TKMPN ke invoice dan kwitansi.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body><Script src="/vendor/pdf.min.js" strategy="beforeInteractive" />{children}</body></html>; }
