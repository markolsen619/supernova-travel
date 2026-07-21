import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Check } from 'phosphor-react-native';
import { BorderRadius } from '@/constants/spacing';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import type { PhosphorIcon } from '@/constants/icons';

interface StopStateBubbleProps {
  Icon: PhosphorIcon;
  color: string;
  visited: boolean;
  /** The trip's next not-yet-visited stop — "you are here". */
  isCurrent?: boolean;
  /** Omit for viewers — the bubble is inert (no toggle affordance) without it. */
  onToggle?: () => void;
  bubbleSize?: number;
  iconSize?: number;
  /** The check badge is a "cutout" ring in the surface color behind it —
   * pass whatever background the bubble is rendered on (card vs. map sheet). */
  surfaceColor: string;
}

/**
 * The three-state stop indicator (TM-2b), shared by the timeline row
 * (ActivityItem) and the map's selected-stop card — one visual language,
 * one place it can drift. Planned = TypeIconBubble's existing tinted look
 * (unchanged); current = the same tint plus a ring; visited = solid fill +
 * a check badge. Tap toggles visited when `onToggle` is provided.
 */
export function StopStateBubble({
  Icon,
  color,
  visited,
  isCurrent = false,
  onToggle,
  bubbleSize = 36,
  iconSize = 20,
  surfaceColor,
}: StopStateBubbleProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={!onToggle}
      hitSlop={6}
      activeOpacity={onToggle ? 0.7 : 1}
      style={
        isCurrent && !visited
          ? { borderWidth: 2, borderColor: color, borderRadius: BorderRadius.md + 3, padding: 2 }
          : undefined
      }
      accessibilityLabel={onToggle ? (visited ? 'Mark not visited' : 'Mark visited') : undefined}
    >
      {visited ? (
        <View style={[styles.visitedBubble, { width: bubbleSize, height: bubbleSize, backgroundColor: color }]}>
          <Icon size={iconSize} color="#ffffff" weight="fill" />
          <View style={[styles.checkBadge, { backgroundColor: color, borderColor: surfaceColor }]}>
            <Check size={9} color="#ffffff" weight="bold" />
          </View>
        </View>
      ) : (
        <TypeIconBubble Icon={Icon} color={color} bubbleSize={bubbleSize} iconSize={iconSize} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  visitedBubble: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
