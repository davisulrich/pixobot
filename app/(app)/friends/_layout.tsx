import { Stack } from 'expo-router';

// Friends is not a tab — it's pushed from the Profile screen.
// The Stack wrapper makes 'friends' a proper named route so Expo Router
// doesn't surface 'friends/index' as a mystery flat tab entry.
export default function FriendsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
