import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMediaStore } from '@/lib/store/media';
import { colors, fontSize, fontWeight, radius } from '@/tokens';

// Placeholder — Edit + Send screen will be built in the next iteration.
// On mount, reads pendingUri/pendingType from the media store.
// On dismiss, clears the store and goes back to camera.

export default function EditScreen() {
  const router = useRouter();
  const { pendingUri, pendingType, clearPending } = useMediaStore();

  function dismiss() {
    clearPending();
    router.back();
  }

  // Safety: if we somehow land here without media, go back immediately.
  useEffect(() => {
    if (!pendingUri) router.back();
  }, []);

  return (
    <View style={styles.container}>
      <Pressable style={styles.dismiss} onPress={dismiss} hitSlop={12}>
        <Text style={styles.dismissText}>×</Text>
      </Pressable>

      <View style={styles.center}>
        <Text style={styles.label}>{pendingType === 'video' ? 'VIDEO' : 'PHOTO'} CAPTURED</Text>
        <Text style={styles.sub}>Edit + Send coming next</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  dismiss: {
    position: 'absolute',
    top: 64,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  dismissText: {
    fontSize: 24,
    color: '#fff',
    lineHeight: 28,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.label,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2,
  },
  sub: {
    fontSize: fontSize.caption,
    color: 'rgba(255,255,255,0.3)',
  },
});
