import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMediaStore } from '@/lib/store/media';
import { colors, fontSize, radius, spacing } from '@/tokens';

// Note: Snapchat's edit screen is a layered compositor:
//   1. Full-bleed media (photo or looping video)
//   2. SVG drawing layer (paths captured via Pan gesture)
//   3. Draggable/pinch-resizable text boxes
//   4. UI chrome (dismiss, toolbar, send, disappear indicator)
// We follow the same layering order so gestures fall through correctly.

// Note: Drawing paths must never read a JS ref (useRef) from inside a Reanimated
// worklet — doing so causes a native crash ("unexpectedData ...PatternFunction").
// Instead we use a Reanimated shared value (useSharedValue) to accumulate the SVG
// path string on the UI thread, and only pass primitives to runOnJS callbacks.

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type DrawPath = { d: string; color: string };
type TextBox = { id: string; text: string; x: number; y: number; scale: number };
type ActiveMode = 'none' | 'draw' | 'text';

// ─── Draggable text box ───────────────────────────────────────────────────────

function DraggableTextBox({
  box,
  onMove,
  onScale,
  onChangeText,
  onDelete,
}: {
  box: TextBox;
  onMove: (id: string, x: number, y: number) => void;
  onScale: (id: string, scale: number) => void;
  onChangeText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const translateX = useSharedValue(box.x);
  const translateY = useSharedValue(box.y);
  const pinchScale = useSharedValue(box.scale);
  const savedScale = useSharedValue(box.scale);

  useEffect(() => {
    translateX.value = box.x;
    translateY.value = box.y;
  }, [box.x, box.y]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = box.x + e.translationX;
      translateY.value = box.y + e.translationY;
    })
    .onEnd(() => {
      runOnJS(onMove)(box.id, translateX.value, translateY.value);
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      pinchScale.value = Math.max(0.5, Math.min(3, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = pinchScale.value;
      runOnJS(onScale)(box.id, pinchScale.value);
    });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: pinchScale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.textBox, animStyle]}>
        <TextInput
          style={styles.textBoxInput}
          value={box.text}
          onChangeText={(t) => onChangeText(box.id, t)}
          onBlur={() => {
            // Delete the box if the user dismissed without typing anything
            if (!box.text.trim()) {
              onDelete(box.id);
            }
          }}
          multiline
          placeholder="Type something…"
          placeholderTextColor="rgba(255,255,255,0.45)"
          autoFocus
          blurOnSubmit
          returnKeyType="done"
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function EditScreen() {
  const router = useRouter();
  const { pendingUri, pendingType, clearPending } = useMediaStore();

  const [activeMode, setActiveMode] = useState<ActiveMode>('none');
  const [drawColor, setDrawColor] = useState<'#000000' | '#FFFFFF'>('#000000');
  const [completedPaths, setCompletedPaths] = useState<DrawPath[]>([]);
  const [currentPathD, setCurrentPathD] = useState('');
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);

  // Note: currentPathShared lives on the UI thread so it's safe to read/write
  // from inside Reanimated worklets without any runOnJS bridge.
  const currentPathShared = useSharedValue('');

  // Note: expo-video requires a player instance even when showing a photo.
  // We pass null source for photos so the player stays inert.
  const videoPlayer = useVideoPlayer(
    pendingType === 'video' && pendingUri ? pendingUri : null,
    (player) => {
      player.loop = true;
      player.muted = true;
      player.play();
    },
  );

  useEffect(() => {
    if (!pendingUri) router.back();
  }, []);

  function dismiss() {
    clearPending();
    router.back();
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  // Called via runOnJS — receives the live path string as a primitive from the
  // UI thread so React state stays in sync for the in-progress stroke.
  function syncCurrentPath(d: string) {
    setCurrentPathD(d);
  }

  // Called via runOnJS at stroke end — receives the completed path as a primitive.
  function commitPath(d: string, color: string) {
    if (d) {
      setCompletedPaths((prev) => [...prev, { d, color }]);
    }
    setCurrentPathD('');
  }

  // drawColor is captured at gesture-creation time; re-create gesture when it changes
  // so committed paths get the current color. (drawColor changes are infrequent.)
  const drawPan = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => {
      // Safe: writing to a shared value from a worklet is always allowed
      currentPathShared.value = `M ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      runOnJS(syncCurrentPath)(currentPathShared.value);
    })
    .onUpdate((e) => {
      // Safe: reading currentPathShared.value (a shared value) in a worklet is fine
      currentPathShared.value =
        currentPathShared.value + ` L ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      runOnJS(syncCurrentPath)(currentPathShared.value);
    })
    .onEnd(() => {
      // Pass finished path string + color as primitives — no JS ref reads in worklet
      runOnJS(commitPath)(currentPathShared.value, drawColor);
      currentPathShared.value = '';
    });

  // ── Text tap (creates a new box at tap location) ──────────────────────────

  function addTextBox(x: number, y: number) {
    const id = Date.now().toString();
    setTextBoxes((prev) => [
      ...prev,
      { id, text: '', x: x - 60, y: y - 20, scale: 1 },
    ]);
  }

  const textTap = Gesture.Tap().onEnd((e) => {
    runOnJS(addTextBox)(e.x, e.y);
  });

  const handleMoveBox = useCallback(
    (id: string, x: number, y: number) =>
      setTextBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, x, y } : b))),
    [],
  );

  const handleScaleBox = useCallback(
    (id: string, scale: number) =>
      setTextBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, scale } : b))),
    [],
  );

  const handleChangeText = useCallback(
    (id: string, text: string) =>
      setTextBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b))),
    [],
  );

  const handleDeleteBox = useCallback(
    (id: string) => setTextBoxes((prev) => prev.filter((b) => b.id !== id)),
    [],
  );

  function activateMode(mode: ActiveMode) {
    Keyboard.dismiss();
    setActiveMode((prev) => (prev === mode ? 'none' : mode));
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (!pendingUri) return null;

  const canvasGesture = activeMode === 'draw' ? drawPan : textTap;
  // Canvas only captures touches when a tool is active
  const canvasPointerEvents: 'none' | 'auto' =
    activeMode === 'none' ? 'none' : 'auto';

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Layer 1 — Media */}
        {pendingType === 'photo' ? (
          <Image
            source={{ uri: pendingUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <VideoView
            player={videoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        )}

        {/* Layer 2 — Drawing canvas */}
        <GestureDetector gesture={canvasGesture}>
          <View
            style={[StyleSheet.absoluteFill, { pointerEvents: canvasPointerEvents }]}
            collapsable={false}>
            <Svg style={StyleSheet.absoluteFill}>
              {completedPaths.map((p, i) => (
                <Path
                  key={i}
                  d={p.d}
                  stroke={p.color}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
              {currentPathD ? (
                <Path
                  d={currentPathD}
                  stroke={drawColor}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ) : null}
            </Svg>
          </View>
        </GestureDetector>

        {/* Layer 3 — Text boxes */}
        {textBoxes.map((box) => (
          <DraggableTextBox
            key={box.id}
            box={box}
            onMove={handleMoveBox}
            onScale={handleScaleBox}
            onChangeText={handleChangeText}
            onDelete={handleDeleteBox}
          />
        ))}

        {/* Layer 4 — UI chrome */}
        <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">

          {/* Top row: dismiss left, toolbar right */}
          <View style={styles.topRow} pointerEvents="box-none">
            <Pressable style={styles.dismissBtn} onPress={dismiss} hitSlop={12}>
              <Text style={styles.dismissText}>✕</Text>
            </Pressable>

            <View style={styles.toolbarArea} pointerEvents="box-none">
              {/* Color picker — draw mode only, PRD §11.5 */}
              {activeMode === 'draw' && (
                <Pressable
                  style={styles.colorPicker}
                  onPress={() =>
                    setDrawColor((c) => (c === '#000000' ? '#FFFFFF' : '#000000'))
                  }
                  hitSlop={8}>
                  <View
                    style={[
                      styles.colorCircle,
                      { backgroundColor: '#000000' },
                      drawColor === '#000000' && styles.colorCircleActive,
                    ]}
                  />
                  <View
                    style={[
                      styles.colorCircle,
                      { backgroundColor: '#FFFFFF' },
                      drawColor === '#FFFFFF' && styles.colorCircleActive,
                    ]}
                  />
                </Pressable>
              )}

              {/* Vertical toolbar pill — Text + Draw */}
              <View style={styles.toolbarPill}>
                <Pressable
                  style={[styles.toolBtn, activeMode === 'text' && styles.toolBtnActive]}
                  onPress={() => activateMode('text')}
                  hitSlop={4}>
                  <Text style={styles.toolBtnLabel}>Tt</Text>
                </Pressable>

                <View style={styles.toolDivider} />

                <Pressable
                  style={[styles.toolBtn, activeMode === 'draw' && styles.toolBtnActive]}
                  onPress={() => activateMode('draw')}
                  hitSlop={4}>
                  <PenIcon active={activeMode === 'draw'} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Bottom row: disappear indicator left, send button right */}
          <View style={styles.bottomRow} pointerEvents="box-none">
            {/* Informational pill — tells the sender how the recipient will see it (PRD §9.3) */}
            <View style={styles.disappearPill}>
              <Text style={styles.disappearText}>👆  Disappears on tap</Text>
            </View>

            <Pressable
              style={styles.sendBtn}
              onPress={() => router.push('/send-to')}
              hitSlop={8}>
              <SendArrow />
            </Pressable>
          </View>

        </SafeAreaView>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PenIcon({ active }: { active: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M13 2l3 3-9 9H4v-3L13 2z"
        stroke={active ? colors.accent : 'white'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SendArrow() {
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
      <Path
        d="M6 14h16M16 8l6 6-6 6"
        stroke={colors.accentDark}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  dismissBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: { color: '#fff', fontSize: 15, lineHeight: 18 },

  toolbarArea: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // PRD §11.5: two stacked circles — black on top, white below
  colorPicker: { gap: 6, alignItems: 'center' },
  colorCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 0,
    borderColor: colors.accent,
  },
  colorCircleActive: { borderWidth: 2 },

  // Vertical toolbar pill
  toolbarPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  toolBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  toolBtnActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  toolBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  toolDivider: {
    width: 22,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  bottomRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.screen,
  },

  disappearPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  disappearText: { color: '#fff', fontSize: fontSize.caption },

  // PRD §11.5: 64px yellow circle, dark arrow icon
  sendBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textBox: { position: 'absolute', minWidth: 120 },
  textBoxInput: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    padding: 8,
  },
});
