import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarIcon } from '@/components/tab-bar-icon';
import { colors, radius, shadow, spacing } from '@/tokens';

// Note: Custom floating pill tab bar — matches the PRD design exactly.
// Snapchat uses a similar floating bottom nav; we implement it as a custom tabBar render prop.

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  // Camera is full-bleed — no tab bar overlay, matching the PRD spec.
  // Users return to camera by tapping its icon from chat or profile.
  if (state.routes[state.index].name === 'camera') return null;

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.pill}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

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
              {options.tabBarIcon?.({
                focused: isFocused,
                color: isFocused ? colors.accent : colors.textSecondary,
                size: 24,
              })}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppLayout() {
  return (
    <Tabs
      initialRouteName="camera"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="chat"
        options={{
          tabBarIcon: ({ color }) => <TabBarIcon name="chat" color={color} />,
        }}
      />
      {/* camera is now a flat file (camera.tsx) so the route name is exactly "camera" */}
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
      {/* friends is pushed from Profile — not a visible tab */}
      <Tabs.Screen name="friends" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.navPill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xxl,
    ...shadow.navPill,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
});
