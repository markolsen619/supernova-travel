/**
 * Calendar dates — a day on a wall calendar, with no time and no timezone.
 *
 * A hotel check-in, a check-out and a loyalty expiry are all calendar dates:
 * "15 October" means the same day whether you read it in Lisbon or San Diego.
 * An instant is a different thing — a flight's `departureTime` really does
 * happen at one moment worldwide, and stays a full ISO timestamp.
 *
 * Storing a calendar date as an instant is what broke: `new Date('2026-10-15')`
 * parses as UTC midnight, and rendering that anywhere behind UTC shows the
 * previous day. Calendar dates are therefore stored as `YYYY-MM-DD` and only
 * ever converted through this module.
 */

/** `YYYY-MM-DD`, the stored form. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The local calendar day of `date`, as `YYYY-MM-DD`. */
export function toCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  // Deliberately not toISOString().slice(0, 10): that converts to UTC first,
  // so an evening in the Americas would record tomorrow's date.
  return `${year}-${month}-${day}`;
}

/**
 * A calendar date as a `Date` at **local midnight** — the form the date
 * pickers want.
 *
 * Also accepts the full ISO timestamps written before this module existed,
 * reading their **UTC** calendar day. That is the right reading for both
 * legacy shapes: `parseTravelConfirmation` asked Gemini for UTC midnight, and
 * the add forms wrote local midnight converted to UTC, which lands on the same
 * UTC day for every timezone from UTC-11 through UTC+0. It is wrong only for a
 * legacy row typed in a UTC+ zone, of which there are none in the database.
 *
 * @returns null when the value is empty or unparseable, never a NaN Date.
 */
export function parseCalendarDate(value: string): Date | null {
  if (!value) return null;

  const parts = DATE_ONLY.exec(value);
  if (parts) {
    return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  }

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return new Date(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
}

/**
 * A calendar date rendered for display.
 *
 * @returns the value unchanged when it can't be read, so a malformed field
 * shows something rather than "Invalid Date".
 */
export function formatCalendarDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseCalendarDate(value);
  if (!date) return value;
  return date.toLocaleDateString('en-US', options);
}
