import React from 'react';
import type { ViewProps } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface GradientViewProps extends ViewProps {
  colors: [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export default function GradientView({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 0 },
  style,
  children,
  ...props
}: GradientViewProps) {
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
