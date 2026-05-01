import { Stack } from 'expo-router';

/**
 * App-Gruppe — eigener Stack für den Hauptscreen nach Login.
 */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0c0d10' } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
