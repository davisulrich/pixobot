import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';

// Note: Memories are messages the user hearted. We join memories → messages to
// get the media URL. Snapchat calls this "Memories"; we keep the same name.

const COLUMNS = 3;
const GAP = 4;
const CELL_SIZE = (Dimensions.get('window').width - GAP * (COLUMNS + 1)) / COLUMNS;

type Memory = {
  memoryId: string;
  messageId: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  savedAt: string;
};

// ─── Full-screen viewer ───────────────────────────────────────────────────────

function MemoryViewer({
  memory,
  onDismiss,
  onSave,
  onRemove,
}: {
  memory: Memory;
  onDismiss: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const player = useVideoPlayer(
    memory.mediaType === 'video' ? memory.mediaUrl : null,
    (p) => { p.loop = true; p.play(); },
  );

  return (
    <View style={styles.viewer}>
      {memory.mediaType === 'photo' ? (
        <Image
          source={{ uri: memory.mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      )}

      {/* Close button */}
      <SafeAreaView style={styles.viewerSafeArea} pointerEvents="box-none">
        <Pressable style={styles.closeBtn} onPress={onDismiss} hitSlop={12}>
          <CloseIcon />
        </Pressable>

        {/* Bottom actions */}
        <View style={styles.viewerActions}>
          <Pressable style={styles.viewerBtn} onPress={onSave}>
            <DownloadIcon />
            <Text style={styles.viewerBtnText}>Save to Photos</Text>
          </Pressable>
          <Pressable style={[styles.viewerBtn, styles.viewerBtnDestructive]} onPress={onRemove}>
            <TrashIcon />
            <Text style={[styles.viewerBtnText, styles.viewerBtnTextDestructive]}>Remove</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MemoriesScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Memory | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('memories')
      .select(`
        id,
        saved_at,
        message:messages!memories_message_id_fkey(id, media_url, media_type)
      `)
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });

    if (!error && data) {
      const rows: Memory[] = (data as any[])
        .filter((d) => d.message)
        .map((d) => ({
          memoryId: d.id,
          messageId: d.message.id,
          mediaUrl: d.message.media_url,
          mediaType: d.message.media_type,
          savedAt: d.saved_at,
        }));
      setMemories(rows);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(memory: Memory) {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow Photos access in Settings to save media.');
        return;
      }
      const ext = memory.mediaType === 'video' ? 'mp4' : 'jpg';
      const localUri = `${FileSystem.cacheDirectory}pixobot_save_${memory.messageId}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(memory.mediaUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Added to your Photos library.');
    } catch (e) {
      Alert.alert('Error', 'Could not save to Photos.');
    }
  }

  async function handleRemove(memory: Memory) {
    Alert.alert('Remove Memory', 'Remove this from your Memories? It won\'t be deleted from Photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setViewing(null);
          await supabase.from('memories').delete().eq('id', memory.memoryId);
          // Also un-heart the message so the chat thread reflects it
          await supabase.from('messages').update({ hearted: false }).eq('id', memory.messageId);
          setMemories((prev) => prev.filter((m) => m.memoryId !== memory.memoryId));
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <BackArrow />
        </Pressable>
        <Text style={styles.title}>Memories</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : memories.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No memories yet</Text>
          <Text style={styles.emptyBody}>
            Heart a snap in a conversation to save it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item.memoryId}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              onPress={() => setViewing(item)}>
              <Image
                source={{ uri: item.mediaUrl }}
                style={styles.cellImage}
                resizeMode="cover"
              />
              {item.mediaType === 'video' && (
                <View style={styles.videoBadge}>
                  <PlayIcon />
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={!!viewing}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewing(null)}>
        {viewing && (
          <MemoryViewer
            memory={viewing}
            onDismiss={() => setViewing(null)}
            onSave={() => handleSave(viewing)}
            onRemove={() => handleRemove(viewing)}
          />
        )}
      </Modal>
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

function CloseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path d="M4 4l14 14M18 4L4 18" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function DownloadIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M9 2v10M5 8l4 4 4-4" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M2 14h14" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M3 5h12M7 5V3h4v2M6 5v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V5" stroke={colors.destructive} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PlayIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path d="M4 2.5l8 4.5-8 4.5V2.5Z" fill="#fff" />
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.headline, fontWeight: fontWeight.title, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontSize: fontSize.body, color: colors.textSecondary, textAlign: 'center' },

  // Grid
  grid: { padding: GAP },
  row: { gap: GAP, marginBottom: GAP },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  cellPressed: { opacity: 0.85 },
  cellImage: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    padding: 3,
  },

  // Full-screen viewer
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerSafeArea: { ...StyleSheet.absoluteFillObject },
  closeBtn: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.button,
    padding: spacing.sm,
  },
  viewerActions: {
    position: 'absolute',
    bottom: spacing.screen,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  viewerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(42,34,24,0.85)',
    borderRadius: radius.chip,
    paddingHorizontal: spacing.lg,
    height: 50,
  },
  viewerBtnDestructive: { backgroundColor: 'rgba(42,34,24,0.85)' },
  viewerBtnText: { fontSize: fontSize.body, fontWeight: fontWeight.headline, color: '#fff' },
  viewerBtnTextDestructive: { color: colors.destructive },
});
