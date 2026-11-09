/** "☀ 24° / 16°" with a Phosphor icon for a city on a date, when Open-Meteo has that day (≤ 16 days ahead). */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useForecast } from '@/hooks/useForecast';
import { tempLabel, usesFahrenheit, type WeatherKind } from '@/utils/weather';
import { FontSize, FontWeight } from '@/constants/typography';

const ICONS: Record<WeatherKind, typeof Sun> = { sun: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: Snowflake, storm: CloudLightning };
const WORDS: Record<WeatherKind, string> = { sun: 'Sunny', partly: 'Partly cloudy', cloud: 'Cloudy', fog: 'Fog', rain: 'Rain', snow: 'Snow', storm: 'Storms' };
const fahrenheit = usesFahrenheit(Intl.DateTimeFormat().resolvedOptions().locale ?? 'en');

export const DayWeatherBadge = memo(function DayWeatherBadge({ lat, lng, date, color }: { lat: number | null | undefined; lng: number | null | undefined; date: string | null; color?: string }) {
  const { colors } = useTheme();
  const { data } = useForecast(date ? lat : null, date ? lng : null);
  const w = date ? data?.[date] : undefined;
  if (!w) return null;
  const Icon = ICONS[w.kind];
  const c = color ?? colors.text.secondary;
  const label = tempLabel(w, fahrenheit);
  return (
    <View style={styles.row} accessible accessibilityLabel={`${WORDS[w.kind]}, ${label.replace(' / ', ' high, ')} low`}>
      <Icon size={14} color={c} weight="duotone" />
      <Text style={[styles.text, { color: c }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
