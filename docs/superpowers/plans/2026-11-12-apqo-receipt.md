# APQO receipt implementation plan

Goal: Add an Unduh kwitansi APQO button next to the existing APQO downloads, using the supplied receipt layout.

Architecture: Reuse the reviewed APQO form and invoice terms. A separate XLSX generator fills a sanitized receipt template through the existing JSZip approach. Keep generation in the browser.

Tech stack: Next.js client components, TypeScript, JSZip, Vitest.

- Prepare `assets/templates/apqo-receipt.xlsx` from the supplied workbook, keeping the receipt print layout A1:M22 and removing old records, helper sheets, and stale metadata. Add a repeatable preparation script and embed the sanitized template.
- Add `src/xlsx/apqo-receipt.ts`: validate invoice inputs, populate number/date/company/participant count, calculate stage plus tax rounded to whole rupiah, and generate matching Indonesian amount words. Share the existing words helper.
- Connect the generator through `src/batch-download.ts` and a safe filename in `src/batch.ts`. Extend the APQO download handler to reuse validation, duplicate number handling, busy state, and errors for both invoice and receipt.
- Add the receipt button in `app/apqo-review.tsx` and explain that number, date, and amount follow invoice settings.
- Test full/partial payments, modified tax, observer-only forms, invalid data, XML escaping, and removal of source records. Run the full tests and production build, then exercise the button and missing-number error in the browser. Inspect a generated receipt against the supplied layout.
