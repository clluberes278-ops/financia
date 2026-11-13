import React, { forwardRef } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import glyphMap from '@react-native-vector-icons/material-design-icons/glyphmaps/MaterialDesignIcons.json';

interface IconProps extends TextProps {
  name: keyof typeof glyphMap;
  size?: number;
  color?: string;
}

// index.web.js registers this font using the browser FontFace API.
// Web uses text glyphs only; it does not need native image generation or Expo font loading.
export const MaterialDesignIcons = forwardRef<Text, IconProps>(function MaterialDesignIcons(
  { name, size = 12, color = '#000000', style, children, allowFontScaling = false, ...props }, ref,
) {
  const codePoint = glyphMap[name];
  return (
    <Text
      {...props}
      ref={ref}
      selectable={false}
      allowFontScaling={allowFontScaling}
      style={[{ fontSize: size, color }, style, styles.font]}
    >
      {codePoint === undefined ? '?' : String.fromCodePoint(codePoint)}{children}
    </Text>
  );
});

const styles = StyleSheet.create({
  font: { fontFamily: 'MaterialDesignIcons', fontWeight: 'normal', fontStyle: 'normal' },
});

export default MaterialDesignIcons;
