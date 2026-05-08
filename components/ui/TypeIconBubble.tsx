import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BorderRadius } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

interface TypeIconBubbleProps {
  Icon: PhosphorIcon;
  color: string;
  bubbleSize?: number;
  iconSize?: number;
}

export function TypeIconBubble({ Icon, color, bubbleSize = 36, iconSize = 20 }: TypeIconBubbleProps) {
  return (
    <View
      style={[
        styles.bubble,
        {
          width: bubbleSize,
          height: bubbleSize,
          backgroundColor: `${color}26`,
        },
      ]}
    >
      <Icon size={iconSize} color={color} weight="duotone" />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
