import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconName = 'chat' | 'camera' | 'profile';

interface Props {
  name: IconName;
  color: string;
  size?: number;
}

// Geometric, architectural stroke icons — 2px stroke, square caps/joins
export function TabBarIcon({ name, color, size = 20 }: Props) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {name === 'chat' && (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <Path
            d="M2 2h16v12H6L2 18V2z"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="miter"
            strokeLinecap="square"
          />
        </Svg>
      )}
      {name === 'camera' && (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <Rect x={1} y={5} width={18} height={13} stroke={color} strokeWidth={2} />
          <Circle cx={10} cy={11.5} r={3.5} stroke={color} strokeWidth={2} />
          <Path d="M6 5V3h4l2 2" stroke={color} strokeWidth={2} strokeLinejoin="miter" strokeLinecap="square" />
        </Svg>
      )}
      {name === 'profile' && (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <Rect x={6} y={1} width={8} height={8} stroke={color} strokeWidth={2} />
          <Path
            d="M1 19c0-4 4-7 9-7s9 3 9 7"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </Svg>
      )}
    </View>
  );
}
