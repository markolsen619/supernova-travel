import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { NextUpWidget } from './NextUpWidget';
import { WIDGET_ENTRIES_KEY } from '@/services/widgetData';

/** Android redraws the widget (added, every 30 min, resized) from the entries the app last saved; none → the plan view. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  let entries = [];
  try {
    const raw = await AsyncStorage.getItem(WIDGET_ENTRIES_KEY);
    entries = raw ? JSON.parse(raw) : [];
  } catch {
    entries = [];
  }
  props.renderWidget(<NextUpWidget entries={Array.isArray(entries) ? entries : []} />);
}
