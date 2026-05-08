import { useRef, useState, useEffect, useCallback } from 'react';
import { Tabs } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontSize } from '@/constants/typography';
import { TAB_ICONS } from '@/constants/icons';

const PURPLE = '#a78bfa';
const PINK = '#f472b6';
const PILL_HEIGHT = 68;
const SPRING = { damping: 18, stiffness: 220, mass: 0.8, useNativeDriver: true } as const;

const TABS = [
  { name: 'index',   label: 'Feed'    },
  { name: 'explore', label: 'Explore' },
  { name: 'create',  label: ''        },
  { name: 'search',  label: 'Search'  },
  { name: 'profile', label: 'Profile' },
] as const;

interface TabBarProps {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: {
    emit: (e: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

function FloatingTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [pillWidth, setPillWidth] = useState(0);
  const tabSlotWidth = pillWidth > 0 ? pillWidth / TABS.length : 0;

  const indicatorX = useRef(new Animated.Value(0)).current;
  const createScale = useRef(new Animated.Value(1.0)).current;
  const scales = useRef(TABS.map((_, i) => new Animated.Value(i === 0 ? 1.15 : 1.0))).current;
  const labelOpacities = useRef(TABS.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const labelYs = useRef(TABS.map((_, i) => new Animated.Value(i === 0 ? 0 : 6))).current;

  useEffect(() => {
    if (tabSlotWidth > 0 && state.index !== 2) {
      Animated.spring(indicatorX, { ...SPRING, toValue: tabSlotWidth * state.index + 5 }).start();
    }
    Animated.spring(createScale, { ...SPRING, toValue: state.index === 2 ? 1.1 : 1.0 }).start();
    TABS.forEach((_, i) => {
      const focused = i === state.index;
      Animated.spring(scales[i], { ...SPRING, toValue: focused ? 1.15 : 1.0 }).start();
      Animated.spring(labelOpacities[i], { ...SPRING, toValue: focused ? 1 : 0 }).start();
      Animated.spring(labelYs[i], { ...SPRING, toValue: focused ? 0 : 5 }).start();
    });
  }, [state.index, tabSlotWidth]);

  const handlePress = useCallback(
    (route: TabBarProps['state']['routes'][number], index: number) => {
      Haptics.impactAsync(
        index === 2 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      );
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    },
    [navigation],
  );

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setPillWidth(e.nativeEvent.layout.width);
  }, []);

  const indicatorWidth = tabSlotWidth > 10 ? tabSlotWidth - 10 : 0;

  return (
    <View style={[styles.outerContainer, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
      <View style={styles.pill} onLayout={handleLayout}>
        {/* Glassmorphic background — clipped separately so create button can overflow */}
        <View style={styles.blurClip}>
          <View style={[StyleSheet.absoluteFill, styles.pillBase]} />
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        </View>

        {/* Sliding active indicator */}
        {state.index !== 2 && pillWidth > 0 && (
          <Animated.View
            style={[
              styles.indicator,
              { width: indicatorWidth, transform: [{ translateX: indicatorX }] },
            ]}
          />
        )}

        {/* Tab slots */}
        {state.routes.map((route, index) => {
          const isCreate = index === 2;
          const focused = state.index === index;

          if (isCreate) {
            return (
              <TouchableOpacity
                key={route.key}
                style={styles.tabSlot}
                onPress={() => handlePress(route, index)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Create trip"
              >
                <Animated.View
                  style={[styles.createWrapper, { transform: [{ scale: createScale }] }]}
                >
                  <LinearGradient
                    colors={[PURPLE, PINK] as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.createGradient}
                  >
                    <Text style={styles.createPlus}>+</Text>
                  </LinearGradient>
                </Animated.View>
              </TouchableOpacity>
            );
          }

          const tab = TABS[index];
          const TabIcon = TAB_ICONS[route.name];
          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabSlot}
              onPress={() => handlePress(route, index)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <Animated.View style={[styles.tabContent, { transform: [{ scale: scales[index] }] }]}>
                {TabIcon && (
                  <TabIcon
                    size={22}
                    color={focused ? PURPLE : 'rgba(255,255,255,0.35)'}
                    weight="duotone"
                  />
                )}
                <Animated.Text
                  style={[
                    styles.tabLabel,
                    {
                      opacity: labelOpacities[index],
                      transform: [{ translateY: labelYs[index] }],
                    },
                  ]}
                >
                  {tab.label}
                </Animated.Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...(props as unknown as TabBarProps)} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  pill: {
    height: PILL_HEIGHT,
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.28)',
    overflow: 'visible',
  },
  blurClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 34,
    overflow: 'hidden',
  },
  pillBase: {
    backgroundColor: 'rgba(8, 5, 22, 0.88)',
  },
  indicator: {
    position: 'absolute',
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(167,139,250,0.18)',
    top: (PILL_HEIGHT - 44) / 2,
    left: 0,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  tabSlot: {
    flex: 1,
    height: PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: FontSize.xs,
    color: PURPLE,
    fontWeight: '600',
  },
  createWrapper: {
    marginBottom: 22,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 12,
  },
  createGradient: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPlus: {
    fontSize: 28,
    color: '#ffffff',
    lineHeight: 32,
    fontWeight: '300',
  },
});
