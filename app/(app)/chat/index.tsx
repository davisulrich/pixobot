import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { getPresence, formatPresence } from '@/lib/presence';
import { colors, fontSize, fontWeight, letterSpacing, lineHeight, spacing } from '@/tokens';
import { relativeTime as _relativeTime } from '@/lib/utils';

// Uppercase timestamps for the editorial list style
function relativeTime(iso: string) {
  return _relativeTime(iso).toUpperCase();
}

type LatestMessage = {
  mediaType: 'photo' | 'video';
  senderId: string;
  openedAt: string | null;
  createdAt: string;
};

type ConvRow = {
  id: string;
  lastActivityAt: string;
  otherUser: { id: string; username: string };
  latestMessage: LatestMessage | null;
};


export default function ChatListScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [presence, setPresence] = useState<Record<string, number | null>>({});

  const load = useCallback(async () => {
    if (!user) return;

    const { data: convData } = await supabase
      .from('conversations')
      .select(
        `id, last_activity_at, user_id_1, user_id_2,
         user1:users!conversations_user_id_1_fkey(id, username),
         user2:users!conversations_user_id_2_fkey(id, username)`,
      )
      .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
      .order('last_activity_at', { ascending: false });

    if (!convData?.length) {
      setConversations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const convIds = convData.map((c) => c.id);
    const { data: msgData } = await supabase
      .from('messages')
      .select('id, conversation_id, media_type, sender_id, opened_at, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });

    const latestByConv = new Map<string, any>();
    msgData?.forEach((msg) => {
      if (!latestByConv.has(msg.conversation_id)) {
        latestByConv.set(msg.conversation_id, msg);
      }
    });

    const rows: ConvRow[] = (convData as any[]).map((c) => {
      const msg = latestByConv.get(c.id);
      return {
        id: c.id,
        lastActivityAt: c.last_activity_at,
        otherUser: c.user_id_1 === user.id ? c.user2 : c.user1,
        latestMessage: msg
          ? {
              mediaType: msg.media_type,
              senderId: msg.sender_id,
              openedAt: msg.opened_at,
              createdAt: msg.created_at,
            }
          : null,
      };
    });

    setConversations(rows);
    setLoading(false);
    setRefreshing(false);

    const otherUserIds = rows.map((r) => r.otherUser.id);
    const presenceData = await getPresence(otherUserIds);
    setPresence(presenceData);
  }, [user]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`chat-list-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  function getStatus(conv: ConvRow): { label: string; unread: boolean } {
    const msg = conv.latestMessage;
    if (!msg || !user) return { label: 'No snaps yet', unread: false };
    const iSent = msg.senderId === user.id;
    const kind = msg.mediaType === 'photo' ? 'Photo' : 'Video';
    if (iSent) {
      return { label: msg.openedAt ? `${kind} opened` : `${kind} delivered`, unread: false };
    }
    return { label: msg.openedAt ? `${kind} opened` : `New ${kind.toLowerCase()}`, unread: !msg.openedAt };
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader />

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.textPrimary}
          />
        }
        renderItem={({ item }) => {
          const status = getStatus(item);
          const initial = item.otherUser.username.charAt(0).toUpperCase();
          const presenceLabel = formatPresence(presence[item.otherUser.id] ?? null);
          const isActive = presenceLabel === 'Active now';

          return (
            // Pressable only carries the pressed background — all layout is in rowInner
            <Pressable
              style={({ pressed }) => pressed ? styles.rowPressed : null}
              onPress={() => router.push(`/(app)/chat/${item.id}`)}>
              <View style={styles.rowInner}>
                <View style={[styles.avatar, status.unread && styles.avatarUnread]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                  {isActive && <View style={styles.activeDot} />}
                </View>

                <View style={styles.rowBody}>
                  <Text style={[styles.rowUsername, status.unread && styles.rowUsernameBold]} numberOfLines={1}>
                    {item.otherUser.username}
                    {presenceLabel && presenceLabel !== 'Active now' && (
                      <Text style={styles.rowPresence}>  {presenceLabel}</Text>
                    )}
                  </Text>
                  <Text style={[styles.rowStatus, status.unread && styles.rowStatusUnread]} numberOfLines={1}>
                    {status.label}
                  </Text>
                </View>

                <View style={styles.rowRight}>
                  <Text style={styles.rowTime}>{relativeTime(item.lastActivityAt)}</Text>
                  {status.unread && <View style={styles.unreadMark} />}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyBody}>Send a snap to start a conversation.</Text>
          </View>
        }
        contentContainerStyle={conversations.length === 0 ? styles.listEmpty : styles.listContent}
      />
    </SafeAreaView>
  );
}

function ScreenHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.screenTitle}>CHATS</Text>
      <View style={styles.headerRule} />
    </View>
  );
}

const H_PAD = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: H_PAD,
    paddingTop: spacing.lg,
  },
  screenTitle: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
    letterSpacing: letterSpacing.caps,
    lineHeight: fontSize.title * lineHeight.title,
    paddingBottom: spacing.md,
  },
  headerRule: {
    height: 1.5,
    backgroundColor: colors.borderStrong,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  // Layout lives here, not on Pressable — fixes padding bug with New Architecture
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 20,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  avatar: {
    width: 44,
    height: 44,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarUnread: {
    backgroundColor: colors.accent,
  },
  avatarText: {
    fontSize: fontSize.headline,
    fontWeight: '800' as const,
    color: colors.accentDark,
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: colors.bg,
  },

  rowBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowUsername: {
    fontSize: fontSize.headline,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  rowUsernameBold: {
    fontWeight: '800' as const,
  },
  rowPresence: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.body,
    color: colors.textTertiary,
  },
  rowStatus: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  rowStatusUnread: {
    color: colors.textPrimary,
    fontWeight: '600' as const,
  },

  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  rowTime: {
    fontSize: fontSize.label,
    fontWeight: '700' as const,
    color: colors.textTertiary,
    letterSpacing: letterSpacing.label,
  },
  unreadMark: {
    width: 6,
    height: 6,
    backgroundColor: colors.textPrimary,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: H_PAD,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: letterSpacing.caps,
  },
  emptyBody: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.body * lineHeight.body,
  },
  listContent: { paddingBottom: spacing.screen },
  listEmpty: { flex: 1 },
});
