import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getThemeColors, ThemedText } from '../utils/theme';
import { useSettingsStore } from '../store/useSettingsStore';

import { BiometricLockOverlayProps } from '../types/app';

export default function BiometricLockOverlay({ onAuthenticated }: BiometricLockOverlayProps) {
  const appTheme = useSettingsStore((state) => state.theme);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const theme = getThemeColors(appTheme);

  const [isLoading, setIsLoading] = useState(false);

  const handleAuthenticate = async () => {
    setIsLoading(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        throw new Error('Este dispositivo no soporta biometría.');
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        throw new Error('No hay huellas o rostros registrados en el dispositivo.');
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autenticación requerida',
        fallbackLabel: 'Usar código',
        disableDeviceFallback: false,
      });

      if (result.success) {
        onAuthenticated();
      } else {
        Alert.alert('Acceso denegado', 'No se pudo validar la identidad.');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      Alert.alert('Error de autenticación', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Intento automático de autenticación al montar el componente
    handleAuthenticate();
  }, []);

  return (
    <View style={[styles.overlay, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: `${accentColor}15` }]}>
          <MaterialCommunityIcons name="fingerprint" size={80} color={accentColor} />
        </View>

        <ThemedText style={styles.title}>Bloqueo Biométrico</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Por favor, autentícate para acceder a tus finanzas
        </ThemedText>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: accentColor }]}
          onPress={handleAuthenticate}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.buttonText}>Desbloquear</ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 400,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
