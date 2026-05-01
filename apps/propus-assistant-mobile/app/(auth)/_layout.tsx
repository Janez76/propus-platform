import { Stack } from 'expo-router';

/**
 * Auth-Gruppe — eigener Stack, damit beim Root-Stack-Mount die Slot-Hierarchie
 * stabil bleibt (vermeidet leere Screens auf Android-Release).
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0c0d10' } }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
