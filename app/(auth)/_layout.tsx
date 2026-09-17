import { Stack } from 'expo-router';
import { DarkColors, LightColors } from '@/constants/colors';
import { ReadingColumn } from '@/components/layout/ReadingColumn';
import { usesReadingColumn } from '@/utils/layout';

// welcome.tsx is the one deliberately-dark immersive screen left in this
// stack (Architecture Rule 3) — sign-in/sign-up/forgot-password/onboarding
// are all light editorial. A single stack-level contentStyle can't serve
// both — without the per-screen override below, the transition into/out of
// welcome shows a flash of the wrong color at the edges.
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: LightColors.background.primary },
        animation: 'slide_from_right',
      }}
      // Light surround to match the light auth screens (Rule 3 pins them).
      screenLayout={({ route, children }) =>
        usesReadingColumn('auth', route.name) ? (
          <ReadingColumn surround={LightColors.background.primary}>{children}</ReadingColumn>
        ) : (
          children
        )
      }
    >
      <Stack.Screen name="welcome" options={{ contentStyle: { backgroundColor: DarkColors.background.primary } }} />
      {/* No back button on this screen by design (see complete-profile.tsx),
          but the iOS swipe-back gesture is independent of that and would
          still pop to welcome with the user left signed in. */}
      <Stack.Screen name="complete-profile" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
