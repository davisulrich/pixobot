import {
  CameraView,
  CameraType,
  FlashMode,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Directions,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useMediaStore } from '@/lib/store/media';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';

// Note: Camera stays in mode="video" always — expo-camera v17 supports takePictureAsync
// and recordAsync regardless of mode; this eliminates session-reconfiguration timing issues.
//
// Gestures on the camera screen:
//   • Swipe left  → Conversations (chat tab)
//   • Swipe right → Profile tab
//   • Double-tap  → Flip camera (scoped to top portion only, away from shutter button)

const LONG_PRESS_MS = 250;
const { height: SCREEN_H } = Dimensions.get('window');

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0);
  const zoomBase = useSharedValue(0);
  const [isRecording, setIsRecording] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const cameraReadyRef = useRef(false);

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

  function handleCameraReady() {
    cameraReadyRef.current = true;
  }

  // ── Navigation helpers (called via runOnJS from worklet gestures) ────────────

  function goToChat() {
    router.navigate('/(app)/chat');
  }

  function goToProfile() {
    router.navigate('/(app)/profile');
  }

  function flipCamera() {
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }

  // ── Gestures ─────────────────────────────────────────────────────────────────

  // Double-tap to flip camera — scoped to the top portion of the screen so it
  // never fires over the shutter button area (bottom ~160px).
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (e.y < SCREEN_H - 160) {
        runOnJS(flipCamera)();
      }
    });

  // Fling left → chat, right → profile. Flings are fast directional swipes and
  // won't conflict with the shutter button's press-and-hold interaction.
  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => runOnJS(goToProfile)());

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => runOnJS(goToChat)());

  // Pinch to zoom — maps pinch scale to camera zoom (0–1).
  // Uses Simultaneous so it runs alongside 1-finger gestures without conflict.
  const pinchZoom = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.max(0, Math.min(1, zoomBase.value * e.scale));
      runOnJS(setZoom)(next);
    })
    .onEnd(() => {
      zoomBase.value = zoom;
    });

  // Race: the first gesture to recognize wins — flings and double-tap are
  // distinct enough in shape that they won't accidentally cancel each other.
  // Pinch runs simultaneously since it uses 2 fingers and never conflicts.
  const cameraGestures = Gesture.Simultaneous(
    pinchZoom,
    Gesture.Race(flingLeft, flingRight, doubleTap),
  );

  // ── Video recording ───────────────────────────────────────────────────────────

  async function startRecording() {
    if (!cameraRef.current || !cameraReadyRef.current || isRecordingRef.current) return;

    isRecordingRef.current = true;
    setIsRecording(true);
    pulseShutter();

    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (result?.uri) {
        handleCapture(result.uri, 'video');
      }
    } catch (e) {
      // Note: iOS Simulator cannot record video — test on a physical device.
      console.error('[camera] recordAsync failed:', e);
    } finally {
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }

  function stopRecording() {
    if (cameraRef.current && isRecordingRef.current) {
      cameraRef.current.stopRecording();
    }
  }

  // ── Photo capture ─────────────────────────────────────────────────────────────

  async function takePhoto() {
    if (!cameraRef.current || !cameraReadyRef.current) return;
    pulseShutter();
    // skipProcessing bypasses EXIF/orientation post-processing for near-instant capture
    const result = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: true });
    if (result?.uri) {
      handleCapture(result.uri, 'photo');
    }
  }

  function handleCapture(uri: string, type: 'photo' | 'video') {
    setPending(uri, type);
    router.push('/edit');
  }

  // ── Press handling ────────────────────────────────────────────────────────────

  function handlePressIn() {
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      setIsRecording(true);
      startRecording();
    }, LONG_PRESS_MS);
  }

  function handlePressOut() {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      if (!isRecordingRef.current) {
        takePhoto();
      }
    } else if (isRecordingRef.current) {
      stopRecording();
    }
  }

  function toggleFlash() {
    setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'));
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

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={cameraGestures}>
        <View style={styles.container}>
          {/* mode="video" stays constant — no switching, no timing issues */}
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={flash}
            mode="video"
            zoom={zoom}
            onCameraReady={handleCameraReady}
          />

          {/* ── Top controls ── */}
          <SafeAreaView edges={['top']} style={styles.topRow}>
            <Pressable style={styles.controlBtn} onPress={toggleFlash} hitSlop={8}>
              <FlashIcon mode={flash} />
            </Pressable>
            <Pressable style={styles.controlBtn} onPress={flipCamera} hitSlop={8}>
              <FlipIcon />
            </Pressable>
          </SafeAreaView>

          {/* ── Recording indicator — top right, below safe area ── */}
          {isRecording && (
            <View
              style={[
                styles.recordingDot,
                { top: insets.top + 8, right: spacing.lg },
              ]}
            />
          )}

          {/* ── Bottom row: chat ← shutter → profile ── */}
          <View style={styles.shutterRow}>
            {/* Left: chat / conversations */}
            <Pressable style={styles.navBtn} onPress={goToChat} hitSlop={8}>
              <ChatNavIcon />
            </Pressable>

            {/* Center: shutter (tap = photo, hold = video) */}
            <Animated.View
              style={[
                styles.shutterOuter,
                isRecording && styles.shutterRecording,
                shutterStyle,
              ]}>
              <Pressable
                style={styles.shutterInner}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}>
                <SmileyIcon />
              </Pressable>
            </Animated.View>

            {/* Right: profile */}
            <Pressable style={styles.navBtn} onPress={goToProfile} hitSlop={8}>
              <ProfileNavIcon />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function FlashIcon({ mode }: { mode: FlashMode }) {
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
          <Path
            d="M3 3L17 17"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
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

// Same paths as TabBarIcon — ensures visual consistency between camera shortcuts
// and the floating tab bar they navigate to.
function ChatNavIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path
        d="M4 4h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 4V5a1 1 0 0 1 1-1z"
        stroke="white"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ProfileNavIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Circle cx={11} cy={8} r={3.5} stroke="white" strokeWidth={1.5} />
      <Path
        d="M4 19c0-3.866 3.134-7 7-7h0c3.866 0 7 3.134 7 7"
        stroke="white"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SmileyIcon() {
  // Note: The smiley is the app's one signature illustration element per PRD §11.6.
  return (
    <Svg width={38} height={38} viewBox="0 0 38 38" fill="none">
      <Circle cx="19" cy="19" r="16" stroke="white" strokeWidth={2} />
      <Circle cx="14" cy="16" r="2.2" fill="white" />
      <Circle cx="24" cy="16" r="2.2" fill="white" />
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
    borderRadius: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Recording indicator — top right, positioned via inline style with safe area insets
  recordingDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E53935',
  },

  // Bottom row: chat ← shutter → profile
  shutterRow: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 44,
  },

  // Navigation buttons flanking the shutter — same visual style as top controls
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shutter — PRD: 72px, yellow #F5C842, centered
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
