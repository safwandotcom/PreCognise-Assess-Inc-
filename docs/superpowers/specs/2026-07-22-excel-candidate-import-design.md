---
title: Accept Excel (.xlsx) files in candidate bulk import
date: 2026-07-22
status: approved (pending spec review)
---

# Accept Excel (.xlsx) files in candidate bulk import

## Goal

The candidate bulk-import in the admin Candidates tab currently accepts CSV only. Extend it to also accept Excel `.xlsx` files, reusing the ExcelJS dependency the project already ships (used today for the credential export). No new dependency, no backend change — both formats feed the same existing import flow.

## Background (verified current state)

All in `app/admin/campaigns/[id]/page.tsx`:
- `parseCSV(text): { name: string; email: string }[]` (lines 79-96) splits text on newlines, requires a header row containing columns literally named `name` and `email` (case-insensitive, any order), reads those columns from each subsequent row, trims/unquotes cells, and drops rows missing either field. A file with no `name`/`email` header returns `[]`.
- `handleFileChange` (lines 1706-1720) reads the file as **text** via `FileReader.readAsText` and calls `parseCSV`, storing the result in `importRows`. Reading a binary `.xlsx` as text yields garbage → zero rows, silently.
- The file input has `accept=".csv,text/csv"` (line 1905).
- `downloadExcel` (lines 98-124) already does `const ExcelJS = (await import("exceljs")).default;` client-side and `wb.xlsx.writeBuffer()`, proving ExcelJS works in the browser here.
- `package.json` already lists `"exceljs": "^4.4.0"`.
- The downstream flow (`handleImport` → `POST /api/admin/campaigns/[id]/candidates/import`) consumes `importRows` (`{ name, email }[]`) unchanged.

## Design

### 1. Unified cells → rows resolver

Refactor so both formats produce a 2D grid of trimmed string cells, then a single resolver applies the column logic. Three helpers replace the single `parseCSV`:

- `parseCsvToCells(text: string): string[][]` — split the current CSV tokenizing out of `parseCSV`: split on `\r?\n`, split each line on `,`, trim, strip surrounding quotes. Returns all rows (header included) as a grid. Empty lines dropped.
- `parseXlsxToCells(buffer: ArrayBuffer): Promise<string[][]>` — new; see §3.
- `rowsFromCells(cells: string[][]): { name: string; email: string }[]` — the shared column logic (§2).

`parseCSV` is removed; its call site uses `rowsFromCells(parseCsvToCells(text))`.

### 2. Column detection (header-first, positional fallback)

`rowsFromCells(cells)`:
1. If `cells` is empty → return `[]`.
2. **Header path:** lowercase the first row's cells; `nameIdx = indexOf("name")`, `emailIdx = indexOf("email")`. If BOTH are found, read `cells.slice(1)`, taking `row[nameIdx]` and `row[emailIdx]`. (Exact parity with today's CSV.)
3. **Positional fallback** (header path did not find both): operate on the first two columns.
   - Decide whether row 1 is a header to skip: `firstRowLooksLikeData = cells[0].slice(0, 2).some(c => c.includes("@"))`. Data rows = `firstRowLooksLikeData ? cells : cells.slice(1)`.
   - For each data row, of its first two cells: the one containing `@` is `email`, the other is `name`. If neither contains `@`, default `name = row[0]`, `email = row[1]`. If both contain `@`, default `name = row[0]`, `email = row[1]` (ambiguous; deterministic default).
4. In all paths: `trim()` both fields; drop rows where `name` or `email` is empty after trimming.

### 3. Excel parsing (`parseXlsxToCells`)

```
const ExcelJS = (await import("exceljs")).default;      // same dynamic-import pattern as downloadExcel
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);
const ws = wb.worksheets[0];                             // first sheet only
if (!ws) return [];
const grid: string[][] = [];
ws.eachRow({ includeEmpty: false }, (row) => {
  const cells: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell) => { cells.push(cellText(cell.value)); });
  grid.push(cells);
});
return grid;
```

`cellText(value): string` normalizes every ExcelJS cell value to plain text, because Excel commonly stores an email as a **hyperlink** or **rich-text** object, not a bare string:
- `null` / `undefined` → `""`
- `string` → the string
- `number` / `boolean` → `String(value)`
- object with a `text` property (hyperlink `{ text, hyperlink }`, rich text `{ richText: [...] }`) → prefer `value.text`; else if `value.richText` is an array, join its `.text` parts; else if `value.result` is present (formula) → `String(value.result)`
- `Date` → skip/`""` (not expected for name/email columns)
- fallback → `String(value)`
Then `.trim()`.

Only `.xlsx` is supported (ExcelJS does not reliably read the legacy `.xls` BIFF format). `.xls` users re-save as `.xlsx`.

### 4. File handler + UX

- `accept` widened to `".csv,.xlsx"` (line 1905).
- `handleFileChange` becomes async and branches on the file name:
  ```
  const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
  let rows;
  try {
    if (isXlsx) {
      const buffer = await file.arrayBuffer();
      rows = rowsFromCells(await parseXlsxToCells(buffer));
    } else {
      const text = await file.text();
      rows = rowsFromCells(parseCsvToCells(text));
    }
  } catch {
    setImportError("We couldn't read that file. Please upload a .csv or .xlsx with a name column and an email column.");
    setImportRows([]);
    return;
  }
  if (rows.length === 0) {
    setImportError("We couldn't find any name/email rows in that file. Make sure it has a name column and an email column.");
    setImportRows([]);
    return;
  }
  setImportRows(rows);
  setImportResult(null);
  setImportError("");
  ```
  Reset `e.target.value = ""` still runs (so the same file can be re-picked). Because reading is now async, capture `file` before the `await` (it already is — `const file = e.target.files?.[0]`), and reset the input value before the async read to avoid referencing a cleared event.
- Update the CSV helper text (the two "Your file needs two columns…" strings from the earlier wording pass) to mention Excel: e.g. "Upload a .csv or Excel .xlsx file with a name column and an email column (any order). We'll generate a unique access ID and password for each row automatically."

## Out of scope

- Legacy `.xls` binary format (ExcelJS can't read it reliably).
- Multi-sheet selection (first sheet only).
- Column mapping UI / preview-and-confirm before import (the existing flow already shows parsed rows before the admin clicks Import).
- Any change to the import API route or the credential-email flow.

## Verification plan

- `npx tsc --noEmit -p .` (repo has no test framework).
- Manual, in the dev app's Candidates tab:
  - CSV with a `name,email` header → imports as before (regression check).
  - CSV with two unlabeled columns, no header → now imports via positional fallback.
  - `.xlsx` with a `name`/`email` header row → imports.
  - `.xlsx` with two unlabeled columns → imports positionally.
  - `.xlsx` where the email column is auto-hyperlinked by Excel → emails still read correctly (cellText normalization).
  - `.xlsx` with columns swapped (email first) → still maps correctly via `@` detection.
  - A file with no usable columns / an empty file → shows the clear inline error, imports nothing.
