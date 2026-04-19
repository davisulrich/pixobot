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
import Svg, { Path } from 'react-native-svg';

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
  senderUsername?: string;
  openedAt: string | null;
  createdAt: string;
};

type ConvRow = {
  kind: 'dm';
  id: string;
  lastActivityAt: string;
  otherUser: { id: string; username: string };
  latestMessage: LatestMessage | null;
};

type GroupRow = {
  kind: 'group';
  id: string;
  name: string;
  lastActivityAt: string;
  latestMessage: LatestMessage | null;
  unread: boolean;
};

type ListRow = ConvRow | GroupRow;


export default function ChatListScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [presence, setPresence] = useState<Record<string, number | null>>({});

  const load = useCallback(async () => {
    if (!user) return;

    // ── DM conversations ──────────────────────────────────────────────────────
    const { data: convData } = await supabase
      .from('conversations')
      .select(
        `id, last_activity_at, user_id_1, user_id_2,
         user1:users!conversations_user_id_1_fkey(id, username),
         user2:users!conversations_user_id_2_fkey(id, username)`,
      )
      .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
      .order('last_activity_at', { ascending: false });

    const dmRows: ConvRow[] = [];

    if (convData?.length) {
      const convIds = convData.map((c) => c.id);
      const { data: msgData } = await supabase
        .from('messages')
        .select('id, conversation_id, media_type, sender_id, opened_at, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false });

      const latestByConv = new Map<string, any>();
      msgData?.forEach((msg) => {
        if (!latestByConv.has(msg.conversation_id)) latestByConv.set(msg.conversation_id, msg);
      });

      (convData as any[]).forEach((c) => {
        const msg = latestByConv.get(c.id);
        dmRows.push({
          kind: 'dm',
          id: c.id,
          lastActivityAt: c.last_activity_at,
          otherUser: c.user_id_1 === user.id ? c.user2 : c.user1,
          latestMessage: msg
            ? { mediaType: msg.media_type, senderId: msg.sender_id, openedAt: msg.opened_at, createdAt: msg.created_at }
            : null,
        });
      });
    }

    // ── Group conversations ───────────────────────────────────────────────────
    const groupRows: GroupRow[] = [];

    const { data: myMemberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    if (myMemberships?.length) {
      const groupIds = myMemberships.map((m: any) => m.group_id);

      const [{ data: groupsData }, { data: latestMsgs }] = await Promise.all([
        supabase
          .from('groups')
          .select('id, name, last_activity_at')
          .in('id', groupIds)
          .order('last_activity_at', { ascending: false }),
        supabase
          .from('group_messages')
          .select('id, group_id, sender_id, media_type, created_at, sender:users!group_messages_sender_id_fkey(username)')
          .in('group_id', groupIds)
          .order('created_at', { ascending: false }),
      ]);

      const latestByGroup = new Map<string, any>();
      (latestMsgs ?? []).forEach((m: any) => {
        if (!latestByGroup.has(m.group_id)) latestByGroup.set(m.group_id, m);
      });

      // Check which of those latest messages the current user has opened
      const latestMsgIds = [...latestByGroup.values()].map((m) => m.id);
      const { data: opens } = latestMsgIds.length
        ? await supabase
            .from('group_message_opens')
            .select('message_id')
            .in('message_id', latestMsgIds)
            .eq('user_id', user.id)
        : { data: [] };

      const openedIds = new Set((opens ?? []).map((o: any) => o.message_id));

      (groupsData ?? []).forEach((g: any) => {
        const msg = latestByGroup.get(g.id);
        const isUnread = msg && msg.sender_id !== user.id && !openedIds.has(msg.id);
        groupRows.push({
          kind: 'group',
          id: g.id,
          name: g.name,
          lastActivityAt: msg ? msg.created_at : g.last_activity_at,
          latestMessage: msg
            ? {
                mediaType: msg.media_type,
                senderId: msg.sender_id,
                senderUsername: (msg as any).sender?.username ?? '',
                openedAt: null,
                createdAt: msg.created_at,
              }
            : null,
          unread: !!isUnread,
        });
      });
    }

    // Merge and sort by lastActivityAt descending
    const all: ListRow[] = [...dmRows, ...groupRows].sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );

    setRows(all);
    setLoading(false);
    setRefreshing(false);

    const otherUserIds = dmRows.map((r) => r.otherUser.id);
    if (otherUserIds.length) {
      const presenceData = await getPresence(otherUserIds);
      setPresence(presenceData);
    }
  }, [user]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`chat-list-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_message_opens' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  function getDmStatus(conv: ConvRow): { label: string; unread: boolean } {
    const msg = conv.latestMessage;
    if (!msg || !user) return { label: 'No snaps yet', unread: false };
    const iSent = msg.senderId === user.id;
    const kind = msg.mediaType === 'photo' ? 'Photo' : 'Video';
    if (iSent) {
      return { label: msg.openedAt ? `${kind} opened` : `${kind} delivered`, unread: false };
    }
    return { label: msg.openedAt ? `${kind} opened` : `New ${kind.toLowerCase()}`, unread: !msg.openedAt };
  }

  function getGroupStatus(row: GroupRow): { label: string } {
    const msg = row.latestMessage;
    if (!msg || !user) return { label: 'No snaps yet' };
    const kind = msg.mediaType === 'photo' ? 'photo' : 'video';
    if (msg.senderId === user.id) return { label: `You sent a ${kind}` };
    return { label: `${msg.senderUsername} sent a ${kind}` };
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
        data={rows}
        keyExtractor={(item) => item.kind + item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.textPrimary}
          />
        }
        renderItem={({ item }) => {
          if (item.kind === 'group') {
            const status = getGroupStatus(item);
            return (
              <Pressable
                style={({ pressed }) => pressed ? styles.rowPressed : null}
                onPress={() =>
                  router.push(
                    item.unread
                      ? `/(app)/chat/group/${item.id}?autoOpen=true`
                      : `/(app)/chat/group/${item.id}`,
                  )
                }>
                <View style={styles.rowInner}>
                  <View style={[styles.avatar, styles.groupAvatar, item.unread && styles.avatarUnread]}>
                    <GroupIcon />
                  </View>

                  <View style={styles.rowBody}>
                    <Text style={[styles.rowUsername, item.unread && styles.rowUsernameBold]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.rowStatus, item.unread && styles.rowStatusUnread]} numberOfLines={1}>
                      {status.label}
                    </Text>
                  </View>

                  <View style={styles.rowRight}>
                    <Text style={styles.rowTime}>{relativeTime(item.lastActivityAt)}</Text>
                    {item.unread && <View style={styles.unreadMark} />}
                  </View>

                  <Pressable
                    onPress={() => router.push(`/(app)/chat/group/${item.id}`)}
                    hitSlop={10}
                    style={styles.timelineBtn}>
                    <TimelineIcon />
                  </Pressable>
                </View>
              </Pressable>
            );
          }

          // DM row
          const status = getDmStatus(item);
          const initial = item.otherUser.username.charAt(0).toUpperCase();
          const presenceLabel = formatPresence(presence[item.otherUser.id] ?? null);
          const isActive = presenceLabel === 'Active now';

          return (
            <Pressable
              style={({ pressed }) => pressed ? styles.rowPressed : null}
              onPress={() =>
                router.push(
                  status.unread
                    ? `/(app)/chat/${item.id}?autoOpen=true`
                    : `/(app)/chat/${item.id}`,
                )
              }>
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

                <Pressable
                  onPress={() => router.push(`/(app)/chat/${item.id}`)}
                  hitSlop={10}
                  style={styles.timelineBtn}>
                  <TimelineIcon />
                </Pressable>
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
        contentContainerStyle={rows.length === 0 ? styles.listEmpty : styles.listContent}
      />
    </SafeAreaView>
  );
}

function GroupIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M13 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke={colors.accentDark} strokeWidth={1.4} />
      <Path d="M1 17c0-3.3 2.7-6 6-6M9 17c0-3.3 2.7-6 6-6" stroke={colors.accentDark} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

// Three horizontal lines = message timeline / history
function TimelineIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M4 5h12M4 10h12M4 15h8" stroke={colors.textTertiary} strokeWidth={1.5} strokeLinecap="square" />
    </Svg>
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
  groupAvatar: {
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
  timelineBtn: {
    paddingLeft: spacing.sm,
    paddingVertical: 4,
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
