import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'orbit.luna.billing.cpfcnpj';

export function normalizeCpfCnpj(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidCpfCnpj(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
}

export function formatCpfCnpjDisplay(digits: string): string {
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2')
      .slice(0, 14);
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

export async function readSavedCpfCnpj(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    const digits = normalizeCpfCnpj(v);
    return isValidCpfCnpj(digits) ? digits : null;
  } catch {
    return null;
  }
}

export async function saveCpfCnpj(digits: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, digits);
  } catch {
    /* ignora */
  }
}
