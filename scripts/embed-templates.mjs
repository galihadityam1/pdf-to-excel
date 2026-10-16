import { readFile, writeFile } from 'node:fs/promises';

const invoice = (await readFile(new URL('../assets/templates/invoice.xlsx', import.meta.url))).toString('base64');
const receipt = (await readFile(new URL('../assets/templates/kwitansi.xlsx', import.meta.url))).toString('base64');
const apqoRegistration = (await readFile(new URL('../assets/templates/apqo-registration.xlsx', import.meta.url))).toString('base64');
const apqoInvoice = (await readFile(new URL('../assets/templates/apqo-invoice.xlsx', import.meta.url))).toString('base64');
await writeFile(new URL('../src/templates.generated.ts', import.meta.url), `// Generated from supplied templates.\nexport const invoiceTemplate = ${JSON.stringify(invoice)};\nexport const receiptTemplate = ${JSON.stringify(receipt)};\nexport const apqoRegistrationTemplate = ${JSON.stringify(apqoRegistration)};\nexport const apqoInvoiceTemplate = ${JSON.stringify(apqoInvoice)};\n`);
