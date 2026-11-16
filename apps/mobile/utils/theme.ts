import React from 'react';
import { Platform, StyleSheet, Text as NativeText, TextStyle, ViewStyle } from 'react-native';
import { AppFontFamily, AppTheme, CardColor, useSettingsStore } from '../store/useSettingsStore';

export const LIGHT_THEME = {
  background: '#F7F4FF',
  surface: '#FFFFFF',
  surfaceMuted: '#F1ECFF',
  border: '#E6DDF5',
  text: '#24113F',
  textSecondary: '#76658D',
  textMuted: '#9B8DAE',
  header: '#32145A',
  headerText: '#FFFFFF',
  income: '#009B79',
  expense: '#E83F68',
  warning: '#E58A22',
  heroStart: '#6D28D9',
  heroEnd: '#C026D3',
  heroText: '#FFFFFF',
};

export const DARK_THEME = {
  background: '#120C1D',
  surface: '#21162F',
  surfaceMuted: '#2D2040',
  border: '#433253',
  text: '#FFF9FF',
  textSecondary: '#D0C1DC',
  textMuted: '#A998B8',
  header: '#1A1028',
  headerText: '#F8FAFC',
  income: '#3BD6AF',
  expense: '#FF6B8C',
  warning: '#FFC15A',
  heroStart: '#7C3AED',
  heroEnd: '#D946EF',
  heroText: '#FFFFFF',
};

export type AppThemeColors = { [Key in keyof typeof LIGHT_THEME]: string };

export const CARD_COLOR_PALETTES: Record<CardColor, {
  label: string;
  gradient: [string, string];
  lightSurface: string;
  lightMuted: string;
  lightBorder: string;
  darkSurface: string;
  darkMuted: string;
  darkBorder: string;
}> = {
  violet: { label: 'Violeta', gradient: ['#6D28D9', '#C026D3'], lightSurface: '#FFFFFF', lightMuted: '#F1ECFF', lightBorder: '#E6DDF5', darkSurface: '#21162F', darkMuted: '#2D2040', darkBorder: '#433253' },
  pink: { label: 'Rosa', gradient: ['#BE185D', '#EC4899'], lightSurface: '#FFFFFF', lightMuted: '#FFF0F6', lightBorder: '#F5D4E2', darkSurface: '#2D1825', darkMuted: '#3B2030', darkBorder: '#573247' },
  blue: { label: 'Azul', gradient: ['#0369A1', '#06B6D4'], lightSurface: '#FFFFFF', lightMuted: '#EAF7FF', lightBorder: '#CDE7F5', darkSurface: '#152334', darkMuted: '#1D3044', darkBorder: '#30475D' },
  teal: { label: 'Verde', gradient: ['#047857', '#10B981'], lightSurface: '#FFFFFF', lightMuted: '#EAF8F2', lightBorder: '#CDEBDD', darkSurface: '#152720', darkMuted: '#1C362B', darkBorder: '#2F5142' },
  orange: { label: 'Naranja', gradient: ['#C2410C', '#F97316'], lightSurface: '#FFFFFF', lightMuted: '#FFF4E8', lightBorder: '#F2DDC6', darkSurface: '#302116', darkMuted: '#412C1C', darkBorder: '#61432B' },
  slate: { label: 'Grafito', gradient: ['#334155', '#64748B'], lightSurface: '#FFFFFF', lightMuted: '#F1F4F8', lightBorder: '#DCE2EA', darkSurface: '#1C2430', darkMuted: '#27313F', darkBorder: '#3C4858' },
};

export function getThemeColors(theme: AppTheme, cardColor: CardColor = 'violet'): AppThemeColors {
  const baseTheme = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
  const palette = CARD_COLOR_PALETTES[cardColor] ?? CARD_COLOR_PALETTES.violet;
  return {
    ...baseTheme,
    surface: theme === 'dark' ? palette.darkSurface : palette.lightSurface,
    surfaceMuted: theme === 'dark' ? palette.darkMuted : palette.lightMuted,
    border: theme === 'dark' ? palette.darkBorder : palette.lightBorder,
    heroStart: palette.gradient[0],
    heroEnd: palette.gradient[1],
  };
}

export function getFontFamily(fontFamily: AppFontFamily): string | undefined {
  if (fontFamily === 'serif') return 'serif';
  if (fontFamily === 'monospace') return 'monospace';
  if (fontFamily === 'rounded') {
    return Platform.select({
      ios: 'Avenir Next',
      android: 'sans-serif-rounded',
      web: 'Arial Rounded MT Bold',
      default: 'sans-serif',
    });
  }
  return undefined;
}

interface ShadowOptions {
  color: string;
  offsetX: number;
  offsetY: number;
  opacity: number;
  radius: number;
  elevation?: number;
}

export function getShadowStyle({
  color,
  offsetX,
  offsetY,
  opacity,
  radius,
  elevation = 0,
}: ShadowOptions): ViewStyle {
  const hexColor = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  const shadowColor = hexColor
    ? `rgba(${parseInt(hexColor.slice(0, 2), 16)}, ${parseInt(hexColor.slice(2, 4), 16)}, ${parseInt(hexColor.slice(4, 6), 16)}, ${opacity})`
    : color;

  return Platform.select<ViewStyle>({
    web: { boxShadow: `${offsetX}px ${offsetY}px ${radius}px ${shadowColor}` },
    default: {
      shadowColor: color,
      shadowOffset: { width: offsetX, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation,
    },
  }) ?? {};
}

const DARK_TEXT_COLORS: Record<string, keyof AppThemeColors> = {
  '#111827': 'text',
  '#0F172A': 'text',
  '#1E293B': 'text',
  '#374151': 'textSecondary',
  '#334155': 'textSecondary',
  '#475569': 'textSecondary',
  '#64748B': 'textSecondary',
  '#6B7280': 'textSecondary',
  '#94A3B8': 'textMuted',
  '#9CA3AF': 'textMuted',
  '#5A5A66': 'textSecondary',
};

export function ThemedText(props: React.ComponentProps<typeof NativeText>) {
  const appTheme = useSettingsStore((state) => state.theme);
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const theme = getThemeColors(appTheme, cardColor);
  const textStyle = StyleSheet.flatten(props.style) as TextStyle | undefined;
  const resolvedFontFamily = getFontFamily(fontFamily);
  const fixedColor = typeof textStyle?.color === 'string' ? textStyle.color : undefined;
  const themeColor = fixedColor ? DARK_TEXT_COLORS[fixedColor] : undefined;
  const resolvedColor = themeColor ? theme[themeColor] : !fixedColor ? theme.text : undefined;

  return React.createElement(NativeText, {
    ...props,
    style: [
      props.style,
      resolvedFontFamily ? { fontFamily: resolvedFontFamily } : undefined,
      resolvedColor && appTheme === 'dark' ? { color: resolvedColor } : undefined,
    ],
  });
}
