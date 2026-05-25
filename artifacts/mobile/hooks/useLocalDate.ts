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
