import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import DashboardScreen from './screens/DashboardScreen';
import TransactionsScreen from './screens/TransactionsScreen';
import SavingsScreen from './screens/SavingsScreen';
import ReportsScreen from './screens/ReportsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useTranslation } from './utils/translations';
import { useSettingsStore } from './store/useSettingsStore';
import { getFontFamily, getShadowStyle, getThemeColors } from './utils/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MainTabParamList } from './types/navigation';
import { useAuthStore } from './store/useAuthStore';
import WelcomeScreen from './screens/WelcomeScreen';
import { ActivityIndicator, View } from 'react-native';
import { ThemedText } from './utils/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function App() {
  const { t } = useTranslation();
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.isLoading);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const [continueAsGuest, setContinueAsGuest] = useState(false);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const appTheme = useSettingsStore((state) => state.theme);
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const theme = getThemeColors(appTheme, cardColor);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <StatusBar style={appTheme === 'dark' ? 'light' : 'dark'} />

          <NavigationContainer>
            {authLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={accentColor} />
                <ThemedText style={{ marginTop: 12 }}>{t('Preparando tu espacio financiero...')}</ThemedText>
              </View>
            ) : !session && !continueAsGuest ? (
              <WelcomeScreen onContinueWithoutAccount={() => setContinueAsGuest(true)} />
            ) : (
              <Tab.Navigator

              screenOptions={{
                headerStyle: {
                  backgroundColor: theme.header,
                  ...getShadowStyle({ color: '#000000', offsetX: 0, offsetY: 0, opacity: 0, radius: 0 }),
                  borderBottomWidth: 0,
                },
                headerTitleStyle: {
                  fontWeight: '800',
                  fontSize: 18,
                  letterSpacing: -0.3,
                  fontFamily: getFontFamily(fontFamily),
                },
                headerTintColor: theme.headerText,
                tabBarActiveTintColor: accentColor,
                tabBarInactiveTintColor: '#94A3B8',
                tabBarStyle: {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                  borderTopWidth: 1,
                  height: 72,
                  paddingBottom: 10,
                  paddingTop: 8,
                  ...getShadowStyle({
                    color: '#281047',
                    offsetX: 0,
                    offsetY: -5,
                    opacity: appTheme === 'dark' ? 0.18 : 0.08,
                    radius: 14,
                    elevation: 16,
                  }),
                },
                tabBarLabelStyle: {
                  fontSize: 10,
                  fontWeight: '700',
                  fontFamily: getFontFamily(fontFamily),
                },
              }}
            >
              <Tab.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{
                  title: t('Financia Smart Bank'),
                  tabBarLabel: t('Inicio'),
                  tabBarIcon: ({ color }) => (
                    <MaterialCommunityIcons name="view-dashboard" size={22} color={color} />
                  ),
                }}
              />
              <Tab.Screen
                name="Transacciones"
                component={TransactionsScreen}
                options={{
                  title: t('Movimientos'),
                  tabBarLabel: t('Movimientos'),
                  tabBarIcon: ({ color }) => (
                    <MaterialCommunityIcons name="receipt-text" size={22} color={color} />
                  ),
                }}
              />
              <Tab.Screen
                name="Ahorro"
                component={SavingsScreen}
                options={{
                  title: t('Bolsillos & Ahorro'),
                  tabBarLabel: t('Ahorro'),
                  tabBarIcon: ({ color }) => (
                    <MaterialCommunityIcons name="bullseye-arrow" size={22} color={color} />
                  ),
                }}
              />
              <Tab.Screen
                name="Informes"
                component={ReportsScreen}
                options={{
                  title: t('Informes Financieros'),
                  tabBarLabel: t('Informes'),
                  tabBarIcon: ({ color }) => (
                    <MaterialCommunityIcons name="chart-donut" size={22} color={color} />
                  ),
                }}
              />
              <Tab.Screen
                name="Configuración"
                component={SettingsScreen}
                options={{
                  title: t('Configuración'),
                  tabBarLabel: t('Ajustes'),
                  tabBarIcon: ({ color }) => (
                    <MaterialCommunityIcons name="cog-outline" size={22} color={color} />
                  ),
                }}
              />
              </Tab.Navigator>
            )}
          </NavigationContainer>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
