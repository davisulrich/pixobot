import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { updatePresence } from '../presence';

// Pings Redis whenever the app comes to the foreground.
// The key expires automatically after 5 minutes of inactivity,
// so no cleanup is needed when the app goes to the background.
export function usePresencePing(userId: string | undefined) {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!userId) return;

    // Ping immediately on mount (covers app open and login)
    updatePresence(userId);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      if (wasBackground && nextState === 'active') {
        updatePresence(userId);
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [userId]);
}
