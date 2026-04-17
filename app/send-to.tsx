import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { useMediaStore } from '@/lib/store/media';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';
import { BackArrow, SearchIcon } from '@/components/icons';

// Note: Snapchat's send-to screen loads the friend list from a local cache
// and syncs in the background. We query Supabase directly on mount — fast
// enough given friend lists are small, and simpler than caching for v1.

type Friend = {
  id: string;
  username: string;
};

export default function SendToScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { pendingUri, pendingType, clearPending } = useMediaStore();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [recents, setRecents] = useState<Friend[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Load accepted friendships and join to users table for display names
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `id, requester_id, addressee_id,
         requester:users!friendships_requester_id_fkey(id, username),
         addressee:users!friendships_addressee_id_fkey(id, username)`,
      )
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');

    if (!error && data) {
      const list: Friend[] = data.map((row: any) => {
        const other =
          row.requester_id === user.id ? row.addressee : row.requester;
        return { id: other.id, username: other.username };
      });
      setFriends(list);

      // Load recents: friends from the last 5 conversations
      const { data: convData } = await supabase
        .from('conversations')
        .select('user_id_1, user_id_2')
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
        .order('last_activity_at', { ascending: false })
        .limit(5);

      if (convData) {
        const recentIds = convData.map((c: any) =>
          c.user_id_1 === user.id ? c.user_id_2 : c.user_id_1,
        );
        const recentFriends = list.filter((f) => recentIds.includes(f.id));
        setRecents(recentFriends);
      }
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!pendingUri) router.back();
    loadFriends();
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!user || !pendingUri || !pendingType || selected.size === 0) return;
    setSending(true);

    try {
      // 1. Upload media to Supabase Storage
      const ext = pendingType === 'video' ? 'mp4' : 'jpg';
      const storagePath = `${user.id}/${Date.now()}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(pendingUri, {
        encoding: 'base64',
      });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('messages')
        .upload(storagePath, bytes, {
          contentType: pendingType === 'video' ? 'video/mp4' : 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('messages')
        .getPublicUrl(storagePath);
      const mediaUrl = urlData.publicUrl;

      // 2. For each selected recipient: find or create conversation, then create message
      await Promise.all(
        [...selected].map(async (recipientId) => {
          // Note: conversations are keyed by sorted user IDs to avoid duplicates
          const [uid1, uid2] = [user.id, recipientId].sort();

          let conversationId: string;

          const { data: existing } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id_1', uid1)
            .eq('user_id_2', uid2)
            .maybeSingle();

          if (existing) {
            conversationId = existing.id;
            await supabase
              .from('conversations')
              .update({ last_activity_at: new Date().toISOString() })
              .eq('id', conversationId);
          } else {
            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({ user_id_1: uid1, user_id_2: uid2 })
              .select('id')
              .single();
            if (convError) throw convError;
            conversationId = newConv.id;
          }

          await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: user.id,
            media_url: mediaUrl,
            media_type: pendingType,
          });
        }),
      );

      clearPending();
      // Per confirmed UX: land on conversations list after send
      router.replace('/(app)/chat');
    } catch (err) {
      console.error('Send failed:', err);
      setSending(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? friends.filter((f) => f.username.toLowerCase().includes(q)) : friends;
  }, [friends, query]);

  const initials = (username: string) => username[0]?.toUpperCase() ?? '?';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <BackArrow />
        </Pressable>
        <Text style={styles.title}>Send To</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <SearchIcon />
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No friends yet.</Text>
          <Text style={styles.emptySubText}>Add friends from the Friends tab.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            recents.length > 0 && !query ? (
              <>
                {/* Recents — horizontal scroll, PRD §11.5 */}
                <Text style={styles.sectionLabel}>RECENTS</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentsRow}
                  style={styles.recentsList}>
                  {recents.map((f) => (
                    <Pressable
                      key={f.id}
                      style={styles.recentItem}
                      onPress={() => toggleSelect(f.id)}>
                      <View
                        style={[
                          styles.avatar,
                          selected.has(f.id) && styles.avatarSelected,
                        ]}>
                        <Text style={styles.avatarText}>{initials(f.username)}</Text>
                      </View>
                      <Text style={styles.recentName} numberOfLines={1}>
                        {f.username}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
                  FRIENDS
                </Text>
              </>
            ) : null
          }
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <Pressable
                style={[styles.friendRow, isSelected && styles.friendRowSelected]}
                onPress={() => toggleSelect(item.id)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(item.username)}</Text>
                </View>
                <Text style={styles.friendName}>{item.username}</Text>
                <View
                  style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <CheckIcon />}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Sticky send button — only visible when something is selected */}
      {selected.size > 0 && (
        <View style={styles.sendBar}>
          <View style={styles.countBubble}>
            <Text style={styles.countText}>{selected.size}</Text>
          </View>
          <Pressable
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={sending}>
            {sending ? (
              <ActivityIndicator color={colors.accentDark} />
            ) : (
              <Text style={styles.sendBtnText}>Send →</Text>
            )}
          </Pressable>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Polyline
        points="2,7 6,11 12,3"
        stroke={colors.accentDark}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  backBtn: { width: 36, alignItems: 'flex-start' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
  },
  headerRight: { width: 36 },

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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.headline,
    color: colors.textPrimary,
  },
  emptySubText: { fontSize: fontSize.body, color: colors.textSecondary },

  listContent: { paddingBottom: 120 },

  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.label,
    color: colors.textSecondary,
    letterSpacing: fontSize.label * 0.08,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },

  // Recents — horizontal scroll row
  recentsList: { marginBottom: spacing.sm },
  recentsRow: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  recentItem: { alignItems: 'center', gap: spacing.xs, width: 56 },
  recentName: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Avatar circle
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarSelected: { borderColor: colors.accent },
  avatarText: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
  },

  // Friends list row
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    gap: spacing.md,
    borderRadius: radius.card,
    marginHorizontal: spacing.sm,
  },
  friendRowSelected: {
    // PRD §11.5: subtle yellow tint on selected row
    backgroundColor: `${colors.accent}1A`,
  },
  friendName: {
    flex: 1,
    fontSize: fontSize.headline,
    fontWeight: fontWeight.headline,
    color: colors.textPrimary,
  },

  // Radio circle
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  // Sticky send bar — PRD §11.5
  sendBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  countBubble: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.button,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    color: '#fff',
    fontSize: fontSize.label,
    fontWeight: fontWeight.label,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: {
    fontSize: fontSize.headline,
    fontWeight: fontWeight.title,
    color: colors.accentDark,
  },
});
