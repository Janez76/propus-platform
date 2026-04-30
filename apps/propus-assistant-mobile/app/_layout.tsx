/**
 * Root-Layout — Auth-Gate + Stack.
 */

import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { hasAuthToken } from '../lib/api';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const authed = await hasAuthToken();
      const inAuthGroup = segments[0] === '(auth)';
      if (!authed && !inAuthGroup) router.replace('/(auth)/login');
      else if (authed && inAuthGroup) router.replace('/(app)');
      setReady(true);
    })();
  }, [segments]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(app)/index" />
      </Stack>
    </>
  );
}
