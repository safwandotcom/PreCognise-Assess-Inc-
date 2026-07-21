# Excel (.xlsx) Candidate Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the candidate bulk-import accept Excel `.xlsx` files in addition to CSV, reusing the ExcelJS dependency already in the project.

**Architecture:** Extract the parsing into a new, testable `lib/candidate-import.ts` with a shared cells→rows resolver that serves both formats (header-first column detection, positional fallback). The Candidates tab's file handler branches on extension, reads CSV as text and `.xlsx` as an ArrayBuffer (parsed via ExcelJS), and both feed the same existing `importRows` state. No new dependency, no backend change.

**Tech Stack:** Next.js App Router, TypeScript, ExcelJS (already a dependency, `^4.4.0`), Tailwind. No test framework in this repo — verification is `npx tsc --noEmit -p .`, a throwaway round-trip script for the pure parsers, plus a manual dev-server walkthrough.

## Global Constraints

- No new npm dependency — use the existing `exceljs`, loaded via dynamic `import("exceljs")` (matches the existing `downloadExcel` pattern) so it stays out of the main bundle.
- Both formats must produce the identical `{ name: string; email: string }[]` shape that the existing `handleImport` → `POST /api/admin/campaigns/[id]/candidates/import` flow already consumes. No downstream change.
- Column detection: header-first (a row with cells named `name` and `email`, case-insensitive, any order — exact parity with today's CSV), then positional fallback (first two columns; the cell containing `@` is the email, the other the name; skip row 1 only if it doesn't look like data).
- Excel cell values must be normalized to plain text (Excel stores auto-linked emails as hyperlink/rich-text objects, not strings).
- Only `.xlsx` is supported for Excel (not legacy `.xls`).
- CSV behavior that works today must keep working identically (the change is strictly additive).
- Repo's Bash shell has no `node`/`npx` on PATH — run `npx`/`node`/`npx tsx` via PowerShell.
- Spec reference: `docs/superpowers/specs/2026-07-22-excel-candidate-import-design.md`

---

## Task 1: Extract parsing into a testable `lib/candidate-import.ts`

**Files:**
- Create: `lib/candidate-import.ts`

**Interfaces:**
- Consumes: `exceljs` (dynamic import).
- Produces:
  - `cellText(value: unknown): string`
  - `parseCsvToCells(text: string): string[][]`
  - `parseXlsxToCells(buffer: ArrayBuffer): Promise<string[][]>`
  - `rowsFromCells(cells: string[][]): { name: string; email: string }[]`

Task 2 imports all four (well, `rowsFromCells` + the two parsers) into the Candidates tab.

- [ ] **Step 1: Write the module**

Create `lib/candidate-import.ts`:
```ts
// Parsing helpers for candidate bulk import (CSV + Excel .xlsx).
// Both formats are reduced to a 2D grid of trimmed string cells, then a single
// resolver turns the grid into { name, email } rows.

export type ImportRow = { name: string; email: string };

// Normalize any ExcelJS cell value to plain text. Excel commonly stores an
// email as a hyperlink or rich-text object rather than a bare string.
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return "";
  if (typeof value === "object") {
    const v = value as { text?: unknown; richText?: Array<{ text?: string }>; result?: unknown };
    if (typeof v.text === "string") return v.text.trim();
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? "").join("").trim();
    if (v.result !== undefined && v.result !== null) return String(v.result).trim();
  }
  return String(value).trim();
}

// Split CSV text into a grid of trimmed, unquoted cells. Empty lines dropped.
export function parseCsvToCells(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
}

// Read the first worksheet of an .xlsx buffer into a grid of trimmed string cells.
export async function parseXlsxToCells(buffer: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellText(cell.value));
    });
    if (cells.some((c) => c.length > 0)) grid.push(cells);
  });
  return grid;
}

// Resolve a cell grid into { name, email } rows.
// 1) Header path: if row 1 has cells named "name" and "email", read those columns.
// 2) Positional fallback: use the first two columns; the cell containing "@" is
//    the email, the other the name; skip row 1 if it doesn't look like data.
export function rowsFromCells(cells: string[][]): ImportRow[] {
  if (cells.length === 0) return [];

  const header = cells[0].map((c) => c.toLowerCase());
  const nameIdx = header.indexOf("name");
  const emailIdx = header.indexOf("email");

  if (nameIdx !== -1 && emailIdx !== -1) {
    return cells
      .slice(1)
      .map((row) => ({ name: (row[nameIdx] ?? "").trim(), email: (row[emailIdx] ?? "").trim() }))
      .filter((r) => r.name && r.email);
  }

  // Positional fallback.
  const firstRowLooksLikeData = cells[0].slice(0, 2).some((c) => c.includes("@"));
  const dataRows = firstRowLooksLikeData ? cells : cells.slice(1);
  return dataRows
    .map((row) => {
      const a = (row[0] ?? "").trim();
      const b = (row[1] ?? "").trim();
      if (b.includes("@") && !a.includes("@")) return { name: a, email: b };
      if (a.includes("@") && !b.includes("@")) return { name: b, email: a };
      return { name: a, email: b }; // neither or both look like email → deterministic default
    })
    .filter((r) => r.name && r.email);
}
```

