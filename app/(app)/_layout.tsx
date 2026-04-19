import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarIcon } from '@/components/tab-bar-icon';
import { usePresencePing } from '@/lib/hooks/usePresencePing';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import { useAuthStore } from '@/lib/store/auth';
import { colors, fontSize, letterSpacing, spacing } from '@/tokens';

const TAB_LABELS: Record<string, string> = {
  chat: 'CHATS',
  camera: 'CAMERA',
  profile: 'PROFILE',
};

function EditorialTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  if (state.routes[state.index].name === 'camera') return null;

  const visibleRoutes = state.routes.filter(
    (route: any) => !!descriptors[route.key].options.tabBarIcon,
  );

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
      <View style={styles.bar}>
      {visibleRoutes.map((route: any) => {
        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index]?.key === route.key;
        const color = isFocused ? colors.textPrimary : colors.textTertiary;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable key={route.key} style={styles.tab} onPress={onPress} hitSlop={8}>
            {options.tabBarIcon?.({ focused: isFocused, color, size: 18 })}
            <Text style={[styles.tabLabel, { color }]}>
              {TAB_LABELS[route.name] ?? route.name.toUpperCase()}
            </Text>
            {isFocused && <View style={styles.activeBar} />}
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  usePresencePing(user?.id);
  usePushNotifications(user?.id);

  // When user logs out, user/session go null before the root layout's useEffect
  // can redirect. Returning null here unmounts all (app) screens immediately,
  // preventing any child component from accessing user.id on a null user.
  if (!user) return null;

  return (
    <Tabs
      initialRouteName="camera"
      tabBar={(props) => <EditorialTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="chat"
        options={{
          tabBarIcon: ({ color }) => <TabBarIcon name="chat" color={color} />,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          tabBarIcon: ({ color }) => <TabBarIcon name="camera" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => <TabBarIcon name="profile" color={color} />,
        }}
      />
      <Tabs.Screen name="friends" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: spacing.xl,
    right: spacing.xl,
    alignItems: 'stretch',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    paddingTop: 10,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: fontSize.label,
    fontWeight: '700',
    letterSpacing: letterSpacing.caps,
  },
  activeBar: {
    position: 'absolute',
    top: -10,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: colors.textPrimary,
  },
});
