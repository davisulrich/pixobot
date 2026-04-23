import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, fontWeight, radius, spacing } from '@/tokens';

// Note: Supabase Auth doesn't have a first-class "username" field — we store it
// in raw_user_meta_data. Changing username updates both auth metadata and the
// public.users table, matching the pattern set at signup.

type Panel = null | 'username' | 'password';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [panel, setPanel] = useState<Panel>(null);

  // Username change
  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const currentUsername: string =
    (user?.user_metadata?.username as string) ?? user?.email?.split('@')[0] ?? '';

  // ── Username change ──────────────────────────────────────────────────────────

  async function handleUsernameChange() {
    if (!user) return;
    const trimmed = newUsername.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed === currentUsername) {
      Alert.alert('No change', 'That is already your username.');
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
      Alert.alert('Invalid username', 'Usernames must be 3–20 characters: letters, numbers, underscores only.');
      return;
    }

    setUsernameLoading(true);

    // Check uniqueness
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', trimmed)
      .maybeSingle();

    if (existing) {
      Alert.alert('Taken', 'That username is already in use.');
      setUsernameLoading(false);
      return;
    }

    // Update public.users
    const { error: dbErr } = await supabase
      .from('users')
      .update({ username: trimmed })
      .eq('id', user.id);

    if (dbErr) {
      Alert.alert('Error', 'Could not update username. Try again.');
      setUsernameLoading(false);
      return;
    }

    // Update auth metadata so the app picks it up everywhere
    await supabase.auth.updateUser({ data: { username: trimmed } });

    setUsernameLoading(false);
    setNewUsername('');
    setPanel(null);
    Alert.alert('Done', `Your username is now @${trimmed}.`);
  }

  // ── Password change ──────────────────────────────────────────────────────────

  async function handlePasswordChange() {
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords don\'t match.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }

    setPasswordLoading(true);

    // Re-authenticate by signing in with current password first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: `${currentUsername}@pixobot.internal`,
      password: currentPassword,
    });

    if (signInErr) {
      Alert.alert('Wrong password', 'Your current password is incorrect.');
      setPasswordLoading(false);
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });

    setPasswordLoading(false);

    if (updateErr) {
      Alert.alert('Error', 'Could not update password. Try again.');
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPanel(null);
    Alert.alert('Done', 'Your password has been updated.');
  }

  // ── Log out ──────────────────────────────────────────────────────────────────

  function handleLogOut() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          // Auth state change fires → root layout redirects to login
        },
      },
    ]);
  }

  // ── Delete account ───────────────────────────────────────────────────────────

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Are you sure?',
              'Type DELETE in the next step to confirm.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete my account',
                  style: 'destructive',
                  onPress: async () => {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await supabase.functions.invoke('delete-account', {
                      headers: { Authorization: `Bearer ${session?.access_token}` },
                    });
                    if (res.error) {
                      Alert.alert('Error', 'Could not delete account. Please try again.');
                      return;
                    }
                    await supabase.auth.signOut();
                    Alert.alert('Account deleted', 'Your account has been removed.');
                  },
                },
              ],
            ),
        },
      ],
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
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Account card */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>

          {/* Username */}
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setPanel(panel === 'username' ? null : 'username')}>
            <Text style={styles.rowLabel}>Username</Text>
            <Text style={styles.rowValue}>@{currentUsername}</Text>
            <ChevronIcon rotated={panel === 'username'} />
          </Pressable>

          {panel === 'username' && (
            <View style={styles.expandedPanel}>
              <TextInput
                style={styles.input}
                placeholder="New username"
                placeholderTextColor={colors.textTertiary}
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <Pressable
                style={[styles.saveBtn, (!newUsername.trim() || usernameLoading) && styles.saveBtnDisabled]}
                onPress={handleUsernameChange}
                disabled={!newUsername.trim() || usernameLoading}>
                {usernameLoading
                  ? <ActivityIndicator color={colors.accentDark} />
                  : <Text style={styles.saveBtnText}>Save</Text>}
              </Pressable>
            </View>
          )}

          <View style={styles.divider} />

          {/* Password */}
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setPanel(panel === 'password' ? null : 'password')}>
            <Text style={styles.rowLabel}>Password</Text>
            <Text style={styles.rowValue}>••••••••</Text>
            <ChevronIcon rotated={panel === 'password'} />
          </Pressable>

          {panel === 'password' && (
            <View style={styles.expandedPanel}>
              <TextInput
                style={styles.input}
                placeholder="Current password"
                placeholderTextColor={colors.textTertiary}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder="New password (min 8 chars)"
                placeholderTextColor={colors.textTertiary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <Pressable
                style={[styles.saveBtn, (!currentPassword || !newPassword || !confirmPassword || passwordLoading) && styles.saveBtnDisabled]}
                onPress={handlePasswordChange}
                disabled={!currentPassword || !newPassword || !confirmPassword || passwordLoading}>
                {passwordLoading
                  ? <ActivityIndicator color={colors.accentDark} />
                  : <Text style={styles.saveBtnText}>Update Password</Text>}
              </Pressable>
            </View>
          )}

        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>ACCOUNT ACTIONS</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, styles.actionRow, pressed && styles.rowPressed]}
            onPress={handleLogOut}>
            <Text style={[styles.rowLabel, styles.destructiveLabel]}>Log Out</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={({ pressed }) => [styles.row, styles.actionRow, pressed && styles.rowPressed]}
            onPress={handleDeleteAccount}>
            <Text style={[styles.rowLabel, styles.destructiveLabel]}>Delete Account</Text>
          </Pressable>
        </View>

      </ScrollView>
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

function ChevronIcon({ rotated }: { rotated?: boolean }) {
  return (
    <Svg
      width={16} height={16} viewBox="0 0 16 16" fill="none"
      style={{ transform: [{ rotate: rotated ? '90deg' : '0deg' }] }}>
      <Path d="M6 4l4 4-4 4" stroke={colors.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 36 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.headline,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 36 },

  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.screen },

  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.label,
    color: colors.textSecondary,
    letterSpacing: fontSize.label * 0.08,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 20,
    gap: spacing.sm,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  actionRow: { paddingVertical: 22 },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.headline,
    fontWeight: fontWeight.body,
    color: colors.textPrimary,
  },
  rowValue: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  destructiveLabel: { color: colors.destructive },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },

  // Inline edit panel
  expandedPanel: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.title,
    color: colors.accentDark,
  },
});