- [ ] **Step 2: Verify the pure logic with a throwaway round-trip script (no test framework in this repo)**

Create `_verify_import.mjs` (temporary, deleted after):
```js
import ExcelJS from "exceljs";
import { parseCsvToCells, parseXlsxToCells, rowsFromCells, cellText } from "./lib/candidate-import.ts";

let failed = false;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failed = true; console.error(`FAIL ${label}\n  got:      ${a}\n  expected: ${e}`); }
  else console.log(`ok   ${label}`);
}

// CSV: header path
check("csv header", rowsFromCells(parseCsvToCells("name,email\nJohn,john@x.com\nJane,jane@x.com")),
  [{ name: "John", email: "john@x.com" }, { name: "Jane", email: "jane@x.com" }]);

// CSV: header path, columns swapped by name
check("csv header swapped", rowsFromCells(parseCsvToCells("email,name\njohn@x.com,John")),
  [{ name: "John", email: "john@x.com" }]);

// CSV: no header, positional, data in row 1
check("csv positional no-header", rowsFromCells(parseCsvToCells("John,john@x.com\nJane,jane@x.com")),
  [{ name: "John", email: "john@x.com" }, { name: "Jane", email: "jane@x.com" }]);

// CSV: unrecognized header row skipped, positional
check("csv positional skip-header", rowsFromCells(parseCsvToCells("Full Name,E-mail\nJohn,john@x.com")),
  [{ name: "John", email: "john@x.com" }]);

// CSV: positional with email in first column (swapped, detected by @)
check("csv positional email-first", rowsFromCells(parseCsvToCells("jane@x.com,Jane")),
  [{ name: "Jane", email: "jane@x.com" }]);

// CSV: rows missing a field dropped
check("csv drop-empty", rowsFromCells(parseCsvToCells("name,email\nJohn,john@x.com\n,nobody@x.com\nNoEmail,")),
  [{ name: "John", email: "john@x.com" }]);

// cellText: hyperlink + richText objects
check("cellText hyperlink", cellText({ text: "jane@x.com", hyperlink: "mailto:jane@x.com" }), "jane@x.com");
check("cellText richText", cellText({ richText: [{ text: "jo" }, { text: "hn@x.com" }] }), "john@x.com");
check("cellText plain", cellText("  spaced  "), "spaced");

// Excel round-trip: build a workbook with a header row and an auto-linked email cell, then parse it
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Sheet1");
ws.addRow(["name", "email"]);
ws.addRow(["John Doe", "john@x.com"]);
const r = ws.addRow(["Jane Roe", ""]);
r.getCell(2).value = { text: "jane@x.com", hyperlink: "mailto:jane@x.com" }; // simulate Excel auto-link
const buf = await wb.xlsx.writeBuffer();
const grid = await parseXlsxToCells(buf);
check("xlsx header+hyperlink", rowsFromCells(grid),
  [{ name: "John Doe", email: "john@x.com" }, { name: "Jane Roe", email: "jane@x.com" }]);

console.log(failed ? "\nFAILED" : "\nPASS: all import-parser cases correct");
process.exitCode = failed ? 1 : 0;
```
Run (PowerShell): `npx tsx _verify_import.mjs`
Expected: every line `ok …` then `PASS: all import-parser cases correct`.

- [ ] **Step 3: Delete the throwaway script**

```bash
rm _verify_import.mjs
```

- [ ] **Step 4: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/candidate-import.ts
git commit -m "$(cat <<'EOF'
feat: extract candidate-import parsing into a testable lib module

New lib/candidate-import.ts turns CSV text or an .xlsx buffer into a
grid of trimmed cells, then resolves { name, email } rows via
header-first detection with a positional fallback. Excel cell values
(including auto-hyperlinked emails) are normalized to plain text. Pure
functions, verified with a round-trip script; not yet wired into the UI.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire the Candidates tab to accept CSV and .xlsx

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `rowsFromCells`, `parseCsvToCells`, `parseXlsxToCells` from `@/lib/candidate-import` (Task 1).
- Produces: no new interface — the async `handleFileChange` feeds the existing `importRows` state.

- [ ] **Step 1: Add the import**

