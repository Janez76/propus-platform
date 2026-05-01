/**
 * Root-Layout — Auth-Gate + Stack.
 *
 * Wichtig: <Stack> immer mounten, damit expo-router navigieren kann.
 * Auth-Check läuft parallel und triggert router.replace, sobald der
 * Navigator bereit ist. Der Splash bleibt sichtbar, bis wir wissen,
 * wohin geroutet wird — sonst weißer Blitz auf Android-Release-APK.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { hasAuthToken } from '../lib/api';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result = false;
      try {
        result = await hasAuthToken();
      } catch {
        result = false;
      }
      if (cancelled) return;
      setAuthed(result);
      setAuthChecked(true);
      SplashScreen.hideAsync().catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!authed && !inAuthGroup) router.replace('/(auth)/login');
    else if (authed && inAuthGroup) router.replace('/(app)');
  }, [authChecked, authed, segments]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0c0d10' }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0c0d10' } }}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(app)/index" />
      </Stack>
    </View>
  );
}
