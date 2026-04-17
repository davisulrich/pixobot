import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';
import { relativeTime } from '@/lib/utils';

// Note: Messages are shown chronologically (oldest at top, newest at bottom).
// Received snaps tap to open full-screen; the viewer marks opened_at on mount.
// Replay is supported up to 3 times (replay_count <= 3 per schema constraint).
// Hearts update the `hearted` column; only recipients can update their received messages.

type Message = {
  id: string;
  senderId: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  replayCount: number;
  hearted: boolean;
  openedAt: string | null;
  createdAt: string;
};

function parseMsg(raw: any): Message {
  return {
    id: raw.id,
    senderId: raw.sender_id,
    mediaUrl: raw.media_url,
    mediaType: raw.media_type,
    replayCount: raw.replay_count,
    hearted: raw.hearted,
    openedAt: raw.opened_at,
    createdAt: raw.created_at,
  };
}


// ─── Full-screen snap viewer ──────────────────────────────────────────────────

// Extracted as its own component so useVideoPlayer gets its own lifecycle
// and doesn't hold a stale source from a previously viewed snap.
function SnapViewer({
  message,
  onDismiss,
}: {
  message: Message;
  onDismiss: () => void;
}) {
  const player = useVideoPlayer(
    message.mediaType === 'video' ? message.mediaUrl : null,
    (p) => {
      p.loop = true;
      p.play();
    },
  );

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  return (
    <GestureHandlerRootView style={styles.viewer}>
      <GestureDetector gesture={pinch}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
            {message.mediaType === 'photo' ? (
              <Image
                source={{ uri: message.mediaUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>
      <SafeAreaView style={styles.viewerSafeArea} pointerEvents="box-none">
        <View style={styles.viewerTopRow} pointerEvents="box-none">
          <Pressable onPress={onDismiss} style={styles.viewerCloseBtn} hitSlop={12}>
            <Text style={styles.viewerCloseBtnText}>✕</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ─── Snap icon ────────────────────────────────────────────────────────────────

// Square icon indicating media type and open state.
// Filled yellow = received, unopened. Outlined = received, opened or sent.
function SnapIcon({
  mediaType,
  filled,
  accent,
}: {
  mediaType: 'photo' | 'video';
  filled: boolean;
  accent: boolean;
}) {
  const color = accent ? colors.accent : colors.textTertiary;
  return (
    <View
      style={[
        styles.snapIcon,
        {
          backgroundColor: filled ? color : 'transparent',
          borderColor: color,
        },
      ]}>
      {mediaType === 'photo' ? (
        <CameraIcon color={filled ? colors.accentDark : color} />
      ) : (
        <VideoIcon color={filled ? colors.accentDark : color} />
      )}
    </View>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M1.5 6.5A1.5 1.5 0 0 1 3 5h.5l1-2h7l1 2H13a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-6Z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Path
        d="M9 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke={color}
        strokeWidth={1.4}
      />
    </Svg>
  );
}

function VideoIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Rect x={1} y={4} width={10} height={10} rx={1.5} stroke={color} strokeWidth={1.4} />
      <Path d="M11 7l5-2.5v9L11 11V7Z" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [otherUsername, setOtherUsername] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingMessage, setViewingMessage] = useState<Message | null>(null);

  const listRef = useRef<FlatList>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadConversation = useCallback(async () => {
    if (!user || !id) return;

    const { data: conv } = await supabase
      .from('conversations')
      .select(
        `user_id_1, user_id_2,
         user1:users!conversations_user_id_1_fkey(id, username),
         user2:users!conversations_user_id_2_fkey(id, username)`,
      )
      .eq('id', id)
      .single();

    if (conv) {
      const other = (conv as any).user_id_1 === user.id
        ? (conv as any).user2
        : (conv as any).user1;
      setOtherUsername(other?.username ?? '');
    }

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender_id, media_url, media_type, replay_count, hearted, opened_at, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    setMessages((msgs ?? []).map(parseMsg));
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadConversation();

    // Real-time: handle new messages and updates (open, heart, replay)
    const channel = supabase
      .channel(`conv-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => [...prev, parseMsg(payload.new)]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? parseMsg(payload.new) : m)),
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadConversation]);

  // Scroll to bottom when new messages arrive; clear timer on unmount
  useEffect(() => {
    if (messages.length === 0) return;
    scrollTimerRef.current = setTimeout(
      () => listRef.current?.scrollToEnd({ animated: true }),
      80,
    );
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [messages.length]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function openSnap(msg: Message) {
    setViewingMessage(msg);
    // Mark as opened immediately if this is a received, unopened message
    if (msg.senderId !== user!.id && !msg.openedAt) {
      markOpened(msg.id);
    }
  }

  async function markOpened(msgId: string) {
    const now = new Date().toISOString();
    await supabase.from('messages').update({ opened_at: now }).eq('id', msgId);
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, openedAt: now } : m)),
    );
  }

  async function replaySnap(msg: Message) {
    // Replay: show viewer again and increment replay_count (max 3 per schema)
    setViewingMessage(msg);
    const newCount = msg.replayCount + 1;
    await supabase.from('messages').update({ replay_count: newCount }).eq('id', msg.id);
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, replayCount: newCount } : m)),
    );
  }

  async function toggleHeart(msg: Message) {
    const newVal = !msg.hearted;

    // Optimistic update so the heart responds instantly
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, hearted: newVal } : m)),
    );

    await supabase.from('messages').update({ hearted: newVal }).eq('id', msg.id);

    if (newVal) {
      // Save to Memories table so the album screen can query it
      await supabase.from('memories').insert({
        user_id: user!.id,
        message_id: msg.id,
      });

      // Save to iOS Photos — download to cache first, then hand off to MediaLibrary
      // Note: Snapchat saves to the camera roll automatically on heart; we match that.
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const ext = msg.mediaType === 'video' ? 'mp4' : 'jpg';
          const localUri = `${FileSystem.cacheDirectory}pixobot_${msg.id}.${ext}`;
          const { uri } = await FileSystem.downloadAsync(msg.mediaUrl, localUri);
          await MediaLibrary.saveToLibraryAsync(uri);
        }
      } catch (e) {
        // Non-fatal — the heart still saves in-app even if Photos access is denied
        console.warn('Failed to save to iOS Photos:', e);
      }
    } else {
      // Remove from Memories table — does not remove from iOS Photos (unexpected behavior)
      await supabase
        .from('memories')
        .delete()
        .eq('user_id', user!.id)
        .eq('message_id', msg.id);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header username={otherUsername} onBack={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header username={otherUsername} onBack={() => router.back()} />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No snaps yet. Send the first one!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSent = item.senderId === user!.id;
          const isUnopened = !item.openedAt;
          const canReplay = !isSent && !!item.openedAt && item.replayCount < 3;

          // Icon appearance
          const filled = !isSent && isUnopened;
          const accent = !isSent; // received = accent color, sent = gray

          // Status text
          let statusText: string;
          if (isSent) {
            statusText = item.openedAt ? 'Opened' : 'Delivered';
          } else if (isUnopened) {
            statusText = 'Tap to view';
          } else if (canReplay) {
            statusText = `Replay · ${3 - item.replayCount} left`;
          } else {
            statusText = 'Opened';
          }

          return (
            <Pressable
              style={({ pressed }) => [
                styles.msgRow,
                pressed && !isSent && (isUnopened || canReplay) && styles.msgRowPressed,
              ]}
              onPress={() => {
                if (isSent) return;
                if (isUnopened) openSnap(item);
                else if (canReplay) replaySnap(item);
              }}
              disabled={isSent || (!isUnopened && !canReplay)}>
              {/* Snap type icon */}
              <SnapIcon mediaType={item.mediaType} filled={filled} accent={accent} />

              {/* Description + status */}
              <View style={styles.msgBody}>
                <Text style={styles.msgTitle} numberOfLines={1}>
                  {isSent
                    ? `You sent ${otherUsername} a ${item.mediaType}`
                    : `${otherUsername} sent you a ${item.mediaType}`}
                </Text>
                <Text
                  style={[
                    styles.msgStatus,
                    !isSent && isUnopened && styles.msgStatusUnread,
                    canReplay && styles.msgStatusReplay,
                  ]}>
                  {statusText}
                </Text>
              </View>

              {/* Time + heart (received only) */}
              <View style={styles.msgRight}>
                <Text style={styles.msgTime}>{relativeTime(item.createdAt)}</Text>
                {!isSent && (
                  <Pressable
                    onPress={() => toggleHeart(item)}
                    hitSlop={8}
                    style={styles.heartBtn}>
                    <HeartIcon filled={item.hearted} />
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Full-screen viewer */}
      <Modal
        visible={!!viewingMessage}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewingMessage(null)}>
        {viewingMessage && (
          <SnapViewer message={viewingMessage} onDismiss={() => setViewingMessage(null)} />
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Header({ username, onBack }: { username: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
          <Path
            d="M13 4l-6 6 6 6"
            stroke={colors.textPrimary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{username}</Text>
      {/* spacer to center title */}
      <View style={styles.backBtn} />
    </View>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 16.5S2.5 12 2.5 6.5a4 4 0 0 1 7.5-2 4 4 0 0 1 7.5 2c0 5.5-7.5 10-7.5 10Z"
        stroke={filled ? colors.destructive : colors.textTertiary}
        strokeWidth={1.5}
        fill={filled ? colors.destructive : 'none'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.headline,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },

  // Message list — extra bottom padding clears the floating nav bar (~105px tall)
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: 120,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Message row
  msgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 16,
    gap: spacing.md,
  },
  msgRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },

  // Snap icon — 44×44 rounded square with 2px border
  snapIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.chip,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Message text
  msgBody: {
    flex: 1,
    gap: 2,
  },
  msgTitle: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    fontWeight: fontWeight.body,
  },
  msgStatus: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  msgStatusUnread: {
    color: colors.accent,
    fontWeight: '600',
  },
  msgStatusReplay: {
    color: colors.textPrimary,
    fontWeight: '500',
  },

  // Right column
  msgRight: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  msgTime: {
    fontSize: fontSize.caption,
    color: colors.textTertiary,
  },
  heartBtn: {
    padding: 2,
  },

  // Full-screen viewer
  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerSafeArea: {
    ...StyleSheet.absoluteFillObject,
  },
  viewerTopRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  viewerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseBtnText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 18,
  },
});
