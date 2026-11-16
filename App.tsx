import { useFinanceStore } from './store/useFinanceStore';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, StatusBar } from 'react-native';
import { BottomSheetModalProvider } from './components/BottomSheetProvider';
import DashboardScreen from './screens/DashboardScreen';
import TransactionsScreen from './screens/TransactionsScreen';
import SavingsScreen from './screens/SavingsScreen';
import ReportsScreen from './screens/ReportsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useTranslation } from './utils/translations';
import { useSettingsStore } from './store/useSettingsStore';
import { getFontFamily, getShadowStyle, getThemeColors } from './utils/theme';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import type { MainTabParamList } from './types/navigation';
import { useAuthStore } from './store/useAuthStore';
import { useGmailStore } from './store/useGmailStore';
import WelcomeScreen from './screens/WelcomeScreen';
import { ActivityIndicator, AppState, Pressable, View } from 'react-native';
import { ThemedText } from './utils/theme';
import FinanceConnectionStatus from './components/FinanceConnectionStatus';
import FinanceMigrationScreen from './components/FinanceMigrationScreen';
import { financeApiUrl } from './utils/financeApi';
import { financeAccessToken } from './utils/connectedFinanceSession';
import { startFinanceRealtime } from './utils/financeRealtime';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function App() {
  const { t } = useTranslation();
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.isLoading);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const loadImportedTransactions = useGmailStore((state) => state.loadImportedTransactions);
  const [continueAsGuest, setContinueAsGuest] = useState(false);
  const financeOwner = useFinanceStore(s => s.owner);
  const financeLoaded = useFinanceStore(s => s.isLoaded);
  const financeError = useFinanceStore(s => s.error);
  const financeMigration = useFinanceStore(s => s.migration);
  const financeMode = useFinanceStore(s => s.syncMode);
  const activateOwner = useFinanceStore(s => s.activateOwner);
  const expectedOwner = session ? 'user:' + session.user.id : 'guest';
  const financeReady = financeLoaded && financeOwner === expectedOwner;
  const accentColor = useSettingsStore((state) => state.accentColor);
  const appTheme = useSettingsStore((state) => state.theme);
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const theme = getThemeColors(appTheme, cardColor);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (!authLoading && financeOwner !== expectedOwner) void activateOwner(expectedOwner);
  }, [authLoading, financeOwner, expectedOwner, activateOwner]);

  useEffect(() => {
    if (!session || !financeReady || financeMigration) return;

    void loadImportedTransactions();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadImportedTransactions();
    });
    const refreshInterval = setInterval(() => {
      if (AppState.currentState === 'active') void loadImportedTransactions();
    }, 5 * 60 * 1000);

    return () => {
      appStateSubscription.remove();
      clearInterval(refreshInterval);
    };
  }, [session?.user.id, financeReady, financeMigration, loadImportedTransactions]);

  useEffect(() => {
    if (!financeReady || financeMode !== 'cloud' || financeMigration) return;
    const owner = expectedOwner;
    const refresh = () => { void useFinanceStore.getState().refresh(); };
    const stop = startFinanceRealtime({
      baseUrl: financeApiUrl, getAccessToken: () => financeAccessToken(owner), onChange: refresh,
      onStatus: status => useFinanceStore.getState().setSyncStatus(owner, status),
      onError: message => useFinanceStore.getState().setSyncError(owner, message),
    });
    const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const interval = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 30000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    if (Platform.OS === 'web') {
      window.addEventListener('focus', refresh);
      window.addEventListener('online', refresh);
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop(); appState.remove(); clearInterval(interval);
      if (Platform.OS === 'web') {
        window.removeEventListener('focus', refresh);
        window.removeEventListener('online', refresh);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [financeReady, financeMode, financeMigration, expectedOwner]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <StatusBar barStyle={appTheme === 'dark' ? 'light-content' : 'dark-content'} />

          <NavigationContainer>
            {authLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={accentColor} />
                <ThemedText style={{ marginTop: 12 }}>{t('Preparando tu espacio financiero...')}</ThemedText>
              </View>
            ) : !session && !continueAsGuest ? (
              <WelcomeScreen onContinueWithoutAccount={() => setContinueAsGuest(true)} />
            ) : !financeReady ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.background }}>
                {financeError ? <>
                  <ThemedText>{financeError}</ThemedText>
                  <Pressable accessibilityRole="button" onPress={() => void activateOwner(expectedOwner)} style={{ padding: 16 }}>
                    <ThemedText style={{ color: accentColor }}>{t('Reintentar')}</ThemedText>
                  </Pressable>
                  {session ? <Pressable accessibilityRole="button" onPress={() => void useAuthStore.getState().signOut()} style={{ padding: 16 }}>
                    <ThemedText style={{ color: accentColor }}>{t('Cerrar sesión')}</ThemedText>
                  </Pressable> : null}
                </> : <ActivityIndicator size="large" color={accentColor} />}
              </View>
            ) : financeMigration ? <FinanceMigrationScreen /> : (
              <View style={{ flex: 1 }}>
              <FinanceConnectionStatus />
              <Tab.Navigator key={expectedOwner}

              screenOptions={{
                headerStatusBarHeight: financeMode === 'cloud' ? 0 : undefined,
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
              </View>
            )}
          </NavigationContainer>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
