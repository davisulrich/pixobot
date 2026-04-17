import Svg, { Path } from 'react-native-svg';
import { colors } from '@/tokens';

export function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path
        d="M14 4l-7 7 7 7"
        stroke={colors.textPrimary}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM16 16l-3.5-3.5"
        stroke={colors.textTertiary}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ClearIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M4 4l10 10M14 4L4 14"
        stroke={colors.textTertiary}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}
