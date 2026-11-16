import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinanceStore } from '../store/useFinanceStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getThemeColors, ThemedText } from '../utils/theme';

export default function FinanceMigrationScreen() {
  const finance = useFinanceStore();
  const auth = useAuthStore();
  const settings = useSettingsStore();
  const theme = getThemeColors(settings.theme, settings.cardColor);
  const migration = finance.migration;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <ThemedText style={[styles.heading, { color: theme.text }]}>Conecta tu espacio financiero</ThemedText>
      <ThemedText style={[styles.text, { color: theme.textSecondary }]}>{auth.session?.user.email ?? auth.session?.user.id}</ThemedText>
      <ThemedText style={[styles.text, { color: theme.text }]}>
        {migration?.source === 'server' ? 'Se usará el historial que ya pertenece a esta cuenta en el servidor. La copia local se conservará separada.'
          : migration?.source === 'local' ? 'Se copiará al servidor el historial local de esta cuenta. El original permanecerá guardado en este dispositivo.'
          : 'Se abrirá un espacio compartido vacío para esta cuenta. Los datos del modo invitado permanecerán separados.'}
      </ThemedText>
      <ThemedText style={[styles.text, { color: theme.textSecondary }]}>{migration?.transactionCount ?? 0} movimientos · {migration?.pocketCount ?? 0} bolsillos</ThemedText>
      <ThemedText style={[styles.text, { color: theme.textSecondary }]}>Después, tus movimientos se guardarán en el servidor y se actualizarán en tus dispositivos. Se requiere conexión para guardar cambios.</ThemedText>
      <Pressable accessibilityRole="button" disabled={finance.isSyncing} style={[styles.button, { backgroundColor: settings.accentColor }]}
        onPress={() => { void (finance.pendingOperation ? finance.retryPending() : finance.activateCloud()).catch(() => { /* Visible store error below. */ }); }}>
        {finance.isSyncing ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.buttonText}>{finance.pendingOperation ? 'Confirmar operación pendiente' : 'Conectar esta cuenta'}</ThemedText>}
      </Pressable>
      {finance.error ? <ThemedText style={[styles.text, { color: theme.expense }]}>{finance.error}</ThemedText> : null}
      {auth.error ? <ThemedText style={[styles.text, { color: theme.expense }]}>{auth.error}</ThemedText> : null}
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => void auth.signOut()}>
        <ThemedText style={{ color: settings.accentColor }}>Cerrar sesión</ThemedText>
      </Pressable>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 26, fontWeight: '800' },
  text: { fontSize: 15, lineHeight: 23 },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 16, padding: 14 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
