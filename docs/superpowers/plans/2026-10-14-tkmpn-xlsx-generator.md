# TKMPN XLSX Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a statically exported Next.js application that turns a digital TKMPN registration PDF into template-preserving invoice and receipt XLSX downloads.

**Architecture:** Client components own file input, parsing, review state, validation, and binary generation. Pure TypeScript modules parse positioned PDF text and rewrite XLSX XML through JSZip. Templates and browser dependencies are packaged locally.

**Tech Stack:** Next.js static export, React, TypeScript, pdf.js 3.11.174, JSZip, Open XML, Vitest.

---

### Task 1: Create the static application shell

**Files:** `package.json`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] Create a Next.js static-export configuration and client-only page.
- [ ] Add empty, loading, error, and review states with keyboard-accessible PDF selection.
- [ ] Run `npm run build` and verify `out/index.html` exists.

### Task 2: Vendor runtime assets and templates

**Files:** `public/vendor/*`, `src/templates.ts`, `scripts/embed-templates.mjs`

- [ ] Add local pdf.js and JSZip browser assets pinned to requested versions.
- [ ] Convert both supplied XLSX templates into build-time base64 module constants.
- [ ] Verify no runtime request points to a CDN.

### Task 3: Parse PDF into normalized form data

**Files:** `src/types.ts`, `src/pdf-parser.ts`, `src/fees.ts`, `tests/pdf-parser.test.ts`

- [ ] Define form, fee, and participant types.
- [ ] Extract text items with coordinates, group rows, then parse label/value identity, fees, and participants.
- [ ] Reject PDFs that have no meaningful text items.
- [ ] Test the supplied fixture values and scan rejection.

### Task 4: Build review and calculation flow

**Files:** `src/review-form.tsx`, `src/calculations.ts`, `tests/calculations.test.ts`

- [ ] Render editable identity, delivery, participants, categories, number, and date data.
- [ ] Group presenters by team and calculate expected subtotal, PPN, grand total, and mismatch state.
- [ ] Persist and increment invoice number only after both downloads are generated.

### Task 5: Rewrite invoice Open XML safely

**Files:** `src/xlsx/xml.ts`, `src/xlsx/invoice.ts`, `tests/invoice.test.ts`

- [ ] Implement shared-string/cell helpers and XML escaping.
- [ ] Populate invoice cells, address lines, and detail rows.
- [ ] Shift rows, formulas, merges, print area, and drawing anchors for overflow; remove calcChain and request full recalculation.
- [ ] Assert preservation of image count and generated XML well-formedness.

### Task 6: Rewrite kwitansi Open XML safely

**Files:** `src/xlsx/receipt.ts`, `tests/receipt.test.ts`

- [ ] Populate specified cells with strings, numeric amount, and Excel date serial.
- [ ] Refresh only J1 and C5 cached values, clear other formula caches, preserve formulas and protection.
- [ ] Assert seven sheets, protection, and target formulas remain.

### Task 7: Integrate downloads and validate final output

**Files:** `app/page.tsx`, `README.md`, `tests/integration.test.ts`

- [ ] Generate two named blobs and download independently or together.
- [ ] Exercise the supplied PDF end to end and assert Rp40.182.000 final amount.
- [ ] Run tests, production build, browser interaction checks, and the requested post-build UI audit.
