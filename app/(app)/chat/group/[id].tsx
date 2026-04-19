import { Image } from 'expo-image';
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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';
import { relativeTime } from '@/lib/utils';

const { width: WINDOW_W, height: WINDOW_H } = Dimensions.get('window');

type GroupMessage = {
  id: string;
  groupId: string;
  senderId: string;
  senderUsername: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  overlayData: OverlayData | null;
  createdAt: string;
  openedByMe: boolean;
};

function parseMsg(raw: any, openedIds: Set<string>, myId: string): GroupMessage {
  return {
    id: raw.id,
    groupId: raw.group_id,
    senderId: raw.sender_id,
    senderUsername: raw.sender?.username ?? '',
    mediaUrl: raw.media_url,
    mediaType: raw.media_type,
    overlayData: raw.overlay_data ?? null,
    createdAt: raw.created_at,
    openedByMe: raw.sender_id === myId || openedIds.has(raw.id),
  };
}

// ─── Full-screen snap viewer ──────────────────────────────────────────────────

function SnapViewer({ message, onDismiss }: { message: GroupMessage; onDismiss: () => void }) {
  const player = useVideoPlayer(
    message.mediaType === 'video' ? message.mediaUrl : null,
    (p) => { p.loop = true; p.play(); },
  );
  const overlay = message.overlayData;

  return (
    <View style={styles.viewer}>
      {message.mediaType === 'photo' ? (
        <Image source={{ uri: message.mediaUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      )}

      {overlay && overlay.paths.length > 0 && (
        <Svg
          style={StyleSheet.absoluteFill}
          viewBox={`0 0 ${overlay.width} ${overlay.height}`}
          preserveAspectRatio="xMidYMid slice">
          {overlay.paths.map((p, i) => (
            <Path key={i} d={p.d} stroke={p.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </Svg>
      )}

      {overlay && overlay.textBoxes.map((box, i) => {
        const sx = WINDOW_W / overlay.width;
        const sy = WINDOW_H / overlay.height;
        return (
          <Text key={i} style={{
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

      {/* Sender label at top */}
      <View style={styles.viewerLabel}>
        <Text style={styles.viewerLabelText}>{message.senderUsername} · tap to dismiss</Text>
      </View>

      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
    </View>
  );
}

// ─── Snap icon ────────────────────────────────────────────────────────────────

function SnapIcon({ mediaType, filled, accent }: { mediaType: 'photo' | 'video'; filled: boolean; accent: boolean }) {
  const color = accent ? colors.accent : colors.textTertiary;
  return (
    <View style={[styles.snapIcon, { backgroundColor: filled ? color : 'transparent', borderColor: color }]}>
      {mediaType === 'photo' ? <CameraIcon color={filled ? colors.accentDark : color} /> : <VideoIcon color={filled ? colors.accentDark : color} />}
    </View>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M1.5 6.5A1.5 1.5 0 0 1 3 5h.5l1-2h7l1 2H13a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-6Z" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GroupChatScreen() {
  const { id, autoOpen } = useLocalSearchParams<{ id: string; autoOpen?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  const [groupName, setGroupName] = useState('');
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [viewingMessage, setViewingMessage] = useState<GroupMessage | null>(null);

  const [carouselMessages, setCarouselMessages] = useState<GroupMessage[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const listRef = useRef<FlatList>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpenedRef = useRef(false);

  const isCarousel = autoOpen === 'true';

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadGroup = useCallback(async () => {
    if (!user || !id) return;

    const [{ data: groupData }, { data: msgData }, { data: opensData }] = await Promise.all([
      supabase.from('groups').select('name').eq('id', id).single(),
      supabase
        .from('group_messages')
        .select('id, group_id, sender_id, media_url, media_type, overlay_data, created_at, sender:users!group_messages_sender_id_fkey(username)')
        .eq('group_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('group_message_opens')
        .select('message_id')
        .eq('user_id', user.id),
    ]);

    setGroupName((groupData as any)?.name ?? '');

    const myOpenedIds = new Set<string>((opensData ?? []).map((o: any) => o.message_id));
    setOpenedIds(myOpenedIds);
    setMessages((msgData ?? []).map((m: any) => parseMsg(m, myOpenedIds, user.id)));
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadGroup();

    const channel = supabase
      .channel(`group-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => {
            const newMsg = parseMsg(payload.new, openedIds, user?.id ?? '');
            return [...prev, newMsg];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_message_opens' },
        () => { loadGroup(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadGroup]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length === 0) return;
    scrollTimerRef.current = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, [messages.length]);

  // Auto-open carousel for unread messages
  useEffect(() => {
    if (!isCarousel || loading || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    const unopened = messages.filter((m) => m.senderId !== user?.id && !m.openedByMe);
    if (unopened.length === 0) return;
    setCarouselMessages(unopened);
    setCarouselIndex(0);
    openSnap(unopened[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function openSnap(msg: GroupMessage) {
    setViewingMessage(msg);
    if (msg.senderId !== user?.id && !msg.openedByMe) {
      markOpened(msg.id);
    }
  }

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
    await supabase.from('group_message_opens').insert({ message_id: msgId, user_id: user?.id });
    setOpenedIds((prev) => new Set([...prev, msgId]));
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, openedByMe: true } : m)),
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title={groupName} onBack={() => router.back()} />
        <View style={styles.centered}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title={groupName} onBack={() => router.back()} />

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
          const isUnopened = !item.openedByMe && !isSent;
          const filled = isUnopened;
          const accent = !isSent;

          const statusText = isSent
            ? `You sent a ${item.mediaType}`
            : isUnopened
              ? 'Tap to view'
              : 'Opened';

          const title = isSent
            ? `You sent a ${item.mediaType} to ${groupName}`
            : `${item.senderUsername} sent a ${item.mediaType} to ${groupName}`;

          return (
            <Pressable
              style={({ pressed }) => [
                styles.msgRow,
                pressed && isUnopened && styles.msgRowPressed,
              ]}
              onPress={() => { if (!isSent && isUnopened) openSnap(item); }}
              disabled={isSent || !isUnopened}>
              <SnapIcon mediaType={item.mediaType} filled={filled} accent={accent} />
              <View style={styles.msgBody}>
                <Text style={styles.msgTitle} numberOfLines={1}>{title}</Text>
                <Text style={[styles.msgStatus, isUnopened && styles.msgStatusUnread]}>{statusText}</Text>
              </View>
              <View style={styles.msgRight}>
                <Text style={styles.msgTime}>{relativeTime(item.createdAt)}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <Modal visible={!!viewingMessage} animationType="fade" statusBarTranslucent onRequestClose={handleViewerDismiss}>
        {viewingMessage && <SnapViewer message={viewingMessage} onDismiss={handleViewerDismiss} />}
      </Modal>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
          <Path d="M13 4l-6 6 6 6" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.headline,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },

  listContent: { paddingTop: spacing.sm, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: fontSize.body, color: colors.textSecondary, textAlign: 'center' },

  msgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 16,
    gap: spacing.md,
  },
  msgRowPressed: { backgroundColor: colors.surfaceMuted },

  snapIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.chip,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  msgBody: { flex: 1, gap: 2 },
  msgTitle: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: fontWeight.body },
  msgStatus: { fontSize: fontSize.caption, color: colors.textSecondary },
  msgStatusUnread: { color: colors.accent, fontWeight: '600' as const },

  msgRight: { alignItems: 'center', gap: spacing.xs },
  msgTime: { fontSize: fontSize.caption, color: colors.textTertiary },

  viewer: { flex: 1, backgroundColor: '#000' },
  viewerLabel: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  viewerLabelText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.caption,
    fontWeight: '600' as const,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
});
