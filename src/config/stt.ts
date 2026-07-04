import Constants from 'expo-constants';

type SttExtra = {
  sttApiKey?: string;
  sttApiUrl?: string;
  sttModel?: string;
  sttLanguage?: string;
  sttPrompt?: string;
};

function extraStt(): SttExtra {
  return (Constants.expoConfig?.extra ?? {}) as SttExtra;
}

/** Configuração STT — Groq Whisper (luna-core .env) ou override via EXPO_PUBLIC_*. */
export function getSttConfig() {
  const extra = extraStt();

  const apiKey =
    process.env.EXPO_PUBLIC_STT_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() ||
    extra.sttApiKey?.trim() ||
    '';

  const apiUrl =
    process.env.EXPO_PUBLIC_STT_API_URL?.trim() ||
    extra.sttApiUrl?.trim() ||
    'https://api.groq.com/openai/v1/audio/transcriptions';

  const model =
    process.env.EXPO_PUBLIC_STT_MODEL?.trim() ||
    extra.sttModel?.trim() ||
    'whisper-large-v3-turbo';

  /** ISO-639-1 — `pt` cobre português (BR e PT). Omitir = auto-detecção. */
  const language =
    process.env.EXPO_PUBLIC_STT_LANGUAGE?.trim() ||
    extra.sttLanguage?.trim() ||
    'pt';

  /** Contexto para o Whisper priorizar português e pontuação natural. */
  const prompt =
    process.env.EXPO_PUBLIC_STT_PROMPT?.trim() ||
    extra.sttPrompt?.trim() ||
    'Mensagem de voz em português do Brasil.';

  return { apiKey, apiUrl, model, language, prompt };
}

export function isSttConfigured(): boolean {
  return getSttConfig().apiKey.length > 0;
}

export function getSttProviderLabel(): string {
  const { apiUrl } = getSttConfig();
  if (apiUrl.includes('groq.com')) return 'Groq Whisper';
  if (apiUrl.includes('openai.com')) return 'OpenAI Whisper';
  return 'Whisper';
}
