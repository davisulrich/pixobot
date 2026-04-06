import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';

// Note: We load all users once on mount and filter client-side. This is fine
// for a small close-friends app — avoids the debounce/network lag of per-keystroke queries.

type Relationship = {
  friendshipId: string;
  status: 'accepted' | 'pending_sent' | 'pending_received';
};

type UserRow = {
  id: string;
  username: string;
  relationship: Relationship | null;
};

export default function FriendsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [actionPending, setActionPending] = useState<string | null>(null);

  // ── Load all users + my friendships in one go ────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: usersData }, { data: friendsData }] = await Promise.all([
      supabase
        .from('users')
        .select('id, username')
        .neq('id', user.id)
        .order('username', { ascending: true }),
      supabase
        .from('friendships')
        .select('id, status, requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .in('status', ['accepted', 'pending']),
    ]);

    // Build a map of userId → relationship for O(1) lookup
    const relMap = new Map<string, Relationship>();
    (friendsData ?? []).forEach((row: any) => {
      const iRequested = row.requester_id === user.id;
      const otherId = iRequested ? row.addressee_id : row.requester_id;
      let status: Relationship['status'];
      if (row.status === 'accepted') status = 'accepted';
      else if (iRequested) status = 'pending_sent';
      else status = 'pending_received';
      relMap.set(otherId, { friendshipId: row.id, status });
    });

    const rows: UserRow[] = (usersData ?? []).map((u: any) => ({
      id: u.id,
      username: u.username,
      relationship: relMap.get(u.id) ?? null,
    }));

    setAllUsers(rows);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('friends-screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // ── Client-side filter + section split ──────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allUsers.filter((u) => u.username.includes(q)) : allUsers;
  }, [allUsers, query]);

  const requests = filtered.filter((u) => u.relationship?.status === 'pending_received');
  const pending  = filtered.filter((u) => u.relationship?.status === 'pending_sent');
  const others   = filtered.filter((u) => u.relationship?.status !== 'pending_received' && u.relationship?.status !== 'pending_sent');

  const sections = [
    ...(requests.length ? [{ title: 'REQUESTS', data: requests }] : []),
    ...(pending.length  ? [{ title: 'PENDING',  data: pending  }] : []),
    ...(others.length   ? [{ title: 'ALL USERS', data: others  }] : []),
  ];

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function sendRequest(toUserId: string) {
    setActionPending(toUserId);
    const { error } = await supabase.from('friendships').insert({
      requester_id: user!.id,
      addressee_id: toUserId,
      status: 'pending',
    });
    if (error) Alert.alert('Error', 'Could not send friend request.');
    await load();
    setActionPending(null);
  }

  async function acceptRequest(friendshipId: string, fromUserId: string) {
    setActionPending(fromUserId);
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    await load();
    setActionPending(null);
  }

  async function removeOrCancel(friendshipId: string, otherUserId: string) {
    setActionPending(otherUserId);
    await supabase.from('friendships').delete().eq('id', friendshipId);
    await load();
    setActionPending(null);
  }

  const initials = (u: string) => u[0]?.toUpperCase() ?? '?';

  // ── Row renderer ─────────────────────────────────────────────────────────────

  function renderUser({ item }: { item: UserRow }) {
    const rel = item.relationship;
    const isPending = actionPending === item.id;

    let action: React.ReactNode;
    if (isPending) {
      action = <ActivityIndicator color={colors.accent} />;
    } else if (!rel) {
      // No relationship — plus icon to add
      action = (
        <Pressable style={styles.addBtn} onPress={() => sendRequest(item.id)} hitSlop={8}>
          <PlusIcon />
        </Pressable>
      );
    } else if (rel.status === 'pending_received') {
      // Incoming request — Accept + Decline
      action = (
        <View style={styles.requestActions}>
          <Pressable
            style={styles.declineBtn}
            onPress={() => removeOrCancel(rel.friendshipId, item.id)}>
            <Text style={styles.declineBtnText}>Decline</Text>
          </Pressable>
          <Pressable
            style={styles.acceptBtn}
            onPress={() => acceptRequest(rel.friendshipId, item.id)}>
            <Text style={styles.acceptBtnText}>Accept</Text>
          </Pressable>
        </View>
      );
    } else if (rel.status === 'pending_sent') {
      // Sent — tappable "Sent" badge to cancel
      action = (
        <Pressable
          style={styles.sentBadge}
          onPress={() => removeOrCancel(rel.friendshipId, item.id)}>
          <Text style={styles.sentBadgeText}>Sent · Cancel</Text>
        </Pressable>
      );
    } else {
      // Already friends — checkmark + remove on long press
      action = (
        <Pressable
          hitSlop={8}
          onPress={() =>
            Alert.alert('Remove Friend', `Remove ${item.username}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => removeOrCancel(rel.friendshipId, item.id),
              },
            ])
          }>
          <CheckBadge />
        </Pressable>
      );
    }

    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.username)}</Text>
        </View>
        <Text style={styles.rowName}>{item.username}</Text>
        {action}
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <BackArrow />
        </Pressable>
        <Text style={styles.title}>Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <SearchIcon />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by username…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <ClearIcon />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : allUsers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No other users yet</Text>
          <Text style={styles.emptyBody}>Invite a friend to join Pixobot!</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyBody}>No users matching "{query}"</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionLabel}>{section.title}</Text>
          )}
        />
      )}

    </SafeAreaView>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path d="M14 4l-7 7 7 7" stroke={colors.textPrimary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM16 16l-3.5-3.5" stroke={colors.textTertiary} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function ClearIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M4 4l10 10M14 4L4 14" stroke={colors.textTertiary} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M10 4v12M4 10h12" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CheckBadge() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path d="M11 21a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke={colors.accent} strokeWidth={1.5} />
      <Polyline points="7,11 10,14 15,8" stroke={colors.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 36 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 36 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.input,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
  },

  listContent: { paddingBottom: spacing.screen },

  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.label,
    color: colors.textSecondary,
    letterSpacing: fontSize.label * 0.08,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.md,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
  },

  rowName: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: fontWeight.body,
    color: colors.textPrimary,
  },

  // + add button
  addBtn: {
    padding: spacing.xs,
  },

  // Accept / Decline pair
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  acceptBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  acceptBtnText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.title,
    color: colors.accentDark,
  },
  declineBtn: {
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  declineBtnText: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },

  // Sent badge (tappable to cancel)
  sentBadge: {
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sentBadgeText: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
});
