/**
 * Year in Travel's slides (spec 2026-11-01). Each renders the same way on screen and inside the share image
 * (`share`: no buttons, never the companions slide). Always dark — the splash palette with the star gradient.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { WorldMap } from '@/components/yearInTravel/WorldMap';
import { countLabel, kmLine, styleLine, typeLine, type SlideId } from '@/utils/yearInTravel';
import type { YearSummary } from '@/types/yearInTravel';

export const INK = { text: '#F5F3F9', soft: '#B9B2CC', muted: '#8C85A0', accent: '#B9B2F0', pink: '#E28FA9' };

/** A number that counts up from 0 (or just shows, with Reduce Motion). */
const CountUp = memo(function CountUp({ value, animate, style }: { value: number; animate: boolean; style: object }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  const raf = useRef(0);
  useEffect(() => {
    if (!animate) { setShown(value); return; }
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / 1100);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, animate]);
  return <Text style={style}>{shown.toLocaleString('en-US')}</Text>;
});

interface SlideProps { id: SlideId; s: YearSummary; firstName: string; width: number; animate: boolean }

export const Slide = memo(function Slide({ id, s, firstName, width, animate }: SlideProps) {
  switch (id) {
    case 'opener':
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>SUPERNOVA · {s.year}</Text>
          <Text style={styles.hero}>{s.trips ? `${firstName === 'Your' ? 'Your' : `${firstName}'s`} ${s.year} in travel` : `Your ${s.year} in travel starts with one trip`}</Text>
          {s.trips ? <Text style={styles.lede}>Tap to see where the year took you.</Text> : null}
        </View>
      );
    case 'numbers':
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>YOUR YEAR IN NUMBERS</Text>
          <View style={styles.grid}>
            {([[s.trips, 'trip', 'trips'], [s.daysAway, 'day away', 'days away'], [s.cities, 'city', 'cities'], [s.countries, 'country', 'countries']] as const).map(([n, one, many]) => (
              <View key={many} style={styles.cell}>
                <CountUp value={n} animate={animate} style={styles.big} />
                <Text style={styles.cellLabel}>{n === 1 ? one : many}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    case 'map':
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>WHERE YOU WENT</Text>
          <WorldMap width={width} places={s.places} animate={animate} />
          <Text style={[styles.lede, styles.mapLine]}>{kmLine(s.km)}</Text>
        </View>
      );
    case 'records':
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>YOUR RECORDS</Text>
          {s.longestTrip ? (
            <View style={styles.record}>
              <Text style={styles.recordLabel}>Longest trip</Text>
              <Text style={styles.recordValue}>{countLabel(s.longestTrip.days, 'day', 'days')}</Text>
              <Text style={styles.recordSub} numberOfLines={2}>{s.longestTrip.title}</Text>
            </View>
          ) : null}
          {s.biggestDay ? (
            <View style={styles.record}>
              <Text style={styles.recordLabel}>Biggest day</Text>
              <Text style={styles.recordValue}>{countLabel(s.biggestDay.stops, 'stop', 'stops')}</Text>
              <Text style={styles.recordSub} numberOfLines={2}>{`Day ${s.biggestDay.dayNumber} of ${s.biggestDay.title}`}</Text>
            </View>
          ) : null}
        </View>
      );
    case 'taste': {
      const style = styleLine(s.topStyle);
      const types = typeLine(s.typeCounts);
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>WHAT YOU WERE INTO</Text>
          <Text style={styles.hero}>{style ?? 'You made every day count'}</Text>
          {types ? <Text style={styles.lede}>{types}.</Text> : null}
        </View>
      );
    }
    case 'photos':
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>YOUR BEST MOMENTS</Text>
          <View style={styles.collage}>
            {s.photos.slice(0, 6).map((u) => (
              <Image key={u} source={{ uri: u }} style={[styles.photo, { width: (width - 12) / 2, height: (width - 12) / 2 }]} contentFit="cover" />
            ))}
          </View>
        </View>
      );
    case 'companions':
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>WHO YOU TRAVELED WITH</Text>
          <View style={styles.faces}>
            {s.companions.map((c) => (
              <View key={c.uid} style={styles.face}>
                <Avatar uri={c.avatarUrl} name={c.name} size="lg" />
                <Text style={styles.faceName} numberOfLines={1}>{c.name.split(/\s+/)[0]}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    case 'next': {
      const days = s.nextTrip ? Math.max(0, Math.ceil((s.nextTrip.startMs - Date.now()) / 86_400_000)) : null;
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>COMING UP</Text>
          <Text style={styles.hero}>{s.nextTrip ? s.nextTrip.title : 'Where to next?'}</Text>
          <Text style={styles.lede}>{s.nextTrip ? (days === 0 ? 'Starts today.' : `In ${countLabel(days ?? 0, 'day', 'days')}.`) : 'Plan your next trip with Nova in a minute.'}</Text>
        </View>
      );
    }
    case 'share':
      return (
        <View style={styles.center}>
          <Text style={styles.eyebrow}>{`${firstName === 'Your' ? 'YOUR' : `${firstName.toUpperCase()}'S`} ${s.year}`}</Text>
          <View style={styles.summaryRow}>
            {([[s.trips, 'trips'], [s.cities, 'cities'], [s.countries, 'countries']] as const).map(([n, l]) => (
              <View key={l} style={styles.summaryCell}>
                <Text style={styles.summaryNum}>{n.toLocaleString('en-US')}</Text>
                <Text style={styles.cellLabel}>{l}</Text>
              </View>
            ))}
          </View>
          {s.places.length ? <WorldMap width={width} places={s.places} animate={false} /> : null}
          <Text style={[styles.lede, styles.mapLine]}>{kmLine(s.km)}</Text>
        </View>
      );
  }
});

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 18 },
  eyebrow: { color: INK.accent, fontSize: 12, fontWeight: '600', letterSpacing: 1.4 },
  hero: { color: INK.text, fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  lede: { color: INK.soft, fontSize: 17, lineHeight: 25 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 28 },
  cell: { width: '50%' },
  big: { color: INK.text, fontSize: 56, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  cellLabel: { color: INK.muted, fontSize: 15, marginTop: 2 },
  mapLine: { marginTop: 4 },
  record: { gap: 2, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(245,243,249,0.15)' },
  recordLabel: { color: INK.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.6 },
  recordValue: { color: INK.text, fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  recordSub: { color: INK.soft, fontSize: 16 },
  collage: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photo: { borderRadius: 16, backgroundColor: '#171422' },
  faces: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  face: { alignItems: 'center', gap: 6, width: 72 },
  faceName: { color: INK.soft, fontSize: 13 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCell: { flex: 1 },
  summaryNum: { color: INK.text, fontSize: 44, fontWeight: '800', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
});
