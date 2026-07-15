import { Stack } from 'expo-router';
import { DarkColors, LightColors } from '@/constants/colors';

// welcome.tsx and onboarding.tsx are the two deliberately-dark immersive
// screens in this stack (Architecture Rule 3); sign-in/sign-up/forgot-password
// are light editorial. A single stack-level contentStyle can't serve both —
// without a per-screen override here, the transition between a dark and a
// light screen in this stack shows a flash of the wrong color at the edges.
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: LightColors.background.primary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" options={{ contentStyle: { backgroundColor: DarkColors.background.primary } }} />
      <Stack.Screen name="onboarding" options={{ contentStyle: { backgroundColor: DarkColors.background.primary } }} />
    </Stack>
  );
}
