import Constants from 'expo-constants';

type LunaApiExtra = {
  lunaApiUrl?: string;
};

function extra(): LunaApiExtra {
  return (Constants.expoConfig?.extra ?? {}) as LunaApiExtra;
}

/** URL base da Luna Mobile API (sem slash final). */
export function getLunaApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_LUNA_API_URL?.trim();
  const fromExtra = extra().lunaApiUrl?.trim();
  return (fromEnv || fromExtra || 'http://localhost:7742').replace(/\/+$/, '');
}

export function isLunaApiConfigured(): boolean {
  return getLunaApiUrl().length > 0;
}
