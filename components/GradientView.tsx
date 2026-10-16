import React from 'react';
import { Platform, View, type ViewProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GradientViewProps extends ViewProps {
  colors: [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

function getGradientAngle(start?: { x: number; y: number }, end?: { x: number; y: number }): string {
  if (!start || !end) return '90deg';
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
  return `${Math.round(angle)}deg`;
}

export default function GradientView({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 0 },
  style,
  children,
  ...props
}: GradientViewProps) {
  if (Platform.OS === 'web') {
    const css = `linear-gradient(${getGradientAngle(start, end)}, ${colors.join(', ')})`;
    const webStyle = {
      ...(style as object),
      backgroundImage: css,
      backgroundColor: colors[0],
      backgroundBlendMode: 'normal',
    } as ViewStyle & { backgroundImage: string; backgroundBlendMode: string };
    return (
      <View {...props} style={webStyle}>
        {children}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={colors}
      start={start}
      end={end}
      style={style}
      {...props}
    >
      {children}
    </LinearGradient>
  );
}
