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
