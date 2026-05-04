import { useColorScheme } from 'react-native';
import { DarkColors, LightColors, ThemeColors } from '@/constants/colors';
import { useThemeStore, ThemeMode } from '@/stores/useThemeStore';

interface UseThemeResult {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
}

export function useTheme(): UseThemeResult {
  const { mode } = useThemeStore();
  const systemScheme = useColorScheme();

  const resolvedDark =
    mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  return {
    colors: resolvedDark ? DarkColors : LightColors,
    isDark: resolvedDark,
    mode,
  };
}
