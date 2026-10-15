import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text as NativeText, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSavingsStore } from '../store/useSavingsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { useTranslation } from '../utils/translations';
import { CARD_COLOR_PALETTES, getFontFamily, getShadowStyle, getThemeColors, ThemedText, type AppThemeColors } from '../utils/theme';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppFontFamily } from '../store/useSettingsStore';
import type { CardColor } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useGmailStore } from '../store/useGmailStore';

const ACCENT_COLORS = ['#8B5CF6', '#C026D3', '#EC4899', '#06B6D4', '#F97316', '#10B981'];
const FONT_OPTIONS: { value: AppFontFamily; label: string; sample: string }[] = [
  { value: 'system', label: 'Sistema', sample: 'Ag' },
  { value: 'rounded', label: 'Redondeada', sample: 'Ag' },
  { value: 'serif', label: 'Serif', sample: 'Ag' },
  { value: 'monospace', label: 'Monoespaciada', sample: 'Ag' },
];
const Text = ThemedText;

export default function SettingsScreen() {
  const settings = useSettingsStore();
  const { t } = useTranslation();
  const theme = getThemeColors(settings.theme, settings.cardColor);
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.isLoading);
  const authBusy = useAuthStore((state) => state.isBusy);
  const authConfigured = useAuthStore((state) => state.isConfigured);
  const authError = useAuthStore((state) => state.error);
  const signInWithProvider = useAuthStore((state) => state.signInWithProvider);
  const signOut = useAuthStore((state) => state.signOut);
  const connectGmail = useAuthStore((state) => state.connectGmail);
  const gmailConnection = useGmailStore((state) => state.connection);
  const gmailLoading = useGmailStore((state) => state.isLoading);
  const gmailError = useGmailStore((state) => state.error);
  const loadGmailConnection = useGmailStore((state) => state.loadConnection);
  const disconnectGmail = useGmailStore((state) => state.disconnect);
  const clearAllTransactions = useTransactionStore((state) => state.clearAllTransactions);
  const clearAllPockets = useSavingsStore((state) => state.clearAllPockets);

  useEffect(() => {
    if (!settings.isLoaded) settings.loadSettings();
  }, [settings.isLoaded, settings.loadSettings]);

  useEffect(() => {
    if (session) {
      void loadGmailConnection();
    }
  }, [session?.user.id, loadGmailConnection]);

  const confirmDeleteData = () => {
    Alert.alert(
      t('Borrar todos los datos'),
      t('Se eliminarán tus movimientos y bolsillos de ahorro. Esta acción no se puede deshacer.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        {
          text: t('Borrar todo'),
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all([clearAllTransactions(), clearAllPockets()]);
              Alert.alert(t('Datos eliminados'), t('Tu espacio financiero está listo para empezar de nuevo.'));
            } catch {
              Alert.alert(t('Error'), t('No se pudieron borrar los datos. Inténtalo de nuevo.'));
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={[theme.heroStart, theme.heroEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.intro}
      >
        <View style={styles.iconCircle}><Text style={styles.icon}>✦</Text></View>
        <View style={styles.introText}>
          <Text style={styles.heading}>{t('Tu espacio, tus reglas')}</Text>
          <Text style={styles.description}>{t('Personaliza Financia para que se adapte a tu forma de organizar el dinero.')}</Text>
        </View>
      </LinearGradient>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('General')}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{t('Idioma')}</Text>
        <View style={styles.optionRow}>
          {(['es', 'en'] as const).map((language) => (
            <Pressable
              key={language}
              style={[styles.languageOption, { backgroundColor: theme.surfaceMuted }, settings.language === language && { backgroundColor: settings.accentColor }]}
              onPress={() => settings.setLanguage(language)}
            >
              <Text style={[styles.languageText, { color: theme.textSecondary }, settings.language === language && styles.activeOptionText]}>
                {language === 'es' ? 'Español' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>{t('La preferencia queda guardada para futuras sesiones.')}</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('Cuenta')}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {authLoading ? (
          <ActivityIndicator color={settings.accentColor} />
        ) : session ? (
          <>
            <Text style={[styles.rowLabel, { color: theme.text }]}>{t('Sesión iniciada')}</Text>
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>{session.user.email ?? session.user.id}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={authBusy}
              style={[styles.authButton, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}
              onPress={() => void signOut()}
            >
              {authBusy ? <ActivityIndicator color={settings.accentColor} /> : <Text style={[styles.authButtonText, { color: theme.text }]}>{t('Cerrar sesión')}</Text>}
            </Pressable>
            {authError && <Text style={[styles.authError, { color: theme.expense }]}>{authError}</Text>}
          </>
        ) : (
          <>
            <Text style={[styles.rowLabel, { color: theme.text }]}>{t('Inicia sesión con un proveedor')}</Text>
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>
              {authConfigured
                ? t('Los datos actuales se mantienen en este dispositivo; la sincronización en la nube aún no está activada.')
                : t('Configura Supabase y activa los proveedores en el panel del proyecto para habilitar el inicio de sesión.')}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!authConfigured || authBusy}
              style={[styles.authButton, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }, (!authConfigured || authBusy) && styles.authButtonDisabled]}
              onPress={() => void signInWithProvider('google')}
            >
              {authBusy ? <ActivityIndicator color={settings.accentColor} /> : (
                <>
                  <MaterialCommunityIcons name="google" size={19} color={theme.text} />
                  <Text style={[styles.authButtonText, { color: theme.text }]}>{t('Continuar con Google')}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!authConfigured || authBusy}
              style={[styles.authButton, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }, (!authConfigured || authBusy) && styles.authButtonDisabled]}
              onPress={() => void signInWithProvider('apple')}
            >
              <MaterialCommunityIcons name="apple" size={20} color={theme.text} />
              <Text style={[styles.authButtonText, { color: theme.text }]}>{t('Continuar con Apple')}</Text>
            </Pressable>
            {authError && <Text style={[styles.authError, { color: theme.expense }]}>{authError}</Text>}
          </>
        )}
      </View>

      {session && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('Lectura automática de Gmail')}</Text>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              {gmailConnection ? t('Gmail conectado') : t('Conectar avisos bancarios de BHD')}
            </Text>
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>
              {gmailConnection
                ? `${gmailConnection.gmail_email} · ${t('Última consulta')}: ${new Date(gmailConnection.last_synced_at).toLocaleString(settings.language === 'es' ? 'es-DO' : 'en-US')}`
                : t('Autoriza lectura de solo consulta de Gmail. Se revisan avisos de BHD de los últimos 90 días y luego cada 15 minutos.')}
            </Text>
            {gmailConnection?.last_error && (
              <Text style={[styles.authError, { color: theme.expense }]}>{t(gmailConnection.last_error)}</Text>
            )}
            {gmailError && <Text style={[styles.authError, { color: theme.expense }]}>{gmailError}</Text>}
            {gmailConnection ? (
              <Pressable
                accessibilityRole="button"
                disabled={gmailLoading}
                style={[styles.authButton, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}
                onPress={() => void disconnectGmail()}
              >
                {gmailLoading ? <ActivityIndicator color={settings.accentColor} /> : (
                  <Text style={[styles.authButtonText, { color: theme.text }]}>{t('Desconectar Gmail')}</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={!authConfigured || authBusy || gmailLoading}
                style={[styles.authButton, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }, (!authConfigured || authBusy || gmailLoading) && styles.authButtonDisabled]}
                onPress={() => void connectGmail()}
              >
                {authBusy || gmailLoading ? <ActivityIndicator color={settings.accentColor} /> : (
                  <>
                    <MaterialCommunityIcons name="gmail" size={20} color={theme.text} />
                    <Text style={[styles.authButtonText, { color: theme.text }]}>{t('Autorizar Gmail de solo lectura')}</Text>
                  </>
                )}
              </Pressable>
            )}
            <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 10 }]}>
              {t('Google concede este permiso para toda la bandeja. Financia solo consulta los dos remitentes de BHD admitidos y guarda los movimientos extraídos, no los correos.')}
            </Text>
          </View>
        </>
      )}

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('Personalización')}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{t('Color de acento')}</Text>
        <View style={styles.colorRow}>
          {ACCENT_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityLabel={`Seleccionar color ${color}`}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.accentColor === color }}
              style={[
                styles.colorButton,
                { backgroundColor: color },
                settings.accentColor === color && styles.selectedColor,
              ]}
              onPress={() => settings.setAccentColor(color)}
            >
              {settings.accentColor === color && <Text style={styles.selectedColorCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
        <Text style={[styles.rowLabel, { color: theme.text, marginTop: 4 }]}>{t('Color de tarjetas')}</Text>
        <View style={styles.colorRow}>
          {(Object.keys(CARD_COLOR_PALETTES) as CardColor[]).map((color) => {
            const isSelected = settings.cardColor === color;
            return (
              <Pressable
                key={color}
                accessibilityLabel={`${t('Color de tarjetas')}: ${t(CARD_COLOR_PALETTES[color].label)}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.colorButton,
                  { backgroundColor: CARD_COLOR_PALETTES[color].gradient[0] },
                  isSelected && styles.selectedColor,
                ]}
                onPress={() => settings.setCardColor(color)}
              >
                {isSelected && <Text style={styles.selectedColorCheck}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.rowLabel, { color: theme.text, marginTop: 8 }]}>{t('Tipo de letra')}</Text>
        <View style={styles.fontOptions}>
          {FONT_OPTIONS.map((option) => {
            const isSelected = settings.fontFamily === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => settings.setFontFamily(option.value)}
                style={[
                  styles.fontOption,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
                  isSelected && { backgroundColor: `${settings.accentColor}18`, borderColor: settings.accentColor },
                ]}
              >
                <NativeText style={[styles.fontSample, { color: isSelected ? settings.accentColor : theme.text }, getFontFamily(option.value) ? { fontFamily: getFontFamily(option.value) } : undefined]}>{option.sample}</NativeText>
                <Text style={[styles.fontLabel, { color: isSelected ? settings.accentColor : theme.textSecondary }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.rowLabel, { color: theme.text, marginTop: 12 }]}>{t('Tema')}</Text>
        <View style={styles.optionRow}>
          {(['light', 'dark'] as const).map((themeOption) => (
            <Pressable
              key={themeOption}
              style={[styles.languageOption, { backgroundColor: theme.surfaceMuted }, settings.theme === themeOption && { backgroundColor: settings.accentColor }]}
              onPress={() => settings.setTheme(themeOption)}
            >
              <Text style={[styles.languageText, { color: theme.textSecondary }, settings.theme === themeOption && styles.activeOptionText]}>
                {themeOption === 'light' ? t('Claro') : t('Oscuro')}
              </Text>
            </Pressable>
          ))}
        </View>
        <SettingRow
          label={t('Ocultar saldo al abrir')}
          description={t('Protege tus montos cuando revisas la app en público.')}
          value={settings.hideBalanceByDefault}
          onValueChange={settings.setHideBalanceByDefault}
          accentColor={settings.accentColor}
          theme={theme}
        />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('Avisos y privacidad')}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SettingRow
          label={t('Recordatorios')}
          description={t('Activa avisos para mantener tus movimientos al día.')}
          value={settings.notificationsEnabled}
          onValueChange={settings.setNotificationsEnabled}
          accentColor={settings.accentColor}
          theme={theme}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Pressable style={styles.dangerRow} onPress={confirmDeleteData}>
          <View style={[styles.dangerIcon, { backgroundColor: theme.surfaceMuted }]}>
            <Text>🗑️</Text>
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.dangerLabel, { color: theme.expense }]}>{t('Borrar todos los datos')}</Text>
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>{t('Movimientos y bolsillos guardados en este dispositivo.')}</Text>
          </View>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>
      </View>

      <Text style={[styles.version, { color: theme.textMuted }]}>{t('Financia Smart Bank · Configuración')}</Text>
    </ScrollView>
  );
}

function SettingRow({
  label,
  description,
  value,
  onValueChange,
  accentColor,
  theme,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accentColor: string;
  theme: AppThemeColors;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#CBD5E1', true: accentColor }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  intro: { flexDirection: 'row', alignItems: 'center', marginBottom: 26, padding: 18, borderRadius: 26, minHeight: 116 },
  iconCircle: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14, backgroundColor: 'rgba(255,255,255,0.18)' },
  icon: { fontSize: 26, color: '#FFFFFF', fontWeight: '800' },
  introText: { flex: 1 },
  heading: { fontSize: 19, fontWeight: '800', color: '#FFFFFF' },
  description: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 18, marginTop: 5 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 9, marginLeft: 6 },
  card: { borderRadius: 22, padding: 17, marginBottom: 22, borderWidth: 1, ...getShadowStyle({ color: '#32145A', offsetX: 0, offsetY: 5, opacity: 0.05, radius: 12, elevation: 2 }) },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  optionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  languageOption: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  languageText: { fontSize: 13, fontWeight: '700' },
  activeOptionText: { color: '#FFFFFF' },
  helperText: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  authButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, marginTop: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  authButtonText: { fontSize: 14, fontWeight: '700' },
  authButtonDisabled: { opacity: 0.55 },
  authError: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14, marginBottom: 18 },
  colorButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  selectedColor: { borderWidth: 3, borderColor: '#FFFFFF', ...getShadowStyle({ color: '#000000', offsetX: 0, offsetY: 0, opacity: 0.25, radius: 4, elevation: 4 }) },
  selectedColorCheck: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  fontOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  fontOption: { flexGrow: 1, flexBasis: '45%', minWidth: 120, minHeight: 76, borderRadius: 16, borderWidth: 1, padding: 10, alignItems: 'center', justifyContent: 'center' },
  fontSample: { fontSize: 23, fontWeight: '800' },
  fontLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  rowCopy: { flex: 1 },
  divider: { height: 1, marginVertical: 16 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  dangerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { fontSize: 15, fontWeight: '700' },
  chevron: { fontSize: 25 },
  version: { fontSize: 11, textAlign: 'center', marginTop: 16 },
});
