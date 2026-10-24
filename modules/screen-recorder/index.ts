import { requireOptionalNativeModule } from 'expo';

type Recorder = {
  isAvailable(): boolean;
  /** The map's rectangle in window points, and the window width in points: frames are cropped to it. */
  start(x: number, y: number, width: number, height: number, windowWidth: number): Promise<void>; stop(): Promise<string>; cancel(): Promise<void>; discard(uri: string): void };

/**
 * Records this app's screen for the trip video (modules/screen-recorder/ios, ReplayKit). Null on Android and in builds
 * without the native module (Expo Go, apps built before it shipped), so callers show no button instead of crashing.
 */
export const ScreenRecorder: Recorder | null = requireOptionalNativeModule<Recorder>('ScreenRecorder');
