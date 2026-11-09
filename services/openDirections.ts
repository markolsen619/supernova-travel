/** Open in Maps: iPhone asks Apple Maps or Google Maps; Android goes to Google Maps (utils/directions). */
import { ActionSheetIOS, Linking, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { appleMapsUrl, googleMapsUrl } from '@/utils/directions';

export function openDirections(t: { name: string; lat: number; lng: number; placeId?: string | null }): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (Platform.OS !== 'ios') { Linking.openURL(googleMapsUrl(t)).catch(() => {}); return; }
  ActionSheetIOS.showActionSheetWithOptions(
    { title: `Directions to ${t.name}`, options: ['Apple Maps', 'Google Maps', 'Cancel'], cancelButtonIndex: 2 },
    (i) => {
      if (i === 0) Linking.openURL(appleMapsUrl(t)).catch(() => {});
      if (i === 1) Linking.openURL(googleMapsUrl(t)).catch(() => {});
    },
  );
}
