/**
 * App entry: expo-router, plus the Android Home Screen widget's background handler, which must be registered before
 * the app starts (spec 2026-11-12; widgets/widgetTaskHandler).
 */
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widgets/widgetTaskHandler';
import 'expo-router/entry';

if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
