import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinanceStore } from '../store/useFinanceStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getThemeColors, ThemedText } from '../utils/theme';

export default function FinanceConnectionStatus() {
  const finance = useFinanceStore();
  const settings = useSettingsStore();
  const theme = getThemeColors(settings.theme, settings.cardColor);
  const [notice, setNotice] = useState<{ revision: string | null; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setNotice(null);
    setRefreshing(false);
    return () => { request.current++; };
  }, [finance.owner]);

  async function updateHistory(): Promise<void> {
    const currentRequest = ++request.current;
    const owner = finance.owner;
    const previousRevision = finance.cloudRevision;
    const confirming = finance.pendingOperation;
    setNotice(null);
    setRefreshing(true);
    try {
      let succeeded: boolean;
      if (confirming) {
        await finance.retryPending();
        succeeded = true;
      } else succeeded = await finance.refresh();
      const current = useFinanceStore.getState();
      if (succeeded && request.current === currentRequest && current.owner === owner) {
        setNotice({ revision: current.cloudRevision, text: confirming ? 'Resultado confirmado. Historial actualizado.'
          : previousRevision === current.cloudRevision ? 'Historial actualizado. No hay cambios nuevos.' : 'Historial actualizado con los últimos cambios.' });
      }
    } catch { /* The store exposes failures below; do not acknowledge a failed refresh. */ }
    finally { if (request.current === currentRequest) setRefreshing(false); }
  }

  if (finance.syncMode !== 'cloud') return null;
  const busy = finance.isSyncing || refreshing;
  const label = finance.pendingOperation ? 'Operación pendiente de confirmar'
    : busy ? 'Actualizando historial…'
    : finance.syncStatus === 'connected' ? 'Sincronización en tiempo real activa'
    : finance.syncStatus === 'reconnecting' ? 'Reconectando…'
    : finance.syncStatus === 'offline' ? 'Sin conexión en tiempo real' : 'Conectando…';
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.surface }}>
    <View accessibilityLiveRegion="polite" style={[styles.container, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.row}>
        {busy ? <ActivityIndicator size="small" color={settings.accentColor} /> : null}
        <ThemedText style={[styles.label, { color: finance.pendingOperation ? theme.warning : theme.textSecondary }]}>{label}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={finance.pendingOperation ? 'Confirmar resultado' : 'Actualizar historial'}
          accessibilityState={{ disabled: busy, busy }} disabled={busy} style={styles.action}
          onPress={() => { void updateHistory(); }}>
          <ThemedText style={{ color: settings.accentColor }}>{busy ? 'Actualizando…' : finance.pendingOperation ? 'Confirmar resultado' : 'Actualizar'}</ThemedText>
        </Pressable>
      </View>
      {finance.lastSyncedAt !== null ? <ThemedText style={[styles.detail, { color: theme.textSecondary }]}>Última actualización: {new Date(finance.lastSyncedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</ThemedText> : null}
      {notice && notice.revision === finance.cloudRevision && !finance.error ? <ThemedText style={[styles.detail, { color: theme.text }]}>{notice.text}</ThemedText> : null}
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
  detail: { fontSize: 12, marginTop: 4 },
});
