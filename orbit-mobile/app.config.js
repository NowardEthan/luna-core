const path = require('path');
const fs = require('fs');

/** Lê ficheiro .env simples (sem dependências extra). */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const vars = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const root = __dirname;
const lunaCoreEnv = loadEnvFile(path.join(root, '..', 'core', 'src', 'luna-core', '.env'));
const localEnv = loadEnvFile(path.join(root, '.env'));
const env = { ...lunaCoreEnv, ...localEnv, ...process.env };

const lunaKey = env.LUNA_API_KEY?.trim();
const lunaBase = env.LUNA_API_BASE?.trim() ?? '';
const groqKey = env.GROQ_API_KEY?.trim();
const usesGroq =
  lunaBase.includes('groq.com') ||
  lunaKey?.startsWith('gsk_') ||
  groqKey?.startsWith('gsk_');

const GROQ_WHISPER_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';

const sttApiKey =
  env.EXPO_PUBLIC_STT_API_KEY?.trim() ||
  env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() ||
  (usesGroq ? lunaKey || groqKey : '') ||
  groqKey ||
  '';

const sttApiUrl =
  env.EXPO_PUBLIC_STT_API_URL?.trim() ||
  (sttApiKey && usesGroq ? GROQ_WHISPER_URL : 'https://api.openai.com/v1/audio/transcriptions');

const sttModel =
  env.EXPO_PUBLIC_STT_MODEL?.trim() ||
  (sttApiUrl.includes('groq.com') ? GROQ_WHISPER_MODEL : 'whisper-1');

const sttLanguage = env.EXPO_PUBLIC_STT_LANGUAGE?.trim() || 'pt';
const sttPrompt =
  env.EXPO_PUBLIC_STT_PROMPT?.trim() ||
  'Mensagem de voz em português do Brasil.';

const lunaApiUrl =
  env.EXPO_PUBLIC_LUNA_API_URL?.trim() || 'http://localhost:7742';

const firebaseApiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || '';
const firebaseProjectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || '';
const firebaseAppId = env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || '';
const firebaseAuthDomain = env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || '';
const firebaseStorageBucket = env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || '';
const firebaseMessagingSenderId = env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || '';

const googleWebClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '';
const googleAndroidClientId = env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || '';
const googleIosClientId = env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || '';

function webClientIdToIosUrlScheme(webClientId) {
  if (!webClientId || !webClientId.endsWith('.apps.googleusercontent.com')) return null;
  const prefix = webClientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${prefix}`;
}

const base = require('./app.json');

const plugins = [...(base.expo.plugins ?? [])];
if (googleWebClientId) {
  const iosUrlScheme = webClientIdToIosUrlScheme(googleWebClientId);
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
} else {
  plugins.push('@react-native-google-signin/google-signin');
}

module.exports = () => ({
  ...base,
  expo: {
    ...base.expo,
    plugins,
    extra: {
      ...(base.expo.extra ?? {}),
      sttApiKey,
      sttApiUrl,
      sttModel,
      sttLanguage,
      sttPrompt,
      lunaApiUrl,
      firebaseApiKey,
      firebaseAuthDomain,
      firebaseProjectId,
      firebaseStorageBucket,
      firebaseAppId,
      firebaseMessagingSenderId,
      googleWebClientId,
      googleAndroidClientId,
      googleIosClientId,
    },
  },
});
