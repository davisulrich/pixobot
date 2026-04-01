import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import '../global.css';
import { useAuthStore } from '@/lib/store/auth';

// Note: Auth gate lives at the root layout — same pattern Snapchat uses.
// Unauthenticated users are redirected to (auth) before any protected screen renders.

export default function RootLayout() {
  const { session, initialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(app)/camera');
    }
  }, [session, initialized, segments]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        {/* Edit screen sits above the tab navigator so it covers the full screen,
            and router.back() from it returns to camera — the user's confirmed preference. */}
        <Stack.Screen name="edit" options={{ animation: 'fade' }} />
        {/* send-to sits above edit in the stack — back() returns to edit */}
        <Stack.Screen name="send-to" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
