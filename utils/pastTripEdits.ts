/** The past-trip review screen's edits, as a pure reducer (spec: rename, change place, merge, delete, move photos). */
import { coverPhoto, MAX_STOP_PHOTOS, shownPhotos, type DraftStop, type PastTripDraft } from '@/utils/pastTrip';

export type PastTripEdit =
  | { type: 'title'; value: string }
  | { type: 'caption'; day: number; value: string }
  | { type: 'rename'; stopId: string; name: string }
  | { type: 'place'; stopId: string; name: string; placeName: string; lat: number; lng: number }
  | { type: 'mergeWithPrevious'; stopId: string }
  | { type: 'deleteStop'; stopId: string }
  | { type: 'movePhoto'; photoId: string; toStopId: string }
  | { type: 'toggleShown'; stopId: string; photoId: string }
  | { type: 'cover'; photoId: string };

export function stopById(d: PastTripDraft, id: string): DraftStop | null {
  for (const day of d.days) for (const s of day.stops) if (s.id === id) return s;
  return null;
}

const mapStops = (d: PastTripDraft, f: (s: DraftStop) => DraftStop): PastTripDraft =>
  ({ ...d, days: d.days.map((day) => ({ ...day, stops: day.stops.map(f) })) });

function withCover(d: PastTripDraft): PastTripDraft {
  const used = new Set(d.days.flatMap((day) => day.stops.flatMap((s) => s.photoIds)));
  return d.coverId && used.has(d.coverId) ? d : { ...d, coverId: coverPhoto(d.days) };
}

export function editPastTrip(d: PastTripDraft, e: PastTripEdit): PastTripDraft {
  switch (e.type) {
    case 'title': return { ...d, title: e.value };
    case 'caption': return { ...d, days: d.days.map((day, i) => (i === e.day ? { ...day, caption: e.value } : day)) };
    case 'rename': return mapStops(d, (s) => (s.id === e.stopId ? { ...s, name: e.name } : s));
    case 'place': return mapStops(d, (s) => (s.id === e.stopId ? { ...s, name: e.name, placeName: e.placeName, lat: e.lat, lng: e.lng } : s));
    case 'cover': return { ...d, coverId: e.photoId };
    case 'mergeWithPrevious': {
      let changed = false;
      const days = d.days.map((day) => {
        const i = day.stops.findIndex((s) => s.id === e.stopId);
        if (i <= 0) return day;
        changed = true;
        const prev = day.stops[i - 1];
        const photoIds = [...prev.photoIds, ...day.stops[i].photoIds];
        const merged = { ...prev, photoIds, shownIds: shownPhotos(photoIds, d.photos) };
        return { ...day, stops: [...day.stops.slice(0, i - 1), merged, ...day.stops.slice(i + 1)] };
      });
      return changed ? { ...d, days } : d;
    }
    case 'deleteStop': {
      const gone = stopById(d, e.stopId);
      if (!gone) return d;
      const days = d.days.map((day) => ({ ...day, stops: day.stops.filter((s) => s.id !== e.stopId) }));
      return withCover({ ...d, days, unplaced: [...d.unplaced, ...gone.photoIds] });
    }
    case 'movePhoto': {
      if (!stopById(d, e.toStopId)) return d;
      const strip = (s: DraftStop): DraftStop => ({ ...s, photoIds: s.photoIds.filter((x) => x !== e.photoId), shownIds: s.shownIds.filter((x) => x !== e.photoId) });
      const moved = mapStops({ ...d, unplaced: d.unplaced.filter((x) => x !== e.photoId) }, (s) => {
        const s2 = strip(s);
        if (s.id !== e.toStopId) return s2;
        const photoIds = [...s2.photoIds, e.photoId];
        const shownIds = s2.shownIds.length < MAX_STOP_PHOTOS ? [...s2.shownIds, e.photoId] : s2.shownIds;
        return { ...s2, photoIds, shownIds };
      });
      return withCover(moved);
    }
    case 'toggleShown':
      return mapStops(d, (s) => {
        if (s.id !== e.stopId || !s.photoIds.includes(e.photoId)) return s;
        if (s.shownIds.includes(e.photoId)) return { ...s, shownIds: s.shownIds.filter((x) => x !== e.photoId) };
        if (s.shownIds.length >= MAX_STOP_PHOTOS) return s;
        return { ...s, shownIds: s.photoIds.filter((x) => x === e.photoId || s.shownIds.includes(x)) };
      });
  }
}
