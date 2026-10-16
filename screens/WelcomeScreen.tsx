import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import GradientView from '../components/GradientView';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../utils/translations';
import { getThemeColors, ThemedText } from '../utils/theme';

interface WelcomeScreenProps {
  onContinueWithoutAccount: () => void;
}

export default function WelcomeScreen({ onContinueWithoutAccount }: WelcomeScreenProps) {
  const { t } = useTranslation();
  const themeName = useSettingsStore((state) => state.theme);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const theme = getThemeColors(themeName, cardColor);
  const isConfigured = useAuthStore((state) => state.isConfigured);
  const isBusy = useAuthStore((state) => state.isBusy);
  const error = useAuthStore((state) => state.error);
  const signInWithProvider = useAuthStore((state) => state.signInWithProvider);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <GradientView
          colors={[theme.heroStart, theme.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.logo}>
            <MaterialCommunityIcons name="wallet-outline" size={34} color="#FFFFFF" />
          </View>
          <ThemedText style={styles.brand}>{t('Financia Smart Bank')}</ThemedText>
          <ThemedText style={styles.tagline}>{t('Organiza tu dinero, a tu manera.')}</ThemedText>
        </GradientView>

        <View style={styles.content}>
          <ThemedText style={[styles.heading, { color: theme.text }]}>{t('Bienvenido')}</ThemedText>
          <ThemedText style={[styles.description, { color: theme.textSecondary }]}>
            {t('Inicia sesión para continuar, o entra sin cuenta y guarda tus datos en este dispositivo.')}
          </ThemedText>

          <Pressable
            accessibilityRole="button"
            disabled={!isConfigured || isBusy}
            style={[
              styles.providerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              (!isConfigured || isBusy) && styles.disabledButton,
            ]}
            onPress={() => void signInWithProvider('google')}
          >
            {isBusy ? <ActivityIndicator color={accentColor} /> : (
              <>
                <MaterialCommunityIcons name="google" size={20} color={theme.text} />
                <ThemedText style={[styles.providerLabel, { color: theme.text }]}>{t('Continuar con Google')}</ThemedText>
              </>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!isConfigured || isBusy}
            style={[
              styles.providerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              (!isConfigured || isBusy) && styles.disabledButton,
            ]}
            onPress={() => void signInWithProvider('apple')}
          >
            <MaterialCommunityIcons name="apple" size={21} color={theme.text} />
            <ThemedText style={[styles.providerLabel, { color: theme.text }]}>{t('Continuar con Apple')}</ThemedText>
          </Pressable>

          {!isConfigured && (
            <ThemedText style={[styles.notice, { color: theme.textSecondary }]}>
              {t('El acceso con proveedores aún no está configurado. Puedes continuar en modo local.')}
            </ThemedText>
          )}
          {error && <ThemedText style={[styles.error, { color: theme.expense }]}>{error}</ThemedText>}

          <View style={[styles.separator, { backgroundColor: theme.border }]} />

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            style={[styles.guestButton, { backgroundColor: accentColor }]}
            onPress={onContinueWithoutAccount}
          >
            <ThemedText style={styles.guestLabel}>{t('Continuar sin cuenta')}</ThemedText>
          </Pressable>
          <ThemedText style={[styles.localNote, { color: theme.textSecondary }]}>
            {t('Tus movimientos se guardarán localmente en este dispositivo.')}
          </ThemedText>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'center', padding: 20 },
  hero: { minHeight: 210, borderRadius: 28, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  brand: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  tagline: { color: 'rgba(255,255,255,0.86)', fontSize: 14, textAlign: 'center', marginTop: 7 },
  content: { paddingTop: 28 },
  heading: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  providerButton: { minHeight: 50, borderWidth: 1, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 11, marginTop: 10, paddingHorizontal: 14 },
  providerLabel: { fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
  notice: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 10 },
  error: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 10 },
  separator: { height: 1, marginVertical: 20 },
  guestButton: { minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  guestLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  localNote: { fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 10 },
});
