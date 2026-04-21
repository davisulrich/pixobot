import { useEffect } from 'react';
import { setAudioModeAsync } from 'expo-audio';

// Configure the iOS audio session so background music (Spotify, Apple Music, etc.)
// keeps playing when the app opens. The camera will still take exclusive control
// when the user holds to record video — that's intentional (same as Snapchat).
export function useAudioSession() {
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: false,
      // Mix with background audio instead of interrupting it
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {
      // Non-critical — silently ignore if unavailable (e.g. Android)
    });
  }, []);
}
