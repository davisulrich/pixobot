import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OverlayData } from '@/lib/store/media';

const { width: WINDOW_W, height: WINDOW_H } = Dimensions.get('window');

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';
import { relativeTime } from '@/lib/utils';

type Message = {
  id: string;
  senderId: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  replayCount: number;
  hearted: boolean;
  openedAt: string | null;
  createdAt: string;
  overlayData: OverlayData | null;
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
    overlayData: raw.overlay_data ?? null,
  };
}

// ─── Full-screen snap viewer ──────────────────────────────────────────────────

// Tap anywhere on the screen to dismiss or advance the carousel.
// Transparent Pressable overlay handles the tap — avoids RNGH gesture issues inside Modals.
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
      p.audioMixingMode = 'doNotMix'; // pause background music while snap plays
      p.play();
    },
  );

  const overlay = message.overlayData;

  return (
    <View style={styles.viewer}>
      {/* Layer 1 — base media */}
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

      {/* Layer 2 — SVG drawing overlay.
          viewBox maps edit-screen coordinates to the current screen size. */}
      {overlay && overlay.paths.length > 0 && (
        <Svg
          style={StyleSheet.absoluteFill}
          viewBox={`0 0 ${overlay.width} ${overlay.height}`}
          preserveAspectRatio="xMidYMid slice">
          {overlay.paths.map((p, i) => (
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
        </Svg>
      )}

      {/* Layer 3 — text boxes, positions scaled to current screen */}
      {overlay && overlay.textBoxes.map((box, i) => {
        const sx = WINDOW_W / overlay.width;
        const sy = WINDOW_H / overlay.height;
        return (
          <Text
            key={i}
            style={{
              position: 'absolute',
              left: box.x * sx,
              top: box.y * sy,
              fontSize: 24 * Math.min(sx, sy) * box.scale,
              fontWeight: '700',
              color: '#fff',
              textShadowColor: 'rgba(0,0,0,0.6)',
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 4,
            }}>
            {box.text}
          </Text>
        );
      })}

      {/* Layer 4 — transparent tap capture for dismiss/advance */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
    </View>
  );
}

// ─── Snap icon ────────────────────────────────────────────────────────────────

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
      <Path d="M9 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke={color} strokeWidth={1.4} />
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
  const { id, autoOpen } = useLocalSearchParams<{ id: string; autoOpen?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  const [otherUsername, setOtherUsername] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingMessage, setViewingMessage] = useState<Message | null>(null);

  // Carousel state — populated when navigated with autoOpen=true
  const [carouselMessages, setCarouselMessages] = useState<Message[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const listRef = useRef<FlatList>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpenedRef = useRef(false);

  const isCarousel = autoOpen === 'true';

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
      .select('id, sender_id, media_url, media_type, replay_count, hearted, opened_at, created_at, overlay_data')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    setMessages((msgs ?? []).map(parseMsg));
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadConversation();

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

  // Scroll to bottom when new messages arrive
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

  // Auto-open carousel after initial load when navigated with autoOpen=true.
  // Only unopened received messages are included — replays are only available
  // from the full timeline view.
  useEffect(() => {
    if (!isCarousel || loading || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    const unopened = messages.filter((m) => m.senderId !== user?.id && !m.openedAt);
    if (unopened.length === 0) return; // Nothing new — timeline is shown instead
    setCarouselMessages(unopened);
    setCarouselIndex(0);
    openSnap(unopened[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function openSnap(msg: Message) {
    setViewingMessage(msg);
    if (msg.senderId !== user?.id && !msg.openedAt) {
      markOpened(msg.id);
    }
  }

  // Called when viewer is tapped or back is requested.
  // In carousel mode: advance to next snap or go back to chat list.
  // In normal mode: just close the viewer.
  function handleViewerDismiss() {
    if (!isCarousel || carouselMessages.length === 0) {
      setViewingMessage(null);
      return;
    }
    const next = carouselIndex + 1;
    if (next >= carouselMessages.length) {
      setViewingMessage(null);
      router.back();
    } else {
      setCarouselIndex(next);
      openSnap(carouselMessages[next]);
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
    setViewingMessage(msg);
    const newCount = msg.replayCount + 1;
    await supabase.from('messages').update({ replay_count: newCount }).eq('id', msg.id);
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, replayCount: newCount } : m)),
    );
  }

  async function toggleHeart(msg: Message) {
    if (!user) return;
    const newVal = !msg.hearted;

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, hearted: newVal } : m)),
    );

    await supabase.from('messages').update({ hearted: newVal }).eq('id', msg.id);

    if (newVal) {
      await supabase.from('memories').insert({
        user_id: user.id,
        message_id: msg.id,
      });

      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const ext = msg.mediaType === 'video' ? 'mp4' : 'jpg';
          const localUri = `${FileSystem.cacheDirectory}pixobot_${msg.id}.${ext}`;
          const { uri } = await FileSystem.downloadAsync(msg.mediaUrl, localUri);
          await MediaLibrary.saveToLibraryAsync(uri);
        }
      } catch (e) {
        console.warn('Failed to save to iOS Photos:', e);
      }
    } else {
      await supabase
        .from('memories')
        .delete()
        .eq('user_id', user.id)
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
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 95 }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No snaps yet. Send the first one!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSent = item.senderId === user?.id;
          const isUnopened = !item.openedAt;
          const canReplay = !isSent && !!item.openedAt && item.replayCount < 3;

          const filled = !isSent && isUnopened;
          const accent = !isSent;

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
              <SnapIcon mediaType={item.mediaType} filled={filled} accent={accent} />

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

      <Modal
        visible={!!viewingMessage}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleViewerDismiss}>
        {viewingMessage && (
          <SnapViewer message={viewingMessage} onDismiss={handleViewerDismiss} />
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

  // paddingBottom is set dynamically via insets to clear the floating nav bar
  listContent: {
    paddingTop: spacing.sm,
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

  snapIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.chip,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
});
