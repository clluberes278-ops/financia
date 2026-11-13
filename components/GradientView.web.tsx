import React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

interface Props extends ViewProps {
  colors: [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export default function GradientView({ colors, start = { x: 0, y: 0 }, end = { x: 1, y: 0 }, style, ...props }: Props) {
  const angle = 90 - Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  const gradient: ViewStyle & { backgroundImage: string } = {
    ...StyleSheet.flatten(style),
    backgroundColor: colors[0],
    backgroundImage: `linear-gradient(${angle}deg, ${colors.join(', ')})`,
  };
  return <View {...props} style={gradient} />;
}
