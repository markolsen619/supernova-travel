import { buildPastTrip, coverPhoto, pastTripNights, shownPhotos, spanDays, type PickedPhoto } from '@/utils/pastTrip';

let n = 0;
const p = (day: string | null, hhmm: string | null, lat: number | null, lng: number | null, id = `p${n++}`): PickedPhoto => ({
  id, uri: `file://${id}.jpg`,
  meta: { day, minutes: hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null, lat, lng },
});
// Lisbon, Alfama ~ (38.7115,-9.1300); Baixa ~1.3 km away (38.7100,-9.1450); Porto ~275 km north.
const ALFAMA = [38.7115, -9.13] as const;
const BAIXA = [38.71, -9.145] as const;
const PORTO = [41.1496, -8.611] as const;

describe('buildPastTrip', () => {
  it('one day, two places far apart → two stops, times as printed', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-03', '10:20', ...ALFAMA), p('2025-05-03', '12:00', ...BAIXA)]);
    expect(d.days).toHaveLength(1);
    expect(d.days[0].stops.map((s) => [s.time, s.photoIds.length])).toEqual([['10:00', 2], ['12:00', 1]]);
  });
  it('same place but more than 90 min later → a new stop', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-03', '11:45', ...ALFAMA)]);
    expect(d.days[0].stops).toHaveLength(2);
  });
  it('photos picked out of order are sorted by time; a duplicate id counts once', () => {
    const a = p('2025-05-03', '12:00', ...BAIXA, 'dup');
    const d = buildPastTrip([a, p('2025-05-03', '10:00', ...ALFAMA), a]);
    expect(d.days[0].stops.map((s) => s.time)).toEqual(['10:00', '12:00']);
    expect(d.days[0].stops[1].photoIds).toEqual(['dup']);
  });
  it('days between with no photos stay as empty days', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-05', '10:00', ...ALFAMA)]);
    expect(d.days.map((x) => [x.day, x.stops.length])).toEqual([['2025-05-03', 1], ['2025-05-04', 0], ['2025-05-05', 1]]);
  });
  it('a night out across midnight splits by printed date', () => {
    const d = buildPastTrip([p('2025-05-03', '23:30', ...BAIXA), p('2025-05-04', '00:20', ...BAIXA)]);
    expect(d.days.map((x) => x.stops.length)).toEqual([1, 1]);
  });
  it('photos from another phone with another time zone still go by their printed date and time', () => {
    const d = buildPastTrip([p('2025-05-03', '09:00', ...ALFAMA), p('2025-05-03', '08:30', ...ALFAMA)]);
    expect(d.days[0].stops[0].time).toBe('08:30');
  });
  it('more than 50 km away starts a new city, and the day takes its first stop\'s city', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-05', '10:00', ...PORTO)]);
    expect(d.cities).toHaveLength(2);
    expect(d.days.map((x) => x.city)).toEqual([0, 0, 1]);
  });
  it('photos without a location (or a time) go to unplaced; dated ones still set the trip dates', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA), p('2025-05-04', '10:00', null, null, 'shot'), p(null, null, null, null, 'scr')]);
    expect(d.unplaced).toEqual(['shot', 'scr']);
    expect(d.days.map((x) => x.day)).toEqual(['2025-05-03', '2025-05-04']);
  });
  it('no photo has a location → days from the dates, no stops, no cities, everything unplaced', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', null, null, 'a'), p('2025-05-04', '10:00', null, null, 'b')]);
    expect(d.days.map((x) => x.stops.length)).toEqual([0, 0]);
    expect(d.cities).toEqual([]);
    expect(d.unplaced).toEqual(['a', 'b']);
  });
  it('nothing dated at all → no days', () => {
    expect(buildPastTrip([p(null, null, null, null)]).days).toEqual([]);
  });
});

describe('shownPhotos', () => {
  it('keeps at most 10, spread across the visit', () => {
    const photos: Record<string, PickedPhoto> = {};
    const ids = Array.from({ length: 14 }, (_, i) => { const x = p('2025-05-03', `10:${String(i).padStart(2, '0')}`, ...ALFAMA, `s${i}`); photos[x.id] = x; return x.id; });
    const shown = shownPhotos(ids, photos);
    expect(shown).toHaveLength(10);
    expect(shown[0]).toBe('s0');
    expect(shown[9]).toBe('s13');
  });
  it('10 or fewer: all', () => {
    expect(shownPhotos(['a', 'b'], {})).toEqual(['a', 'b']);
  });
});

