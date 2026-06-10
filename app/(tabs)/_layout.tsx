import { useRef, useEffect, useCallback } from 'react';
import { Tabs } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { TAB_ICONS } from '@/constants/icons';
import { TAB_BAR_HEIGHT } from '@/constants/layout';

const PURPLE = '#a78bfa';
const PINK = '#f472b6';
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

function FullWidthTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  const createScale = useRef(new Animated.Value(1.0)).current;
  const scales = useRef(TABS.map((_, i) => new Animated.Value(i === 0 ? 1.1 : 1.0))).current;

  useEffect(() => {
    Animated.spring(createScale, { ...SPRING, toValue: state.index === 2 ? 1.08 : 1.0 }).start();
    TABS.forEach((_, i) => {
      Animated.spring(scales[i], { ...SPRING, toValue: i === state.index ? 1.1 : 1.0 }).start();
    });
  }, [state.index]);

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

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.hairline} />
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.bgOverlay]} />

      <View style={styles.row}>
        {state.routes.map((route, index) => {
          if (index === 2) {
            return (
              <TouchableOpacity
                key={route.key}
                style={styles.tabSlot}
                onPress={() => handlePress(route, index)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Create"
              >
                <Animated.View style={[styles.createWrapper, { transform: [{ scale: createScale }] }]}>
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

          const focused = state.index === index;
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
              <Animated.View style={{ transform: [{ scale: scales[index] }] }}>
                {TabIcon && (
                  <TabIcon
                    size={24}
                    color={focused ? PURPLE : 'rgba(255,255,255,0.35)'}
                    weight="duotone"
                  />
                )}
              </Animated.View>
              {focused && <View style={styles.activeDot} />}
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
      tabBar={(props) => <FullWidthTabBar {...(props as unknown as TabBarProps)} />}
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
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bgOverlay: {
    backgroundColor: 'rgba(5,3,15,0.88)',
  },
  row: {
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabSlot: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  activeDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: PURPLE,
  },
  createWrapper: {
    marginBottom: 10,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  createGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPlus: {
    fontSize: 26,
    color: '#ffffff',
    lineHeight: 30,
    fontWeight: '300',
  },
});
