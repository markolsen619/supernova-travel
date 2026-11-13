import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WidgetBridge } from '@/modules/widget-bridge';
import { widgetTimeline, type WidgetInput } from '@/utils/widgetTimeline';

export const WIDGET_GROUP = 'group.com.supernovatravel.app';
export const WIDGET_ENTRIES_KEY = 'widget:entries';

/**
 * Writes the Home Screen widget's next 48 hours (spec 2026-11-12): iPhone through the App Group bridge, Android
 * through AsyncStorage for its widget task. Never throws (the widget keeps its last entries); nothing leaves the phone.
 */
export async function writeWidget(input: WidgetInput, coverUrl: string | null): Promise<void> {
  try {
    const entries = widgetTimeline(input, Date.now());
    const json = JSON.stringify(entries);
    if (Platform.OS === 'ios') {
      if (coverUrl && input.trip?.coverKey) await WidgetBridge.saveImage(coverUrl, input.trip.coverKey);
      WidgetBridge.setEntries(json);
      WidgetBridge.reload();
      return;
    }
    await AsyncStorage.setItem(WIDGET_ENTRIES_KEY, json);
    if (Platform.OS === 'android') {
      const { requestWidgetUpdate } = await import('react-native-android-widget');
      const { NextUpWidget } = await import('@/widgets/NextUpWidget');
      await requestWidgetUpdate({ widgetName: 'NextUp', renderWidget: () => NextUpWidget({ entries }) });
    }
  } catch {
    /* the widget keeps its last entries */
  }
}
