import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, letterSpacing, lineHeight, spacing } from '@/tokens';

const H_PAD = 28;

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const username: string =
    (user?.user_metadata?.username as string) ?? user?.email?.split('@')[0] ?? '…';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Title + rule */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>PROFILE</Text>
        <View style={styles.headerRule} />
      </View>

      {/* Identity block */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{username[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={styles.heroText}>
          <Text style={styles.displayName}>{username}</Text>
          <Text style={styles.usernameLabel}>@{username}</Text>
        </View>
      </View>

      <View style={styles.sectionRule} />

      {/* Navigation rows — Pressable only carries press state, View carries layout */}
      <Pressable
        style={({ pressed }) => pressed ? styles.rowPressed : null}
        onPress={() => router.push('/(app)/friends')}>
        <View style={styles.rowInner}>
          <Text style={styles.rowLabel}>FRIENDS</Text>
          <Text style={styles.rowArrow}>→</Text>
        </View>
      </Pressable>
      <View style={styles.rowRule} />

      <Pressable
        style={({ pressed }) => pressed ? styles.rowPressed : null}
        onPress={() => router.push('/(app)/profile/memories')}>
        <View style={styles.rowInner}>
          <Text style={styles.rowLabel}>MEMORIES</Text>
          <Text style={styles.rowArrow}>→</Text>
        </View>
      </Pressable>
      <View style={styles.rowRule} />

      <Pressable
        style={({ pressed }) => pressed ? styles.rowPressed : null}
        onPress={() => router.push('/(app)/profile/settings')}>
        <View style={styles.rowInner}>
          <Text style={styles.rowLabel}>SETTINGS</Text>
          <Text style={styles.rowArrow}>→</Text>
        </View>
      </Pressable>
      <View style={styles.rowRule} />

      <Text style={styles.version}>PIXOBOT · V1.0.0</Text>
    </SafeAreaView>
  );
}

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

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: H_PAD,
    paddingVertical: spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: fontSize.display,
    fontWeight: fontWeight.display,
    color: colors.accentDark,
    lineHeight: fontSize.display * lineHeight.display,
  },
  heroText: {
    gap: 4,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  usernameLabel: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },

  sectionRule: {
    height: 1.5,
    backgroundColor: colors.borderStrong,
    marginHorizontal: H_PAD,
    marginBottom: 0,
  },

  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingVertical: 26,
  },
  rowLabel: {
    fontSize: fontSize.headline,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    letterSpacing: letterSpacing.caps,
  },
  rowArrow: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  rowRule: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: H_PAD,
  },

  version: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.label,
    color: colors.textTertiary,
    letterSpacing: letterSpacing.caps,
    textAlign: 'center',
    marginTop: 'auto',
    paddingBottom: spacing.screen,
  },
});
