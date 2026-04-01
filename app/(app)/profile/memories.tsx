import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, fontWeight } from '@/tokens';

// Placeholder — Memories Album will be built alongside the heart/save feature.
export default function MemoriesScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Memories</Text>
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
});
