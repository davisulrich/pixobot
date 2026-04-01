import {
  CameraView,
  CameraType,
  FlashMode,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useMediaStore } from '@/lib/store/media';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';

// Note: Snapchat keeps camera in 'picture' mode by default and switches to 'video'
// mode on long-press detection. We use a 250ms timer: short press → photo,
// long press → mode switch then recordAsync. This matches the Snapchat interaction model.

const LONG_PRESS_MS = 250;

export default function CameraScreen() {
  const router = useRouter();
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVideoRef = useRef(false); // true when mode switch triggered, waiting to record
  const isRecordingRef = useRef(false);  // mirror of isRecording for use inside callbacks

  const setPending = useMediaStore((s) => s.setPending);

  // Shutter scale pulse — PRD: 0.92 → 1.0, 120ms total
  const shutterScale = useSharedValue(1);
  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  function pulseShutter() {
    shutterScale.value = withSequence(
      withTiming(0.92, { duration: 60 }),
      withTiming(1.0, { duration: 60 }),
    );
  }

  // Start video recording after mode has been switched to 'video'
  useEffect(() => {
    if (cameraMode === 'video' && pendingVideoRef.current && cameraReady) {
      pendingVideoRef.current = false;
      startRecording();
    }
  }, [cameraMode, cameraReady]);

  async function startRecording() {
    if (!cameraRef.current || isRecordingRef.current) return;
    isRecordingRef.current = true;
    setIsRecording(true);
    pulseShutter();

    try {
      // Note: recordAsync resolves only when stopRecording() is called.
      // The returned uri is then passed to the edit screen.
      const result = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (result?.uri) {
        handleCapture(result.uri, 'video');
      }
    } catch {
      // Recording was cancelled or failed — reset silently
    } finally {
      isRecordingRef.current = false;
      setIsRecording(false);
      setCameraMode('picture');
    }
  }

  function stopRecording() {
    if (cameraRef.current && isRecordingRef.current) {
      cameraRef.current.stopRecording();
    }
  }

  async function takePhoto() {
    if (!cameraRef.current || !cameraReady) return;
    pulseShutter();

    const result = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (result?.uri) {
      handleCapture(result.uri, 'photo');
    }
  }

  function handleCapture(uri: string, type: 'photo' | 'video') {
    setPending(uri, type);
    router.push('/edit');
  }

  function handlePressIn() {
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      // Long press threshold reached — switch to video mode and record
      pendingVideoRef.current = true;
      setCameraMode('video');
    }, LONG_PRESS_MS);
  }

  function handlePressOut() {
    if (pressTimerRef.current !== null) {
      // Released before long-press threshold — it's a photo tap
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      if (!isRecordingRef.current) {
        takePhoto();
      }
    } else if (isRecordingRef.current) {
      // Released after recording started — stop video
      stopRecording();
    }
  }

  function toggleFlash() {
    setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'));
  }

  function flipCamera() {
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }

  // ─── Permissions ─────────────────────────────────────────────────────────────

  if (!camPermission || !micPermission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!camPermission.granted || !micPermission.granted) {
    return (
      <SafeAreaView style={styles.permissionsContainer}>
        <View style={styles.permissionsInner}>
          <Text style={styles.permTitle}>Camera access needed</Text>
          <Text style={styles.permBody}>
            Pixobot needs camera and microphone access to capture photos and videos.
          </Text>
          <Pressable
            style={styles.permButton}
            onPress={() => {
              if (!camPermission.granted) requestCamPermission();
              if (!micPermission.granted) requestMicPermission();
            }}>
            <Text style={styles.permButtonText}>Grant Access</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Camera UI ───────────────────────────────────────────────────────────────

  const flashIcon = flash === 'on' ? '⚡' : flash === 'auto' ? 'A' : '✕';

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        mode={cameraMode}
        onCameraReady={() => setCameraReady(true)}
      />

      {/* ── Top controls ── */}
      <SafeAreaView edges={['top']} style={styles.topRow}>
        {/* Flash toggle */}
        <Pressable style={styles.controlBtn} onPress={toggleFlash} hitSlop={8}>
          <FlashIcon mode={flash} />
        </Pressable>

        {/* Flip camera */}
        <Pressable style={styles.controlBtn} onPress={flipCamera} hitSlop={8}>
          <FlipIcon />
        </Pressable>
      </SafeAreaView>

      {/* ── Recording indicator ── */}
      {isRecording && (
        <View style={styles.recordingDot} />
      )}

      {/* ── Shutter button ── */}
      <View style={styles.shutterRow}>
        <Animated.View style={[styles.shutterOuter, isRecording && styles.shutterRecording, shutterStyle]}>
          <Pressable
            style={styles.shutterInner}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}>
            <SmileyIcon />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function FlashIcon({ mode }: { mode: FlashMode }) {
  // Lightning bolt for on/auto, crossed bolt for off
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      {mode !== 'off' ? (
        <Path
          d="M11 2L4 11h6l-1 7 7-9h-6l1-7z"
          stroke="white"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <>
          <Path
            d="M11 2L4 11h6l-1 7 7-9h-6l1-7z"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path d="M3 3L17 17" stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

function FlipIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path
        d="M4 8a7 7 0 0 1 13.5-2M4 8H8M4 8V4"
        stroke="white"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 14a7 7 0 0 1-13.5 2M18 14h-4m4 0v4"
        stroke="white"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SmileyIcon() {
  // Note: The smiley is the app's one signature illustration element per PRD §11.6.
  // Kept warm and simple — two dot eyes, gentle arc smile.
  return (
    <Svg width={38} height={38} viewBox="0 0 38 38" fill="none">
      {/* Face outline */}
      <Circle cx="19" cy="19" r="16" stroke="white" strokeWidth={2} />
      {/* Eyes */}
      <Circle cx="14" cy="16" r="2.2" fill="white" />
      <Circle cx="24" cy="16" r="2.2" fill="white" />
      {/* Smile */}
      <Path
        d="M13 24 Q19 30 25 24"
        stroke="white"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Permissions screen
  permissionsContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  permissionsInner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    gap: spacing.md,
  },
  permTitle: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
  },
  permBody: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    lineHeight: fontSize.body * 1.5,
  },
  permButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  permButtonText: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.headline,
    color: colors.accentDark,
  },

  // Top controls — PRD: 40px diameter, rgba(0,0,0,0.45), white icons
  topRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Recording dot indicator
  recordingDot: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E53935',
  },

  // Shutter — PRD: 72px, yellow #F5C842, centered at bottom
  shutterRow: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRecording: {
    borderWidth: 3,
    borderColor: '#E53935',
  },
  shutterInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
  },
});
