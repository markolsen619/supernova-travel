import { buildPastTrip, type PickedPhoto } from '@/utils/pastTrip';
import { editPastTrip, stopById } from '@/utils/pastTripEdits';

const p = (id: string, hhmm: string, lat: number | null, lng: number | null): PickedPhoto => ({
  id, uri: `file://${id}`, meta: { day: '2025-05-03', minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), lat, lng },
});
const draft = () => buildPastTrip([p('a', '10:00', 38.7115, -9.13), p('b', '12:00', 38.71, -9.145), p('c', '14:00', 38.69, -9.2), p('x', '15:00', null, null)]);

describe('editPastTrip', () => {
  it('renames a stop and sets its place', () => {
    let d = editPastTrip(draft(), { type: 'rename', stopId: 's1', name: 'Miradouro' });
    expect(stopById(d, 's1')!.name).toBe('Miradouro');
    d = editPastTrip(d, { type: 'place', stopId: 's1', name: 'Castelo', placeName: 'Castelo de São Jorge', lat: 38.7139, lng: -9.1335 });
    expect(stopById(d, 's1')).toMatchObject({ name: 'Castelo', placeName: 'Castelo de São Jorge', lat: 38.7139 });
  });
  it('merges a stop into the one before it (photos joined, earlier time kept)', () => {
    const d = editPastTrip(draft(), { type: 'mergeWithPrevious', stopId: 's2' });
    expect(d.days[0].stops.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(stopById(d, 's1')!.photoIds).toEqual(['a', 'b']);
    expect(stopById(d, 's1')!.time).toBe('10:00');
  });
  it('merging the first stop of a day does nothing', () => {
    const d0 = draft();
    expect(editPastTrip(d0, { type: 'mergeWithPrevious', stopId: 's1' })).toBe(d0);
  });
  it('deleting a stop sends its photos to unplaced', () => {
    const d = editPastTrip(draft(), { type: 'deleteStop', stopId: 's3' });
    expect(d.days[0].stops.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(d.unplaced).toEqual(['x', 'c']);
  });
  it('moves an unplaced photo onto a stop, and a photo between stops', () => {
    let d = editPastTrip(draft(), { type: 'movePhoto', photoId: 'x', toStopId: 's1' });
    expect(d.unplaced).toEqual([]);
    expect(stopById(d, 's1')!.photoIds).toEqual(['a', 'x']);
    d = editPastTrip(d, { type: 'movePhoto', photoId: 'a', toStopId: 's2' });
    expect(stopById(d, 's1')!.photoIds).toEqual(['x']);
    expect(stopById(d, 's2')!.photoIds).toEqual(['b', 'a']);
  });
  it('a stop left with no photos keeps existing (it is still a place you went)', () => {
    const d = editPastTrip(draft(), { type: 'movePhoto', photoId: 'a', toStopId: 's2' });
    expect(stopById(d, 's1')!.photoIds).toEqual([]);
  });
  it('toggleShown swaps which photos (≤ 10) a stop keeps', () => {
    let d = draft();
    d = editPastTrip(d, { type: 'toggleShown', stopId: 's1', photoId: 'a' });
    expect(stopById(d, 's1')!.shownIds).toEqual([]);
    d = editPastTrip(d, { type: 'toggleShown', stopId: 's1', photoId: 'a' });
    expect(stopById(d, 's1')!.shownIds).toEqual(['a']);
  });
  it('the cover stays valid: deleting the cover\'s stop picks a new one', () => {
    let d = editPastTrip(draft(), { type: 'cover', photoId: 'c' });
    expect(d.coverId).toBe('c');
    d = editPastTrip(d, { type: 'deleteStop', stopId: 's3' });
    expect(d.coverId).toBe('a');
  });
  it('title and captions', () => {
    let d = editPastTrip(draft(), { type: 'title', value: 'Five days of Lisbon' });
    d = editPastTrip(d, { type: 'caption', day: 0, value: 'Hills and tiles' });
    expect([d.title, d.days[0].caption]).toEqual(['Five days of Lisbon', 'Hills and tiles']);
  });
});
