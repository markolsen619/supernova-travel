import { stopTime } from '@/utils/stopTime';

describe('stopTime', () => {
  it('your own time wins', () => {
    expect(stopTime({ startTime: '20:00' }, '19:30')).toEqual({ time: '20:00', fromBooking: false });
  });
  it('a matching booking fills an empty stop', () => {
    expect(stopTime({ startTime: null }, '19:30')).toEqual({ time: '19:30', fromBooking: true });
  });
  it('no time at all is fine — the order is the plan', () => {
    expect(stopTime({ startTime: null }, null)).toEqual({ time: null, fromBooking: false });
    expect(stopTime({ startTime: '' }, undefined)).toEqual({ time: null, fromBooking: false });
  });
});
