import { Stack } from 'expo-router';

// Stack navigator for the Chat tab — allows pushing from
// the conversations list (index) into a thread ([id]).
export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
