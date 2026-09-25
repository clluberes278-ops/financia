import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import DashboardScreen from './screens/DashboardScreen';
import TransactionsScreen from './screens/TransactionsScreen';
import SavingsScreen from './screens/SavingsScreen';
import ReportsScreen from './screens/ReportsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useTranslation } from './utils/translations';
import { useSettingsStore } from './store/useSettingsStore';

const Tab = createBottomTabNavigator();

export default function App() {
  const { t } = useTranslation();
  const accentColor = useSettingsStore((state) => state.accentColor);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: '#0F172A',
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 0,
            },
            headerTitleStyle: {
              fontWeight: '800',
              fontSize: 18,
              letterSpacing: -0.3,
            },
            headerTintColor: '#FFFFFF',
            tabBarActiveTintColor: accentColor,
            tabBarInactiveTintColor: '#94A3B8',
            tabBarStyle: {
              backgroundColor: '#FFFFFF',
              borderTopColor: '#E2E8F0',
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
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{
              title: t('Financia Smart Bank'),
              tabBarLabel: t('Inicio'),
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 20 }}>{focused ? '💳' : '🏦'}</Text>
              ),
            }}
          />
          <Tab.Screen
            name="Transacciones"
            component={TransactionsScreen}
            options={{
              title: t('Movimientos'),
              tabBarLabel: t('Movimientos'),
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 20 }}>{focused ? '💸' : '📄'}</Text>
              ),
            }}
          />
          <Tab.Screen
            name="Ahorro"
            component={SavingsScreen}
            options={{
              title: t('Bolsillos & Ahorro'),
              tabBarLabel: t('Ahorro'),
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 20 }}>{focused ? '🎯' : '🐖'}</Text>
              ),
            }}
          />
          <Tab.Screen
            name="Informes"
            component={ReportsScreen}
            options={{
              title: t('Informes Financieros'),
              tabBarLabel: t('Informes'),
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 20 }}>{focused ? '📈' : '📊'}</Text>
              ),
            }}
          />
          <Tab.Screen
            name="Configuración"
            component={SettingsScreen}
            options={{
              title: t('Configuración'),
              tabBarLabel: t('Ajustes'),
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 20 }}>{focused ? '⚙️' : '🔧'}</Text>
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
