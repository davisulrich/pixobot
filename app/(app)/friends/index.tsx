import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { colors, fontSize, fontWeight, letterSpacing, radius, spacing } from '@/tokens';
import { BackArrow, ClearIcon, SearchIcon } from '@/components/icons';

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

  // Group creation state
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  // ── Load all users + my friendships ─────────────────────────────────────────

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

  const acceptedFriends = useMemo(
    () => allUsers.filter((u) => u.relationship?.status === 'accepted'),
    [allUsers],
  );

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function sendRequest(toUserId: string) {
    if (!user) return;
    setActionPending(toUserId);
    const { data, error } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: toUserId, status: 'pending' })
      .select('id')
      .single();
    if (error) {
      Alert.alert('Error', 'Could not send friend request.');
    } else {
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === toUserId
            ? { ...u, relationship: { friendshipId: data.id, status: 'pending_sent' } }
            : u,
        ),
      );
    }
    setActionPending(null);
  }

  async function acceptRequest(friendshipId: string, fromUserId: string) {
    setActionPending(fromUserId);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    if (!error) {
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === fromUserId
            ? { ...u, relationship: { friendshipId, status: 'accepted' } }
            : u,
        ),
      );
    }
    setActionPending(null);
  }

  async function removeOrCancel(friendshipId: string, otherUserId: string) {
    setActionPending(otherUserId);
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (!error) {
      setAllUsers((prev) =>
        prev.map((u) => (u.id === otherUserId ? { ...u, relationship: null } : u)),
      );
    }
    setActionPending(null);
  }

  async function createGroup() {
    if (!groupName.trim() || selectedGroupMembers.size === 0 || !user) return;
    setCreatingGroup(true);

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: groupName.trim(), created_by: user.id })
      .select('id')
      .single();

    if (error || !group) {
      console.error('createGroup error:', error);
      Alert.alert('Error', error?.message ?? 'Could not create group.');
      setCreatingGroup(false);
      return;
    }

    const memberRows = [
      { group_id: group.id, user_id: user.id },
      ...[...selectedGroupMembers].map((uid) => ({ group_id: group.id, user_id: uid })),
    ];

    await supabase.from('group_members').insert(memberRows);

    setGroupName('');
    setSelectedGroupMembers(new Set());
    setGroupModalVisible(false);
    setCreatingGroup(false);
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
      action = (
        <Pressable style={styles.addBtn} onPress={() => sendRequest(item.id)} hitSlop={8}>
          <PlusIcon />
        </Pressable>
      );
    } else if (rel.status === 'pending_received') {
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
      action = (
        <Pressable
          style={styles.sentBadge}
          onPress={() => removeOrCancel(rel.friendshipId, item.id)}>
          <Text style={styles.sentBadgeText}>Sent · Cancel</Text>
        </Pressable>
      );
    } else {
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

      {/* Make a Group button */}
      <Pressable
        style={styles.makeGroupBtn}
        onPress={() => setGroupModalVisible(true)}>
        <Text style={styles.makeGroupBtnText}>MAKE A GROUP</Text>
      </Pressable>

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

      {/* ── Make a Group modal ─────────────────────────────────────────────── */}
      <Modal
        visible={groupModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setGroupModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>

          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setGroupModalVisible(false)} hitSlop={12}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>NEW GROUP</Text>
            <Pressable
              onPress={createGroup}
              disabled={!groupName.trim() || selectedGroupMembers.size === 0 || creatingGroup}
              hitSlop={12}>
              {creatingGroup ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text
                  style={[
                    styles.modalCreate,
                    (!groupName.trim() || selectedGroupMembers.size === 0) && styles.modalCreateDisabled,
                  ]}>
                  Create
                </Text>
              )}
            </Pressable>
          </View>

          {/* Group name input */}
          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name…"
            placeholderTextColor={colors.textTertiary}
            value={groupName}
            onChangeText={setGroupName}
            autoCapitalize="words"
            returnKeyType="done"
          />

          {/* Friend selector */}
          {acceptedFriends.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyBody}>Add friends first to make a group.</Text>
            </View>
          ) : (
            <FlatList
              data={acceptedFriends}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSel = selectedGroupMembers.has(item.id);
                return (
                  <Pressable
                    style={[styles.row, isSel && styles.rowSelected]}
                    onPress={() => {
                      setSelectedGroupMembers((prev) => {
                        const next = new Set(prev);
                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                        return next;
                      });
                    }}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(item.username)}</Text>
                    </View>
                    <Text style={styles.rowName}>{item.username}</Text>
                    <View style={[styles.checkbox, isSel && styles.checkboxSelected]}>
                      {isSel && <TickIcon />}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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

function TickIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
      <Polyline points="2,6 5,9 10,3" stroke={colors.accentDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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

  makeGroupBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  makeGroupBtnText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.label,
    color: colors.textPrimary,
    letterSpacing: letterSpacing.caps,
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
  rowSelected: {
    backgroundColor: `${colors.accent}1A`,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.avatar,
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

  addBtn: { padding: spacing.xs },

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

  // ── Group modal ──────────────────────────────────────────────────────────────

  modalContainer: { flex: 1, backgroundColor: colors.bg },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalCancel: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
  modalTitle: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.label,
    color: colors.textPrimary,
    letterSpacing: letterSpacing.caps,
  },
  modalCreate: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.headline,
    color: colors.textPrimary,
  },
  modalCreateDisabled: {
    color: colors.textTertiary,
  },

  groupNameInput: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.headline,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
