/** True when `date` is a date of birth younger than 13 years. */
export function isUnder13(date: Date): boolean {
  const today = new Date();
  const age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  return (m < 0 || (m === 0 && today.getDate() < date.getDate()) ? age - 1 : age) < 13;
}
