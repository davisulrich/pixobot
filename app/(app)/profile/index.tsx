import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';

// Temporary profile screen — full version built in Sprint 5.
// Provides just enough to navigate to Friends and not be a dead end.
export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Pull username from Supabase user_metadata (set at signup)
  const username: string =
    (user?.user_metadata?.username as string) ?? user?.email?.split('@')[0] ?? '…';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.screenTitle}>Profile</Text>

      <View style={styles.nameBlock}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{username[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text style={styles.displayName}>{username}</Text>
        <Text style={styles.usernameLabel}>@{username}</Text>
      </View>

      {/* Settings card — friends entry point + placeholders for Sprint 5 */}
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/(app)/friends')}>
          <PeopleIcon />
          <Text style={styles.rowLabel}>Friends</Text>
          <ChevronIcon />
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/(app)/profile/memories')}>
          <MemoriesIcon />
          <Text style={styles.rowLabel}>Memories</Text>
          <ChevronIcon />
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/(app)/profile/settings')}>
          <SettingsIcon />
          <Text style={styles.rowLabel}>Settings</Text>
          <ChevronIcon />
        </Pressable>
      </View>

      <Text style={styles.version}>PIXOBOT · V1.0.0</Text>
    </SafeAreaView>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PeopleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M13 11c2.5.5 4 2 4 4v1H3v-1c0-2 1.5-3.5 4-4"
        stroke={colors.textPrimary}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke={colors.textPrimary}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function MemoriesIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 17S3 12.5 3 7.5a4 4 0 0 1 7-2.65A4 4 0 0 1 17 7.5C17 12.5 10 17 10 17Z"
        stroke={colors.textPrimary}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SettingsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke={colors.textPrimary}
        strokeWidth={1.5}
      />
      <Path
        d="M17 10a7.4 7.4 0 0 0-.1-1.1l1.8-1.4-1.8-3.1-2.2.9a7 7 0 0 0-1.9-1.1L12.5 2h-3l-.3 2.2A7 7 0 0 0 7.3 5.3l-2.2-.9L3.3 7.5l1.8 1.4A7.4 7.4 0 0 0 5 10c0 .4 0 .7.1 1.1L3.3 12.5l1.8 3.1 2.2-.9a7 7 0 0 0 1.9 1.1L9.5 18h3l.3-2.2a7 7 0 0 0 1.9-1.1l2.2.9 1.8-3.1-1.8-1.4c.1-.4.1-.7.1-1.1Z"
        stroke={colors.textPrimary}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronIcon({ muted }: { muted?: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path
        d="M6 4l4 4-4 4"
        stroke={muted ? colors.textTertiary : colors.textSecondary}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  screenTitle: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  nameBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: {
    fontSize: fontSize.display,
    fontWeight: fontWeight.display,
    color: colors.accentDark,
  },
  displayName: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
  },
  usernameLabel: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },

  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    gap: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: fontWeight.body,
    color: colors.textPrimary,
  },
  rowLabelMuted: { color: colors.textTertiary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 20 + spacing.md, // indent past icon
  },

  version: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.label,
    color: colors.textTertiary,
    letterSpacing: fontSize.label * 0.08,
    textAlign: 'center',
    marginTop: 'auto',
    paddingBottom: spacing.screen,
  },
});
