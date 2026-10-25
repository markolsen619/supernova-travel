import { requireOptionalNativeModule } from 'expo';

type Recorder = {
  isAvailable(): boolean;
  /** iOS: the map's rectangle in window points, and the window width in points: frames are cropped to it. */
  start(x: number, y: number, width: number, height: number, windowWidth: number): Promise<void>;
  /** Android: frame capture of the map's surface (under `mapRootTag`) with the film overlay (`overlayTag`) drawn on top. */
  startViews(mapRootTag: number, overlayTag: number): Promise<void>;
  stop(): Promise<string>;
  cancel(): Promise<void>;
  discard(uri: string): void;
};

/**
 * The trip video's recorder: iOS records this app's screen (ReplayKit, ios/), Android captures the map's frames
 * (PixelCopy + MediaCodec, android/). Null in builds without the native module (Expo Go, apps built before it
 * shipped), so callers show no button instead of crashing.
 */
export const ScreenRecorder: Recorder | null = requireOptionalNativeModule<Recorder>('ScreenRecorder');
