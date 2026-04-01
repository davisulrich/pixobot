import { Stack } from 'expo-router';

// Stack navigator for the Profile tab — allows pushing from
// profile index into memories or settings sub-screens.
export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
