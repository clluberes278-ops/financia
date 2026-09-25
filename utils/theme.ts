import React from 'react';
import { StyleSheet, Text as NativeText, TextStyle } from 'react-native';
import { AppTheme, useSettingsStore } from '../store/useSettingsStore';

export const LIGHT_THEME = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  header: '#0F172A',
  headerText: '#FFFFFF',
};

export const DARK_THEME = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceMuted: '#334155',
  border: '#475569',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  header: '#020617',
  headerText: '#F8FAFC',
};

export type AppThemeColors = typeof LIGHT_THEME;

export function getThemeColors(theme: AppTheme): AppThemeColors {
  return theme === 'dark' ? DARK_THEME : LIGHT_THEME;
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
};

export function ThemedText(props: React.ComponentProps<typeof NativeText>) {
  const appTheme = useSettingsStore((state) => state.theme);
  const theme = getThemeColors(appTheme);
  const textStyle = StyleSheet.flatten(props.style) as TextStyle | undefined;
  const fixedColor = typeof textStyle?.color === 'string' ? textStyle.color : undefined;
  const themeColor = fixedColor ? DARK_TEXT_COLORS[fixedColor] : undefined;
  const resolvedColor = themeColor ? theme[themeColor] : !fixedColor ? theme.text : undefined;

  return React.createElement(NativeText, {
    ...props,
    style: resolvedColor && appTheme === 'dark' ? [props.style, { color: resolvedColor }] : props.style,
  });
}
