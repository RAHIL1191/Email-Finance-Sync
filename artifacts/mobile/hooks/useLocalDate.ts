/**
 * Parse a date string as local time.
 *
 * Date-only strings ("2026-05-25") are treated by `new Date()` as UTC midnight,
 * which shifts them to the previous day in negative-UTC-offset timezones (e.g. EDT).
 * This helper appends "T00:00:00" so they are parsed as local midnight instead.
 *
 * Full ISO strings ("2026-05-25T02:38:16.672Z") are handled normally.
 */
export function parseLocalDate(dateStr: string | undefined | null): Date {
  if (!dateStr) return new Date();
  // Date-only string (YYYY-MM-DD) — treat as local midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + "T00:00:00");
  }
  return new Date(dateStr);
}

/**
 * Format a Date as "YYYY-MM-DD" in the user's local timezone.
 * Use this instead of `date.toISOString().slice(0, 10)` which returns the UTC date.
 */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Extract the "YYYY-MM" month key from a date string in the user's local timezone.
 * Handles both date-only ("2026-04-30") and full ISO ("2026-05-01T02:00:00Z") strings.
 */
export function localYM(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