describe('coverPhoto, spanDays, pastTripNights', () => {
  it('cover = the first photo of the stop with the most photos', () => {
    const d = buildPastTrip([p('2025-05-03', '10:00', ...ALFAMA, 'one'), p('2025-05-03', '12:00', ...BAIXA, 'two'), p('2025-05-03', '12:05', ...BAIXA, 'three')]);
    expect(coverPhoto(d.days)).toBe('two');
  });
  it('span in days, inclusive', () => {
    expect(spanDays([p('2025-05-03', '10:00', null, null), p('2025-07-10', '10:00', null, null)])).toBe(69);
  });
  it('nights: days per city, the last city loses its departure day', () => {
    expect(pastTripNights([0, 0, 0, 1, 1], 2)).toEqual([3, 1]);
    expect(pastTripNights([0, 0, 1], 2)).toEqual([2, 0]);
  });
});

import { pastTripEyebrow } from '@/utils/pastTrip';
it('eyebrow', () => {
  expect(pastTripEyebrow(['2025-05-03', '2025-05-04', '2025-05-05', '2025-05-06', '2025-05-07'])).toBe('MAY 3 – 7, 2025 · 5 DAYS');
  expect(pastTripEyebrow(['2025-05-31', '2025-06-01'])).toBe('MAY 31 – JUN 1, 2025 · 2 DAYS');
  expect(pastTripEyebrow(['2025-12-31', '2026-01-01'])).toBe('DEC 31, 2025 – JAN 1, 2026 · 2 DAYS');
  expect(pastTripEyebrow(['2025-05-03'])).toBe('MAY 3, 2025 · 1 DAY');
});

import { pastTripsSupported } from '@/utils/pastTrip';
it('final review C2: iPhone only until Android can read photo locations', () => {
  expect(pastTripsSupported('ios')).toBe(true);
  expect(pastTripsSupported('android')).toBe(false);
  expect(pastTripsSupported('web')).toBe(false);
});

import { mergeSameArea } from '@/utils/pastTrip';

describe('mergeSameArea (owner trip: "Grote Markt, Brussels" twice in a row at the same spot)', () => {
  const stop = (id: string, name: string, lat: number, photoIds: string[]) => ({ id, name, lat, lng: 4.35, time: '10:00', photoIds, shownIds: photoIds, placeName: null, type: 'activity' as const });
  const draft = (stops: ReturnType<typeof stop>[]) => ({ title: '', description: '', cities: [], unplaced: [], coverId: null, photos: {}, days: [{ day: '2024-11-22', city: 0, caption: '', stops }] });
  it('merges back-to-back stops with the same name and spot, keeping every photo', () => {
    const d = mergeSameArea(draft([stop('s1', 'Grote Markt, Brussels', 50.848, ['a']), stop('s2', 'Grote Markt, Brussels', 50.848, ['b']), stop('s3', 'Sablon, Brussels', 50.84, ['c'])]));
    expect(d.days[0].stops.map((s) => [s.id, s.photoIds])).toEqual([['s1', ['a', 'b']], ['s3', ['c']]]);
  });
  it('the same area later in the day (after somewhere else) stays a separate stop', () => {
    const d = mergeSameArea(draft([stop('s1', 'A', 50.848, ['a']), stop('s2', 'B', 50.84, ['b']), stop('s3', 'A', 50.848, ['c'])]));
    expect(d.days[0].stops).toHaveLength(3);
  });
  it('keeps at most 10 shown photos', () => {
    const many = (p: string) => Array.from({ length: 7 }, (_, i) => `${p}${i}`);
    const d = mergeSameArea(draft([stop('s1', 'A', 50.848, many('a')), stop('s2', 'A', 50.848, many('b'))]));
    expect(d.days[0].stops[0].photoIds).toHaveLength(14);
    expect(d.days[0].stops[0].shownIds).toHaveLength(10);
  });
});
