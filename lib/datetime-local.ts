// Helpers for round-tripping <input type="datetime-local"> values through
// the browser's local timezone.
//
// The browser always reads and writes a datetime-local input's value as a
// bare "YYYY-MM-DDTHH:mm" string with no timezone info, interpreted as
// whatever the *browser's* local time is. Two mistakes are easy to make:
//   1. Slicing a stored UTC ISO string directly into the input (shows raw
//      UTC digits, mislabeled as if they were local time).
//   2. Sending that bare string straight to the server, where `new Date()`
//      reinterprets it as the *server's* local time (UTC on Vercel) instead
//      of the browser's — silently shifting the instant by the difference
//      between the admin's timezone and the server's.
// These two helpers are the only correct way to cross that boundary.

// Stored ISO string (UTC) -> value for <input type="datetime-local">, in
// the browser's local time.
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

// <input type="datetime-local"> value (browser-local, no timezone) -> a
// proper UTC ISO string safe to send to the server. Returns null for an
// empty or unparseable value.
export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
