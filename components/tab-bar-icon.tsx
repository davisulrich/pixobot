import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

// Note: Custom SVG icons at 22px / 1.5px stroke — matches PRD Section 11.6.
// Using react-native-svg primitives for crisp rendering at all densities.

type IconName = 'chat' | 'camera' | 'profile';

interface Props {
  name: IconName;
  color: string;
  size?: number;
}

export function TabBarIcon({ name, color, size = 22 }: Props) {
  return (
    <View style={styles.container}>
      {name === 'chat' && (
        <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
          <Path
            d="M4 4h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 4V5a1 1 0 0 1 1-1z"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
      {name === 'camera' && (
        <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
          <Path
            d="M2 7.5A1.5 1.5 0 0 1 3.5 6h1.382a1.5 1.5 0 0 0 1.342-.83L7 4h8l.776 1.17A1.5 1.5 0 0 0 17.118 6H18.5A1.5 1.5 0 0 1 20 7.5v10A1.5 1.5 0 0 1 18.5 19h-15A1.5 1.5 0 0 1 2 17.5v-10z"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={11} cy={13} r={3} stroke={color} strokeWidth={1.5} />
        </Svg>
      )}
      {name === 'profile' && (
        <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
          <Circle cx={11} cy={8} r={3.5} stroke={color} strokeWidth={1.5} />
          <Path
            d="M4 19c0-3.866 3.134-7 7-7h0c3.866 0 7 3.134 7 7"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
