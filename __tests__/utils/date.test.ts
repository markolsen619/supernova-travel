import { combineDateAndTime } from '@/utils/date';

describe('combineDateAndTime', () => {
  it('combines the date components of `date` with the time components of `time`', () => {
    const date = new Date(2025, 7, 15, 3, 0, 0); // Aug 15 2025, arbitrary time
    const time = new Date(2020, 0, 1, 14, 30, 0); // arbitrary date, 2:30 PM
    const result = new Date(combineDateAndTime(date, time));
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it('keeps the date-of-month from `date`, unaffected by a late time-of-day', () => {
    const date = new Date(2025, 0, 1);
    const time = new Date(2020, 5, 15, 23, 45, 0);
    const result = new Date(combineDateAndTime(date, time));
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(45);
  });

  it('returns a valid ISO 8601 string', () => {
    const date = new Date(2025, 7, 15);
    const time = new Date(2025, 7, 15, 9, 0, 0);
    const result = combineDateAndTime(date, time);
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });
});
