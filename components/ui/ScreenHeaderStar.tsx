import { StyleProp, ImageStyle } from 'react-native';
import { StarMark } from '@/components/ui/StarMark';

/**
 * The one size for the brand star mark next to a screen title (Explore,
 * Profile, …). A single exported constant + wrapper component — not a
 * `size={N}` literal typed independently on each screen — so the two marks
 * can't silently drift apart again the way they did before.
 */
export const HEADER_STAR_SIZE = 40;

export function ScreenHeaderStar({ style }: { style?: StyleProp<ImageStyle> }) {
  return <StarMark size={HEADER_STAR_SIZE} style={style} />;
}
