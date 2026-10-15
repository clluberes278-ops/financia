import React, { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSavingsStore } from '../store/useSavingsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { useTranslation } from '../utils/translations';
import { getThemeColors, ThemedText } from '../utils/theme';

const ACCENT_COLORS = ['#4F46E5', '#0F766E', '#C2410C', '#BE123C', '#0369A1'];
const Text = ThemedText;

export default function SettingsScreen() {
  const settings = useSettingsStore();
  const { t } = useTranslation();
  const theme = getThemeColors(settings.theme);
  const clearAllTransactions = useTransactionStore((state) => state.clearAllTransactions);
  const clearAllPockets = useSavingsStore((state) => state.clearAllPockets);

  useEffect(() => {
    if (!settings.isLoaded) settings.loadSettings();
  }, [settings.isLoaded, settings.loadSettings]);

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
            await Promise.all([clearAllTransactions(), clearAllPockets()]);
            Alert.alert(t('Datos eliminados'), t('Tu espacio financiero está listo para empezar de nuevo.'));
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.intro}>
        <View style={[styles.iconCircle, { backgroundColor: settings.accentColor }]}><Text style={styles.icon}>⚙️</Text></View>
        <View style={styles.introText}>
          <Text style={[styles.heading, { color: theme.text }]}>{t('Tu espacio, tus reglas')}</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>{t('Personaliza Financia para que se adapte a tu forma de organizar el dinero.')}</Text>
        </View>
      </View>

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

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('Personalización')}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{t('Color de acento')}</Text>
        <View style={styles.colorRow}>
          {ACCENT_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityLabel={`Seleccionar color ${color}`}
              style={[styles.colorButton, { backgroundColor: color }, settings.accentColor === color && styles.selectedColor]}
              onPress={() => settings.setAccentColor(color)}
            />
          ))}
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
        <SettingRow
          label={t('Bloqueo Biométrico')}
          description={t('Requiere huella o rostro para entrar a la aplicación.')}
          value={settings.biometricLockEnabled}
          onValueChange={settings.setBiometricLockEnabled}
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
            <Text style={[styles.dangerLabel, { color: '#EF4444' }]}>{t('Borrar todos los datos')}</Text>
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
  theme: any;
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
  intro: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  iconCircle: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  icon: { fontSize: 25 },
  introText: { flex: 1 },
  heading: { fontSize: 20, fontWeight: '800' },
  description: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 24, padding: 16, marginBottom: 20, borderWidth: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  optionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  languageOption: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  languageText: { fontSize: 13, fontWeight: '700' },
  activeOptionText: { color: '#FFFFFF' },
  helperText: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  colorRow: { flexDirection: 'row', gap: 14, marginTop: 14, marginBottom: 18 },
  colorButton: { width: 30, height: 30, borderRadius: 15 },
  selectedColor: { borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, elevation: 4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  rowCopy: { flex: 1 },
  divider: { height: 1, marginVertical: 16 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  dangerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { fontSize: 15, fontWeight: '700' },
  chevron: { fontSize: 25 },
  version: { fontSize: 11, textAlign: 'center', marginTop: 16 },
});