Near the top of `app/admin/campaigns/[id]/page.tsx`, with the other imports, add:
```ts
import { rowsFromCells, parseCsvToCells, parseXlsxToCells } from "@/lib/candidate-import";
```

- [ ] **Step 2: Remove the local `parseCSV` function**

Delete the entire `parseCSV` function (currently around lines 79-96):
```ts
function parseCSV(text: string): { name: string; email: string }[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim());
  const nameIdx = header.indexOf("name");
  const emailIdx = header.indexOf("email");
  if (nameIdx === -1 || emailIdx === -1) return [];
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { name: cols[nameIdx] ?? "", email: cols[emailIdx] ?? "" };
    })
    .filter((r) => r.name && r.email);
}
```
(Its behavior now lives in `rowsFromCells(parseCsvToCells(...))`.)

- [ ] **Step 3: Rewrite `handleFileChange` to async with format branching**

Replace the existing handler (currently around lines 1706-1720):
```tsx
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setImportRows(rows);
      setImportResult(null);
      setImportError("");
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }
```
with:
```tsx
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input up front so the same file can be re-selected, and so we don't
    // reference the (cleared) event after the async read below.
    e.target.value = "";
    if (!file) return;

    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    let rows: { name: string; email: string }[];
    try {
      if (isXlsx) {
        const buffer = await file.arrayBuffer();
        rows = rowsFromCells(await parseXlsxToCells(buffer));
      } else {
        const text = await file.text();
        rows = rowsFromCells(parseCsvToCells(text));
      }
    } catch {
      setImportRows([]);
      setImportResult(null);
      setImportError("We couldn't read that file. Please upload a .csv or .xlsx with a name column and an email column.");
      return;
    }

    if (rows.length === 0) {
      setImportRows([]);
      setImportResult(null);
      setImportError("We couldn't find any name/email rows in that file. Make sure it has a name column and an email column.");
      return;
    }

    setImportRows(rows);
    setImportResult(null);
    setImportError("");
  }
```

- [ ] **Step 4: Widen the file picker and update the label**

Find:
```tsx
          <span className="text-sm font-medium text-[#0F172A]">
            Click to upload CSV
          </span>
```
Replace with:
```tsx
          <span className="text-sm font-medium text-[#0F172A]">
            Click to upload CSV or Excel
          </span>
```
Then find:
```tsx
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={handleFileChange}
          />
```
Replace with:
```tsx
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={handleFileChange}
          />
```

- [ ] **Step 5: Update the helper text (both occurrences)**

There are two identical helper strings in this file. Replace BOTH occurrences of:
```
Your file needs two columns: name and email (any order, header names aren't case-sensitive). We'll generate a unique access ID and password for each row automatically.
```
with:
```
Upload a .csv or Excel .xlsx file with a name column and an email column (any order). We'll generate a unique access ID and password for each row automatically.
```
(Use a replace-all on the exact string, or edit each of the two occurrences — verify there are exactly two afterward.)

- [ ] **Step 6: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors (confirms `parseCSV` has no remaining references and the new imports resolve).

- [ ] **Step 7: Confirm `parseCSV` is fully gone**

```bash
grep -n "parseCSV" "app/admin/campaigns/[id]/page.tsx"
```
Expected: no matches.

- [ ] **Step 8: Manual verification (controller runs the dev server)**

In the Candidates tab of a campaign, exercise the matrix from the spec:
1. CSV with a `name,email` header → parses and imports as before (regression).
2. CSV with two unlabeled columns, no header → parses via positional fallback.
3. `.xlsx` with a `name`/`email` header row → parses.
4. `.xlsx` with two unlabeled columns → parses positionally.
5. `.xlsx` whose email column was auto-hyperlinked by Excel → emails read correctly.
6. `.xlsx` with columns swapped (email first) → still maps correctly.
7. An empty file or one with no usable columns → shows the clear inline error, imports nothing.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: accept Excel .xlsx files in candidate bulk import

The Candidates-tab uploader now takes .csv or .xlsx. handleFileChange
reads CSV as text and .xlsx as an ArrayBuffer (parsed via ExcelJS),
both feeding the shared row resolver, and surfaces a clear error when a
file yields no usable name/email rows. Removes the old inline parseCSV.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: zero errors.

- [ ] **Step 2: Confirm the parser lives only in the lib module**

```bash
grep -rn "parseCsvToCells\|parseXlsxToCells\|rowsFromCells" --include="*.ts" --include="*.tsx" lib app
```
Expected: the definitions in `lib/candidate-import.ts` and the single import + call site in `app/admin/campaigns/[id]/page.tsx`; no stray duplicate parser.

- [ ] **Step 3: No commit** — verification only; fix any issue in the task that introduced it and re-commit there.
