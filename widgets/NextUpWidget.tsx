import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { entryAt, type WidgetView } from '@/utils/widgetTimeline';

const EMPTY: WidgetView = { kind: 'empty', eyebrow: 'SUPERNOVA', title: 'Plan your next trip', detail: null, second: null, url: 'supernova://create', imageKey: null };

/**
 * Supernova's Android Home Screen widget (spec docs/superpowers/specs/2026-11-12-packing-holidays-widget-design.md):
 * draws the entry in effect now from the app's precomputed entries (utils/widgetTimeline) — the same content and
 * ticket-like dark card as the iPhone widget. Tapping opens the flight, the trip or Create.
 */
export function NextUpWidget({ entries }: { entries: { at: number; view: WidgetView }[] }) {
  const v = entryAt(entries, Date.now()) ?? EMPTY;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: v.url }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 16,
        backgroundGradient: { from: '#1a1035', to: '#0f0a29', orientation: 'TOP_BOTTOM' },
      }}
    >
      <TextWidget text={v.eyebrow} style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.08, color: '#C9C2DD' }} maxLines={1} truncate="END" />
      <FlexWidget style={{ flexDirection: 'column', flexGap: 2 }}>
        <TextWidget text={v.title} style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }} maxLines={2} truncate="END" />
        {v.detail ? <TextWidget text={v.detail} style={{ fontSize: 13, fontWeight: '500', color: '#E8E4F2' }} maxLines={1} truncate="END" /> : null}
        {v.second ? <TextWidget text={v.second} style={{ fontSize: 13, color: '#C9C2DD' }} maxLines={1} truncate="END" /> : null}
      </FlexWidget>
    </FlexWidget>
  );
}
