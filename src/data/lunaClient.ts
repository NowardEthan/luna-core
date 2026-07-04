import { getLunaApiUrl } from '../config/lunaApi';

export type LunaChatRequest = {
  message: string;
  sessionId?: string;
  userMessageId?: string;
  lunaMessageId?: string;
  idToken?: string | null;
  providerId?: 'groq' | 'openrouter' | 'auto';
  modelKey?: 'default' | 'qwen-next' | 'qwen-coder' | 'auto';
};

export type LunaChatResponse =
  | {
      ok: true;
      text: string;
      sessionId: string;
      turnCount: number;
      providerId?: string;
      modelKey?: string;
      providerReason?: string;
      autoMode?: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export type LunaTranscribeResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

export type LunaVisionResponse =
  | { ok: true; descriptions: Array<{ name?: string; description: string }> }
  | { ok: false; error: string };

export type LunaExtractDocumentsResponse =
  | { ok: true; documents: Array<{ name?: string; text: string; truncated?: boolean }> }
  | { ok: false; error: string };

export type LunaHealthResponse = {
  ok?: boolean;
  coreReady?: boolean;
  llmConfigured?: boolean;
  sttConfigured?: boolean;
  visionConfigured?: boolean;
  documentExtractAvailable?: boolean;
  firebaseConfigured?: boolean;
  llmProviders?: Array<{
    providerId: 'groq' | 'openrouter' | 'auto';
    modelKey: 'default' | 'qwen-next' | 'qwen-coder' | 'auto';
    label: string;
    description: string;
    modelId: string;
  }>;
};

export class LunaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LunaApiError';
  }
}

function authHeaders(idToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

/** Envia um turno de chat à Luna Mobile API. */
export async function lunaChat(request: LunaChatRequest): Promise<LunaChatResponse & { ok: true }> {
  const base = getLunaApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${base}/v1/chat`, {
      method: 'POST',
      headers: authHeaders(request.idToken),
      body: JSON.stringify({
        message: request.message,
        sessionId: request.sessionId,
        userMessageId: request.userMessageId,
        lunaMessageId: request.lunaMessageId,
        providerId: request.providerId,
        modelKey: request.modelKey,
      }),
      signal: controller.signal,
    });

    const data = (await res.json()) as LunaChatResponse;

    if (!data.ok) {
      if (res.status === 401) {
        throw new LunaApiError('Sessão expirada. Reinicie o app e tente novamente.');
      }
      throw new LunaApiError(data.error || `Erro ${res.status}`);
    }

    return data;
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LunaApiError('A Luna demorou demais para responder. Tente novamente.');
    }
    throw new LunaApiError(
      'Não consegui falar com a Luna. Verifique se a API está rodando (`npm run luna-api`).',
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Transcreve áudio via Luna Mobile API (Whisper no servidor). */
export async function lunaTranscribe(input: {
  audioBase64: string;
  mimeType: string;
  idToken?: string | null;
}): Promise<string> {
  const base = getLunaApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${base}/v1/transcribe`, {
      method: 'POST',
      headers: authHeaders(input.idToken),
      body: JSON.stringify({
        audioBase64: input.audioBase64,
        mimeType: input.mimeType,
        language: 'pt',
      }),
      signal: controller.signal,
    });

    const data = (await res.json()) as LunaTranscribeResponse;
    if (!data.ok) {
      throw new LunaApiError(data.error || `Erro ${res.status}`);
    }
    return data.text;
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LunaApiError('A transcrição demorou demais. Tente novamente.');
    }
    throw new LunaApiError('Não consegui transcrever via Luna API.');
  } finally {
    clearTimeout(timeout);
  }
}

/** Descreve imagens via Luna Mobile API (Groq vision no servidor). */
export async function lunaVisionDescribe(input: {
  images: Array<{ imageBase64: string; mimeType: string; name?: string }>;
  userPrompt?: string;
  idToken?: string | null;
}): Promise<Array<{ name?: string; description: string }>> {
  const base = getLunaApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${base}/v1/vision`, {
      method: 'POST',
      headers: authHeaders(input.idToken),
      body: JSON.stringify({
        images: input.images,
        userPrompt: input.userPrompt,
      }),
      signal: controller.signal,
    });

    const data = (await res.json()) as LunaVisionResponse;
    if (!data.ok) {
      if (res.status === 401) {
        throw new LunaApiError('Sessão expirada. Reinicie o app e tente novamente.');
      }
      if (res.status === 404) {
        throw new LunaApiError(
          'Visão ainda não disponível no servidor. Faça redeploy da Luna API (POST /v1/vision).',
        );
      }
      throw new LunaApiError(data.error || `Erro ${res.status}`);
    }
    return data.descriptions;
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LunaApiError('A análise da imagem demorou demais. Tente novamente.');
    }
    throw new LunaApiError('Não consegui analisar a imagem via Luna API.');
  } finally {
    clearTimeout(timeout);
  }
}

/** Extrai texto de documentos via Luna Mobile API (PDF, DOCX, MD, etc.). */
export async function lunaExtractDocuments(input: {
  files: Array<{ fileBase64: string; mimeType: string; name?: string }>;
  idToken?: string | null;
}): Promise<Array<{ name?: string; text: string; truncated?: boolean }>> {
  const base = getLunaApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${base}/v1/extract-documents`, {
      method: 'POST',
      headers: authHeaders(input.idToken),
      body: JSON.stringify({ files: input.files }),
      signal: controller.signal,
    });

    const data = (await res.json()) as LunaExtractDocumentsResponse;
    if (!data.ok) {
      if (res.status === 401) {
        throw new LunaApiError('Sessão expirada. Reinicie o app e tente novamente.');
      }
      if (res.status === 404) {
        throw new LunaApiError(
          'Leitura de arquivos ainda não disponível no servidor. Faça redeploy da Luna API (POST /v1/extract-documents).',
        );
      }
      throw new LunaApiError(data.error || `Erro ${res.status}`);
    }
    return data.documents;
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LunaApiError('A leitura do arquivo demorou demais. Tente novamente.');
    }
    throw new LunaApiError('Não consegui ler o arquivo via Luna API.');
  } finally {
    clearTimeout(timeout);
  }
}

/** Verifica se a API está online e o Core compilado. */
export async function lunaHealth(): Promise<LunaHealthResponse | null> {
  try {
    const res = await fetch(`${getLunaApiUrl()}/health`, { method: 'GET' });
    if (!res.ok) return null;
    return (await res.json()) as LunaHealthResponse;
  } catch {
    return null;
  }
}

export async function isLunaApiOnline(): Promise<boolean> {
  const data = await lunaHealth();
  return data?.ok === true && data.coreReady === true;
}
