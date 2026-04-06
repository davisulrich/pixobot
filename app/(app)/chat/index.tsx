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
import { colors, fontSize, fontWeight, lineHeight, radius, spacing } from '@/tokens';

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ChatListScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    // Fetch conversations with both user rows joined
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

    // Fetch all recent messages, then keep the latest per conversation in JS
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
  }, [user]);

  useEffect(() => {
    load();

    // Refresh the list whenever any conversation or message changes.
    // Granular diffing isn't needed — the list is small and loads fast.
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
        <Text style={styles.screenTitle}>Chats</Text>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.screenTitle}>Chats</Text>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => {
          const status = getStatus(item);
          const initial = item.otherUser.username.charAt(0).toUpperCase();
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/(app)/chat/${item.id}`)}>
              {/* Avatar */}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>

              {/* Text */}
              <View style={styles.rowBody}>
                <Text
                  style={[styles.rowUsername, status.unread && styles.rowUsernameBold]}
                  numberOfLines={1}>
                  {item.otherUser.username}
                </Text>
                <Text
                  style={[styles.rowStatus, status.unread && styles.rowStatusUnread]}
                  numberOfLines={1}>
                  {status.label}
                </Text>
              </View>

              {/* Right: time + unread dot */}
              <View style={styles.rowRight}>
                <Text style={styles.rowTime}>{relativeTime(item.lastActivityAt)}</Text>
                {status.unread && <View style={styles.unreadDot} />}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyBody}>
              Send a snap to a friend to start a conversation.
            </Text>
          </View>
        }
        contentContainerStyle={conversations.length === 0 ? { flex: 1 } : { paddingBottom: spacing.screen }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenTitle: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    gap: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.avatar,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.title,
    color: colors.accentDark,
  },

  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowUsername: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.body,
    color: colors.textPrimary,
  },
  rowUsernameBold: {
    fontWeight: '600',
  },
  rowStatus: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  rowStatusUnread: {
    color: colors.accent,
    fontWeight: '500',
  },

  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowTime: {
    fontSize: fontSize.caption,
    color: colors.textTertiary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.body * lineHeight.body,
  },
});
