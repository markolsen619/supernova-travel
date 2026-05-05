import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import { FontSize } from '@/constants/typography';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

function TabIcon({ focused, icon, label }: { focused: boolean; icon: string; label: string }) {
  const scale = useSharedValue(focused ? 1.12 : 1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.12 : 1, { damping: 12, stiffness: 180 });
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.tabItem, focused && styles.tabItemFocused, animStyle]}>
      <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
    </Animated.View>
  );
}

function CreateIcon({ focused }: { focused: boolean }) {
  const scale = useSharedValue(focused ? 1.08 : 1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.08 : 1, { damping: 12, stiffness: 180 });
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.createButton, animStyle]}>
      <Text style={styles.createIcon}>+</Text>
    </Animated.View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.tabBarAndroid]} />
          ),
        tabBarShowLabel: false,
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="⚡" label="Feed" />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="🔭" label="Explore" />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarIcon: ({ focused }) => <CreateIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="🔍" label="Search" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="👤" label="Profile" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: 'rgba(167,139,250,0.2)',
    backgroundColor: 'transparent',
    elevation: 0,
    height: Platform.OS === 'ios' ? 85 : 65,
  },
  tabBarAndroid: {
    backgroundColor: 'rgba(10,10,26,0.95)',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 8,
  },
  tabItemFocused: {},
  tabIcon: {
    fontSize: 20,
    opacity: 0.5,
  },
  tabIconFocused: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: FontSize.xs,
    color: Colors.text.tertiary,
  },
  tabLabelFocused: {
    color: Colors.brand.purple,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.brand.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: Colors.brand.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  createIcon: {
    fontSize: 28,
    color: Colors.white,
    lineHeight: 32,
    fontWeight: '300',
  },
});
