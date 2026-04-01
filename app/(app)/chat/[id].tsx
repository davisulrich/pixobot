import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, fontWeight } from '@/tokens';

// Placeholder — Message thread viewer will be built after send flow.
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Conversation</Text>
      <Text style={styles.sub}>{id}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.title,
    color: colors.textPrimary,
    marginTop: 16,
  },
  sub: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
