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
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMediaStore } from '@/lib/store/media';
import type { OverlayData } from '@/lib/store/media';
import { colors, radius, spacing } from '@/tokens';

// Note: Snapchat's edit screen is a layered compositor:
//   1. Full-bleed media (photo or looping video)
//   2. SVG drawing layer (paths captured via Pan gesture)
//   3. Draggable/pinch-resizable text boxes
//   4. UI chrome (dismiss, toolbar, send, disappear indicator)
// We follow the same layering order so gestures fall through correctly.

// Note: Drawing paths must never read a JS ref (useRef) from inside a Reanimated
// worklet — doing so causes a native crash. We use useSharedValue for the live
// path string (UI thread safe) and pass only primitives via runOnJS.

// Note: Eraser hit-testing samples each completed path's point list against the
// current finger position. Because onUpdate fires at ~60fps this catches every
// stroke the eraser crosses in practice, without any polygon intersection math.

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Radius of the eraser circle in pixels — also used for hit-testing.
const ERASE_RADIUS = 22;

type DrawPath = { d: string; color: string };
type TextBox = { id: string; text: string; x: number; y: number; scale: number };
type ActiveMode = 'none' | 'draw' | 'erase' | 'text';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Parse sampled (x, y) points from an SVG path string of M/L commands.
function parsePathPoints(d: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const re = /[ML]\s*([\d.]+),([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return pts;
}

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
            if (!box.text.trim()) onDelete(box.id);
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
  const { pendingUri, pendingType, clearPending, setOverlay } = useMediaStore();

  const [activeMode, setActiveMode] = useState<ActiveMode>('none');
  const [drawColor, setDrawColor] = useState<'#000000' | '#FFFFFF'>('#000000');
  const [completedPaths, setCompletedPaths] = useState<DrawPath[]>([]);
  const [currentPathD, setCurrentPathD] = useState('');
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);

  const currentPathShared = useSharedValue('');

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

  // Persist overlay data to the media store so send-to.tsx can attach it to the message.
  function handleSend() {
    const activePaths = completedPaths;
    const activeTextBoxes = textBoxes.filter((b) => b.text.trim().length > 0);
    const overlay: OverlayData | null =
      activePaths.length > 0 || activeTextBoxes.length > 0
        ? { paths: activePaths, textBoxes: activeTextBoxes, width: SCREEN_W, height: SCREEN_H }
        : null;
    setOverlay(overlay);
    router.push('/send-to');
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  function syncCurrentPath(d: string) {
    setCurrentPathD(d);
  }

  function commitPath(d: string, color: string) {
    if (d) {
      setCompletedPaths((prev) => [...prev, { d, color }]);
    }
    setCurrentPathD('');
  }

  const drawPan = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => {
      currentPathShared.value = `M ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      runOnJS(syncCurrentPath)(currentPathShared.value);
    })
    .onUpdate((e) => {
      currentPathShared.value =
        currentPathShared.value + ` L ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      runOnJS(syncCurrentPath)(currentPathShared.value);
    })
    .onEnd(() => {
      runOnJS(commitPath)(currentPathShared.value, drawColor);
      currentPathShared.value = '';
    });

  // ── Eraser ────────────────────────────────────────────────────────────────
  // For each finger position update, remove any completed path that has at least
  // one sampled point within ERASE_RADIUS pixels. Running at ~60fps this reliably
  // catches every stroke the eraser crosses without polygon intersection math.

  function eraseAtPoint(x: number, y: number) {
    setEraserPos({ x, y });
    setCompletedPaths((prev) =>
      prev.filter((p) => {
        const pts = parsePathPoints(p.d);
        // Keep the path only if NO point is within the eraser circle
        return !pts.some(
          (pt) => (pt.x - x) * (pt.x - x) + (pt.y - y) * (pt.y - y) < ERASE_RADIUS * ERASE_RADIUS,
        );
      }),
    );
  }

  function clearEraserPos() {
    setEraserPos(null);
  }

  const erasePan = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => {
      runOnJS(eraseAtPoint)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(eraseAtPoint)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(clearEraserPos)();
    });

  // ── Text ──────────────────────────────────────────────────────────────────

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

  const canvasGesture =
    activeMode === 'draw' ? drawPan :
    activeMode === 'erase' ? erasePan :
    textTap;

  const canvasPointerEvents: 'none' | 'auto' = activeMode === 'none' ? 'none' : 'auto';

  // Eraser button only appears once there's something to erase
  const showEraser = completedPaths.length > 0;

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
              {/* Completed strokes */}
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
              {/* Live stroke being drawn */}
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
              {/* Eraser cursor — shows hit radius so the user knows what will be removed */}
              {activeMode === 'erase' && eraserPos && (
                <Circle
                  cx={eraserPos.x}
                  cy={eraserPos.y}
                  r={ERASE_RADIUS}
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth={2}
                  fill="rgba(255,255,255,0.15)"
                />
              )}
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
              {/* Color picker — draw mode only */}
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

              {/* Vertical toolbar pill */}
              <View style={styles.toolbarPill}>
                {/* Text tool */}
                <Pressable
                  style={[styles.toolBtn, activeMode === 'text' && styles.toolBtnActive]}
                  onPress={() => activateMode('text')}
                  hitSlop={4}>
                  <Text style={styles.toolBtnLabel}>Tt</Text>
                </Pressable>

                <View style={styles.toolDivider} />

                {/* Draw tool */}
                <Pressable
                  style={[styles.toolBtn, activeMode === 'draw' && styles.toolBtnActive]}
                  onPress={() => activateMode('draw')}
                  hitSlop={4}>
                  <PenIcon active={activeMode === 'draw'} />
                </Pressable>

                {/* Eraser tool — only visible when there are paths to erase */}
                {showEraser && (
                  <>
                    <View style={styles.toolDivider} />
                    <Pressable
                      style={[styles.toolBtn, activeMode === 'erase' && styles.toolBtnActive]}
                      onPress={() => activateMode('erase')}
                      hitSlop={4}>
                      <EraserIcon active={activeMode === 'erase'} />
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Bottom row: send button */}
          <View style={styles.bottomRow} pointerEvents="box-none">
            <Pressable
              style={styles.sendBtn}
              onPress={handleSend}
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

function EraserIcon({ active }: { active: boolean }) {
  const c = active ? colors.accent : 'white';
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      {/* Eraser body */}
      <Path
        d="M3 13.5L8 4l7 4-5 9.5-3-1.5"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Baseline */}
      <Path
        d="M3 13.5h12"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
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
    borderRadius: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: { color: '#fff', fontSize: 15, lineHeight: 18 },

  toolbarArea: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  colorPicker: { gap: 6, alignItems: 'center' },
  colorCircle: {
    width: 26,
    height: 26,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: colors.accent,
  },
  colorCircleActive: { borderWidth: 2 },

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
    borderRadius: 0,
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
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.screen,
  },

  sendBtn: {
    width: 64,
    height: 64,
    borderRadius: 0,
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
