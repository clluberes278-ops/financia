import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from '../../utils/translations';
import { useSettingsStore } from '../../store/useSettingsStore';
import { getShadowStyle, getThemeColors } from '../../utils/theme';

export default function TabLayout() {
  const { t } = useTranslation();
  const accentColor = useSettingsStore((state) => state.accentColor);
  const appTheme = useSettingsStore((state) => state.theme);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const theme = getThemeColors(appTheme, cardColor);

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.header,
          elevation: 0,
          ...getShadowStyle({ color: '#000000', offsetX: 0, offsetY: 0, opacity: 0, radius: 0 }),
          borderBottomWidth: 0,
        },
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
          letterSpacing: -0.3,
        },
        headerTintColor: theme.headerText,
        tabBarActiveTintColor: accentColor,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('Financia Smart Bank'),
          tabBarLabel: t('Inicio'),
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20 }}>{focused ? '💳' : '🏦'}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('Movimientos'),
          tabBarLabel: t('Movimientos'),
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20 }}>{focused ? '💸' : '📄'}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: t('Bolsillos & Ahorro'),
          tabBarLabel: t('Ahorro'),
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20 }}>{focused ? '🎯' : '🐖'}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('Informes Financieros'),
          tabBarLabel: t('Informes'),
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20 }}>{focused ? '📈' : '📊'}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('Configuración'),
          tabBarLabel: t('Ajustes'),
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20 }}>{focused ? '⚙️' : '🔧'}</Text>
          ),
        }}
      />
    </Tabs>
  );
}

// Helper to avoid using native Text and avoid warnings
import { Text } from 'react-native';
