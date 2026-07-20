/**
 * Time-of-day lighting for Mapbox Standard's `lightPreset`.
 *
 * Deliberately clock-based, not location-based: the device clock is already
 * the local time at the user's location, so no permission prompt and no
 * expo-location dependency are needed to know whether it's day or night.
 * (A future refinement could sharpen the dawn/dusk windows with real
 * sunrise/sunset math from coordinates — that's precision, not correctness.)
 */
export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';

export function lightPresetForNow(date: Date = new Date()): LightPreset {
  const hour = date.getHours();
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}
