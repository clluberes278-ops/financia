import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCurrencyStore } from '../store/useCurrencyStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getThemeColors, ThemedText } from '../utils/theme';
import { useTranslation } from '../utils/translations';
import type { Currency } from '../types/transaction';
interface Props { value?: Currency; onChange?: (currency: Currency) => void }
export default function CurrencySelector({ value, onChange }: Props) {
  const selected = useCurrencyStore(s => s.currency);
  const setCurrency = useCurrencyStore(s => s.setCurrency);
  const { theme: mode, cardColor, accentColor } = useSettingsStore();
  const theme = getThemeColors(mode, cardColor);
  const { t } = useTranslation();
  return <View style={styles.container}>
    <View style={styles.row}>{(['DOP', 'USD'] as const).map(currency => {
      const active = (value ?? selected) === currency;
      return <Pressable key={currency} accessibilityRole="button" accessibilityState={{ selected: active }}
        accessibilityLabel={currency === 'DOP' ? t('Pesos dominicanos') : t('Dólares estadounidenses')}
        onPress={() => (onChange ?? setCurrency)(currency)}
        style={[styles.option, { borderColor: active ? accentColor : theme.border, backgroundColor: theme.surface }]}>
        <ThemedText style={{ color: active ? accentColor : theme.text, fontWeight: '700' }}>{currency}</ThemedText>
      </Pressable>;
    })}</View>
    <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>{t('Saldos separados por moneda, sin conversiones.')}</ThemedText>
  </View>;
}
const styles = StyleSheet.create({ container: { marginVertical: 10 }, row: { flexDirection: 'row', gap: 10 },
  option: { minHeight: 44, paddingHorizontal: 20, justifyContent: 'center', borderWidth: 1, borderRadius: 12 }, hint: { fontSize: 12, marginTop: 6 } });
