/** Merges the date-of-month from `date` with the time-of-day from `time` into
 * one ISO 8601 string. Used where a form picks date and time-of-day with two
 * separate DateTimePicker fields (see components/wallet/DateField.tsx) — the
 * native picker's own return value for a `mode="date"` pick can carry
 * unrelated time-of-day components (and vice versa for `mode="time"`), so the
 * two picks are combined explicitly rather than trusting either Date object
 * on its own. */
export function combineDateAndTime(date: Date, time: Date): string {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  return combined.toISOString();
}
