import { File } from 'expo-file-system';

import { getSttConfig, isSttConfigured } from '../config/stt';
import { LunaApiError, lunaTranscribe } from './lunaClient';
import { VoiceClip } from './fixtures';

type UploadPart = {
  uri: string;
  type: string;
  name: string;
};

function guessUpload(uri: string): UploadPart {
  const path = uri.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.wav')) return { uri, type: 'audio/wav', name: 'gravacao.wav' };
  if (path.endsWith('.caf')) return { uri, type: 'audio/x-caf', name: 'gravacao.caf' };
  if (path.endsWith('.3gp') || path.endsWith('.3gpp')) {
    return { uri, type: 'audio/3gpp', name: 'gravacao.3gp' };
  }
  if (path.endsWith('.webm')) return { uri, type: 'audio/webm', name: 'gravacao.webm' };
  if (path.endsWith('.mp3')) return { uri, type: 'audio/mpeg', name: 'gravacao.mp3' };
  return { uri, type: 'audio/mp4', name: 'gravacao.m4a' };
}

function sttNotConfiguredError(): Error {
  return new Error(
    'STT não configurado. A Luna API ou EXPO_PUBLIC_STT_API_KEY devem estar ativos.',
  );
}

function parseApiError(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    if (json.error?.message) return json.error.message;
  } catch {
    // corpo não-JSON
  }
  if (status === 401) return 'Chave de API inválida ou expirada.';
  if (status === 413) return 'Áudio grande demais para transcrever.';
  if (status >= 500) return 'Serviço de transcrição indisponível. Tente novamente.';
  return `Transcrição falhou (${status}).`;
}

async function readAudioBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

async function transcribeViaDirectGroq(clip: VoiceClip): Promise<string> {
  if (!isSttConfigured()) throw sttNotConfiguredError();
  if (!clip.uri) throw new Error('Gravação sem arquivo — grave outra mensagem.');

  const { apiKey, apiUrl, model, language, prompt } = getSttConfig();
  const file = guessUpload(clip.uri);

  const form = new FormData();
  form.append('file', file as unknown as Blob);
  form.append('model', model);
  if (language) form.append('language', language);
  if (prompt) form.append('prompt', prompt);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseApiError(res.status, body));
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error('Não detectamos fala neste áudio.');
  return text;
}

/** Transcreve o arquivo de áudio — preferência: Luna API; fallback: Groq direto (dev). */
export async function transcribeVoiceClip(
  clip: VoiceClip,
  getIdToken?: () => Promise<string | null>,
): Promise<string> {
  if (!clip.uri) throw new Error('Gravação sem arquivo — grave outra mensagem.');

  const file = guessUpload(clip.uri);

  try {
    const audioBase64 = await readAudioBase64(clip.uri);
    const idToken = getIdToken ? await getIdToken() : null;
    return await lunaTranscribe({ audioBase64, mimeType: file.type, idToken });
  } catch (apiErr) {
    if (isSttConfigured()) {
      return transcribeViaDirectGroq(clip);
    }
    if (apiErr instanceof LunaApiError) throw apiErr;
    throw apiErr instanceof Error ? apiErr : new Error(String(apiErr));
  }
}
