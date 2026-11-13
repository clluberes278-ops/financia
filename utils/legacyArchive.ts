import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGACY_KEYS } from './financialRepository';
import { shareTextFile } from './fileSharing';
export async function exportLegacyArchive(): Promise<void> {
  const values = await Promise.all(LEGACY_KEYS.map(key => AsyncStorage.getItem(key)));
  const archive = JSON.stringify({ version: 1, owner: null, currency: null,
    description: 'Historial anterior sin propietario ni moneda confirmados. Valores originales sin modificar.',
    entries: LEGACY_KEYS.map((key, index) => ({ key, raw: values[index] })) }, null, 2);
  const fileName = 'Financia_Historial_Anterior.json';
  await shareTextFile(fileName, archive, 'application/json', 'Guardar historial anterior');
}
