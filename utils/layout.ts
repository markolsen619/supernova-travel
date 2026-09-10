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

/** Cards per row. 2 on phones — today's behaviour, unchanged. */
export function gridColumnsFor(width: number, height: number): number {
  return isLargeScreen(width, height) ? 3 : 2;
}

/** Max measure for reading surfaces. null on phones = no constraint. */
export function contentMaxWidth(width: number, height: number): number | null {
  return isLargeScreen(width, height) ? 700 : null;
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
