import { useRef, useCallback } from 'react';
import { Camera } from '@rnmapbox/maps';
import { pitchForZoom, headingForArrival } from '@/utils/camera';

export type CameraHandle = React.ElementRef<typeof Camera>;

const DEFAULT_DURATION_MS = 1200;
const BOUNDS_PADDING = 60;

export function useFlyTo() {
  const cameraRef = useRef<CameraHandle>(null);

  // Point + zoom case. zoom is required — callers should always derive it via
  // zoomForPlaceType() (or use flyToBounds when a viewport is available), so a
  // missing zoom is a bug at the call site, not something to silently default.
  const flyTo = useCallback(
    (lng: number, lat: number, zoom: number, durationMs = DEFAULT_DURATION_MS) => {
      cameraRef.current?.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: zoom,
        pitch: pitchForZoom(zoom),
        heading: headingForArrival(lng),
        animationDuration: durationMs,
        animationMode: 'flyTo',
      });
    },
    [],
  );

  // Bounds-fitting case — preferred over flyTo whenever Google gives us a
  // viewport (regions: country/administrative_area/locality), since a fitted
  // box frames the place far more correctly than a guessed zoom level.
  //
  // fitBounds does NOT touch pitch or heading, so arriving here from a tilted
  // POI would leave the region framed crooked. Reset both explicitly first —
  // this is the easiest thing in the file to get wrong, because it only shows
  // up on the second navigation, never the first.
  const flyToBounds = useCallback(
    (ne: [number, number], sw: [number, number], durationMs = DEFAULT_DURATION_MS) => {
      cameraRef.current?.setCamera({
        pitch: 0,
        heading: 0,
        animationDuration: durationMs / 2,
        animationMode: 'easeTo',
      });
      cameraRef.current?.fitBounds(ne, sw, BOUNDS_PADDING, durationMs);
    },
    [],
  );

  return { cameraRef, flyTo, flyToBounds };
}
