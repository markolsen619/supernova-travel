import { useRef, useCallback } from 'react';
import { Camera } from '@rnmapbox/maps';
import { pitchForZoom, headingForArrival } from '@/utils/camera';

export type CameraHandle = React.ElementRef<typeof Camera>;

const DEFAULT_DURATION_MS = 1200;
// Screen-point padding around a fitted bounds box, so the region isn't
// framed edge-to-edge against the device chrome/search bar.
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
        heading: headingForArrival(lng, zoom),
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
  // ONE camera stop, carrying bounds and pitch and heading together — NOT a
  // pitch reset followed by fitBounds. fitBounds is itself a thin wrapper that
  // calls setCamera({ type: 'CameraStop', bounds, padding }), so issuing both
  // in the same tick means the second stop preempts the first, and because a
  // CameraStop leaves omitted fields at their current value, the pitch reset
  // never lands. A region arrived at straight after a tilted POI would stay
  // crooked — the exact bug the reset exists to prevent, and one that only
  // shows on the SECOND navigation, never the first.
  const flyToBounds = useCallback(
    (ne: [number, number], sw: [number, number], durationMs = DEFAULT_DURATION_MS) => {
      cameraRef.current?.setCamera({
        bounds: { ne, sw },
        padding: {
          paddingTop: BOUNDS_PADDING,
          paddingBottom: BOUNDS_PADDING,
          paddingLeft: BOUNDS_PADDING,
          paddingRight: BOUNDS_PADDING,
        },
        pitch: 0,
        heading: 0,
        animationDuration: durationMs,
        animationMode: 'flyTo',
      });
    },
    [],
  );

  return { cameraRef, flyTo, flyToBounds };
}
