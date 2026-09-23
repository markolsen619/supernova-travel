import { Spacing } from '@/constants/spacing';

export interface Size {
  width: number;
  height: number;
}

/**
 * Adaptive layouts begin at this size.
 *
 * Keyed on the SMALLER dimension, not width. The iPhone Duo's folded outer
 * screen is ~466pt wide — wider than any iPhone ever shipped, and 36pt wider
 * than a Pro Max — but it is a one-handed phone posture and must not get a
 * tablet layout. Using min() also survives portrait lock being lifted later,
 * since a device classifies the same way in either orientation.
 *
 * Margins: folded Duo 84pt below, unfolded 76pt above. The point dimensions
 * are inferred from an assumed 3x scale factor rather than published, so the
 * margin is deliberate.
 */
export const LARGE_SCREEN_MIN = 550;

export function isLargeScreen(width: number, height: number): boolean {
  return Math.min(width, height) >= LARGE_SCREEN_MIN;
}

/**
 * Width of one card in a two-up row with screen gutters and a single gap.
 * This exact expression was duplicated in three files (TripGrid, TrendingCard,
 * explore.tsx twice) — including a live hazard where TrendingCard computed its
 * own width while explore.tsx computed a matching one for the skeleton, so the
 * two agreed only by copy-paste.
 */
export function twoColumnWidth(width: number): number {
  return (width - Spacing['6'] * 2 - Spacing['3']) / 2;
}

/** Edge-to-edge three-up gallery cell. Was duplicated in profile.tsx and PostsGrid. */
export function thirdWidth(width: number): number {
  return Math.floor(width / 3);
}

/**
 * Width at which a large screen gets its widest grids: every iPad in
 * landscape, and a 13" iPad in portrait. Below it (iPad portrait, the
 * unfolded Duo) a card at 4-up would drop under ~180pt.
 */
export const WIDE_SCREEN_MIN = 1000;

/**
 * Cards per row. 2 on phones — today's behaviour, unchanged. 3 on large
 * screens, 4 once they're wide. iPad rotates even though phones are
 * portrait-locked (iPad multitasking requires every orientation), so a
 * landscape iPad is a real case, not a hypothetical.
 */
export function gridColumnsFor(width: number, height: number): number {
  if (!isLargeScreen(width, height)) return 2;
  return width >= WIDE_SCREEN_MIN ? 4 : 3;
}

/**
 * Width of one card in an N-up row with screen gutters and a gap between
 * cards. At 2 columns this is exactly twoColumnWidth().
 */
export function columnWidth(width: number, columns: number): number {
  return (width - Spacing['6'] * 2 - Spacing['3'] * (columns - 1)) / columns;
}

/**
 * Columns for a list of full trip cards (profile Trips and Saved). 1 on phones,
 * unchanged; a single card would otherwise be ~800pt wide on an iPad.
 */
export function cardListColumnsFor(width: number, height: number): number {
  if (!isLargeScreen(width, height)) return 1;
  return width >= WIDE_SCREEN_MIN ? 3 : 2;
}

/** Edge-to-edge gallery cells per row (profile posts). 3 on phones, unchanged. */
export function galleryColumnsFor(width: number, height: number): number {
  if (!isLargeScreen(width, height)) return 3;
  return width >= WIDE_SCREEN_MIN ? 5 : 4;
}

/** Edge-to-edge gallery cell. At 3 columns this is exactly thirdWidth(). */
export function galleryCellWidth(width: number, columns: number): number {
  return Math.floor(width / columns);
}

/**
 * Width of the feed's photo card: always the full window width.
 *
 * This used to cap large screens at a centred 9:16 column, on the reasoning
 * that a full-bleed card "crops photos hard" on a squarer canvas. That holds
 * only for 9:16 media. `FeedCard` fits with `cover`, so the crop is whatever
 * the card's aspect differs from the photo's — and real travel photography is
 * mostly 4:3 landscape, which the narrow column punished worst. On a 12.9"
 * iPad (1024x1366) a 4:3 photo lost 58% of its width in the 9:16 column
 * versus 44% at full bleed, and the leftover 128pt gutters rendered pure
 * black on an otherwise light, warm app.
 *
 * The trade is explicit: 9:16 media now crops ~25% of its height on an iPad
 * instead of fitting exactly. Landscape stills win, vertical video loses a
 * little. Revisit together with `cover` if the feed ever leads with video.
 */
export function feedColumnWidth(width: number, _height: number): number {
  return width;
}

/** Max measure for reading surfaces. null on phones = no constraint. */
export function contentMaxWidth(width: number, height: number): number | null {
  return isLargeScreen(width, height) ? 700 : null;
}

/**
 * Style for a centred reading column. Empty on phones, so applying it changes
 * nothing there; on large screens it caps the width at the reading measure.
 */
export function contentColumnStyle(
  maxWidth: number | null,
): { width?: '100%'; maxWidth?: number; alignSelf?: 'center' } {
  if (maxWidth === null) return {};
  return { width: '100%', maxWidth, alignSelf: 'center' };
}

/**
 * Routes whose screens sit in a centred reading column on large screens.
 * Applied per navigator through screenLayout, so a screen never has to know
 * (components/layout/ReadingColumn.tsx). Named by navigator because route
 * names are only unique within one.
 *
 * Deliberately left full-width:
 * - the feed, Explore, and profiles, whose grids and columns adapt themselves
 * - the globe and AI-generating screens, which are immersive by design
 * - welcome and onboarding, the dark full-bleed entry screens
 * - modal routes, which iOS already presents as a ~700pt sheet on iPad
 */
const READING_COLUMN_ROUTES: Record<'root' | 'auth' | 'tabs', ReadonlySet<string>> = {
  root: new Set(['notifications', 'messages/[threadId]', '(wallet)']),
  auth: new Set(['sign-in', 'sign-up', 'forgot-password', 'complete-profile']),
  tabs: new Set(['create']),
};

export function usesReadingColumn(navigator: 'root' | 'auth' | 'tabs', routeName: string): boolean {
  return READING_COLUMN_ROUTES[navigator].has(routeName);
}

export function didSizeChange(a: Size, b: Size): boolean {
  return a.width !== b.width || a.height !== b.height;
}

/**
 * True when a resize moves across the threshold in either direction — i.e. the
 * layout STRUCTURE changes, not merely its measurements. A fold is not just
 * "bigger": Part B turns a toggle into a split view at this boundary.
 */
export function crossedBreakpoint(prev: Size, next: Size): boolean {
  return isLargeScreen(prev.width, prev.height) !== isLargeScreen(next.width, next.height);
}
