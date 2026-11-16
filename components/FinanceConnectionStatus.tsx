import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinanceStore } from '../store/useFinanceStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getThemeColors, ThemedText } from '../utils/theme';

export default function FinanceConnectionStatus() {
  const finance = useFinanceStore();
  const settings = useSettingsStore();
  const theme = getThemeColors(settings.theme, settings.cardColor);
  if (finance.syncMode !== 'cloud') return null;
  const label = finance.pendingOperation ? 'Operación pendiente de confirmar'
    : finance.isSyncing ? 'Actualizando historial…'
    : finance.syncStatus === 'connected' ? 'Cuenta conectada'
    : finance.syncStatus === 'reconnecting' ? 'Reconectando…'
    : finance.syncStatus === 'offline' ? 'Sin conexión en tiempo real' : 'Conectando…';
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.surface }}>
    <View accessibilityLiveRegion="polite" style={[styles.container, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.row}>
        {finance.isSyncing ? <ActivityIndicator size="small" color={settings.accentColor} /> : null}
        <ThemedText style={[styles.label, { color: finance.pendingOperation ? theme.warning : theme.textSecondary }]}>{label}</ThemedText>
        <Pressable accessibilityRole="button" disabled={finance.isSyncing} style={styles.action}
          onPress={() => { void (finance.pendingOperation ? finance.retryPending() : finance.refresh()).catch(() => { /* The store exposes failures below. */ }); }}>
          <ThemedText style={{ color: settings.accentColor }}>{finance.pendingOperation ? 'Confirmar resultado' : 'Actualizar'}</ThemedText>
        </Pressable>
      </View>
      {finance.error ? <ThemedText style={[styles.error, { color: theme.expense }]}>{finance.error}</ThemedText> : null}
      {finance.pendingOperation ? <ThemedText style={[styles.error, { color: theme.textSecondary }]}>Antes de enviar otra operación, confirma esta. Reintentar conserva su clave para evitar duplicados.</ThemedText> : null}
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 12 },
  action: { paddingVertical: 8, paddingHorizontal: 4 },
  error: { fontSize: 12, marginTop: 4 },
});
