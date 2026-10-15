import React, { useState, useEffect } from 'react';
import { AppState, AppStateStatus, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { useSettingsStore } from '../store/useSettingsStore';
import { getThemeColors } from '../utils/theme';
import BiometricLockOverlay from '../components/BiometricLockOverlay';

export default function RootLayout() {
  const appTheme = useSettingsStore((state) => state.theme);
  const biometricLockEnabled = useSettingsStore((state) => state.biometricLockEnabled);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    // Bloqueo inicial inmediato si está activado en los ajustes
    if (biometricLockEnabled) {
      setIsLocked(true);
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && biometricLockEnabled) {
        setIsLocked(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [biometricLockEnabled]);

  const handleAuthenticated = () => {
    setIsLocked(false);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <StatusBar style={appTheme === 'dark' ? 'light' : 'dark'} />

          {isLocked && (
            <BiometricLockOverlay onAuthenticated={handleAuthenticated} />
          )}

          <Slot />
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
