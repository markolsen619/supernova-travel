import { requireOptionalNativeModule } from 'expo';

type Recorder = { isAvailable(): boolean; start(): Promise<void>; stop(): Promise<string>; cancel(): Promise<void> };

/**
 * Records this app's screen for the trip video (modules/screen-recorder/ios, ReplayKit). Null on Android and in builds
 * without the native module (Expo Go, apps built before it shipped), so callers show no button instead of crashing.
 */
export const ScreenRecorder: Recorder | null = requireOptionalNativeModule<Recorder>('ScreenRecorder');
