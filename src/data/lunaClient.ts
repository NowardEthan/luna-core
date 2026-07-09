import { getLunaApiUrl } from '../config/lunaApi';
import { parseHumorBadge, type LunaHumorBadge } from '../lib/lunaHumor';
import { postSse } from '../lib/lunaSseClient';
import type { ResearchSource } from '../lib/researchTrace';

export type LunaChatRequest = {
  message: string;
  sessionId?: string;
  userMessageId?: string;
  lunaMessageId?: string;
  idToken?: string | null;
  userDisplayName?: string;
  providerId?: 'groq' | 'cerebras' | 'openrouter' | 'auto';
  modelKey?: 'default' | 'glm-47' | 'gpt-oss-120b' | 'deepseek-v3.2' | 'auto';
  /** Fuso IANA do dispositivo (ex.: "America/Sao_Paulo") — grounding temporal da Luna. */
  timeZone?: string;
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
      humor_atual?: LunaHumorBadge;
      idempotent?: boolean;
      quotaMode?: 'plan' | 'reduced';
    }
  | {
      ok: false;
      error: string;
      code?: 'quota_exceeded';
      quotaKind?: string;
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
  streamSupported?: boolean;
  llmProviders?: Array<{
    providerId: 'groq' | 'cerebras' | 'openrouter' | 'auto';
    modelKey: 'default' | 'glm-47' | 'gpt-oss-120b' | 'deepseek-v3.2' | 'auto';
    label: string;
    description: string;
    modelId: string;
  }>;
};

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'AbortError' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error')
  );
}

export class LunaApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly quotaKind?: string;

  constructor(message: string, opts?: { code?: string; status?: number; quotaKind?: string }) {
    super(message);
    this.name = 'LunaApiError';
    this.code = opts?.code;
    this.status = opts?.status;
    this.quotaKind = opts?.quotaKind;
  }
}

function authHeaders(idToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

export type LunaBillingUsageSnapshot = {
  planId: string;
  cycle: 'window' | 'monthly' | 'unlimited';
  bindingCycle?: 'window' | 'weekly' | 'monthly';
  periodKey: string;
  usedTokens: number;
  windowTokenLimit: number | null;
  remainingTokens: number | null;
  bonusTurns: number;
  resetsAtMs: number | null;
  windowHours: number | null;
  weeklyTokens?: {
    used: number;
    limit: number;
    remaining: number;
    resetsAtMs: number;
  } | null;
  reducedMode?: {
    available: boolean;
    dailyUsed: number;
    dailyLimit: number;
    dailyRemaining: number;
    resetsAtMs: number;
    requestsPerMinute: number;
    inputTokensPerMinute: number;
  } | null;
};

/** Snapshot autoritativo de quota (mobile-api / Firestore). */
export async function lunaFetchUsage(idToken: string): Promise<LunaBillingUsageSnapshot> {
  const base = getLunaApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers = authHeaders(idToken);
    const res = await fetch(`${base}/v1/billing/usage`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const data = (await res.json()) as {
      ok: boolean;
      usage?: LunaBillingUsageSnapshot;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.usage) {
      throw new LunaApiError(data.error || `Erro ${res.status}`, { status: res.status });
    }
    return data.usage;
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    if (isNetworkFailure(err)) {
      throw new LunaApiError('Sem conexão para atualizar o contador de tokens.');
    }
    throw new LunaApiError('Não foi possível consultar o uso de mensagens.');
  } finally {
    clearTimeout(timeout);
  }
}

export type LunaRosaryReflectionRequest = {
  mysteryName: string;
  mysterySetLabel: string;
  intention?: string;
};

/** Reflexão breve no terço — Groq Pulse, sem pipeline completo. */
export async function lunaRosaryReflection(
  request: LunaRosaryReflectionRequest,
  idToken?: string | null,
): Promise<string> {
  const base = getLunaApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const res = await fetch(`${base}/v1/rosary/reflection`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });
  const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
  if (!res.ok || !data.ok || !data.text) {
    throw new LunaApiError(data.error || `Erro ${res.status}`, { status: res.status });
  }
  return data.text;
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
        userDisplayName: request.userDisplayName,
        providerId: request.providerId,
        modelKey: request.modelKey,
        timeZone: request.timeZone,
      }),
      signal: controller.signal,
    });

    const data = (await res.json()) as LunaChatResponse;

    if (!data.ok) {
      if (res.status === 401) {
        throw new LunaApiError('Sessão expirada. Reinicie o app e tente novamente.', {
          status: 401,
        });
      }
      if (res.status === 429 || data.code === 'quota_exceeded') {
        throw new LunaApiError(
          data.error ||
            'Limite atingido. Faça upgrade em Ajustes → Planos ou aguarde a renovação.',
          { code: 'quota_exceeded', status: 429, quotaKind: data.quotaKind },
        );
      }
      throw new LunaApiError(data.error || `Erro ${res.status}`, { status: res.status });
    }

    return {
      ...data,
      humor_atual: parseHumorBadge(data.humor_atual),
    };
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    if (isNetworkFailure(err)) {
      throw new LunaApiError(
        'Sem conexão com a internet. Verifique o Wi‑Fi ou os dados móveis e tente de novo.',
      );
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LunaApiError('A Luna demorou demais para responder. Tente novamente.');
    }
    throw new LunaApiError(
      'Não consegui falar com a Luna. Verifique a conexão ou se a API está online.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export type LunaStreamDone = {
  text: string;
  reasoning?: string;
  sessionId: string;
  turnCount: number;
  providerId?: string;
  modelKey?: string;
  providerReason?: string;
  autoMode?: boolean;
  humor_atual?: LunaHumorBadge;
  idempotent?: boolean;
  quotaMode?: 'plan' | 'reduced';
};

export type LunaAcaoAgentico = {
  tipo: 'inicio_ferramenta' | 'fim_ferramenta';
  ferramenta: string;
  argumentos: Record<string, unknown>;
  rodada: number;
  maxRodadas: number;
  sucesso?: boolean;
  fontes?: ResearchSource[];
};

export type LunaStreamHandlers = {
  onStatus?: (phase: 'analysing' | 'memory' | 'writing') => void;
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
  onAcao?: (acao: LunaAcaoAgentico) => void;
  onDone?: (payload: LunaStreamDone) => void;
  onError?: (error: string) => void;
};

let cachedStreamSupported: boolean | null = null;

/** Indica se o servidor suporta POST /v1/chat/stream (cache em memória). */
export async function lunaStreamSupported(): Promise<boolean> {
  if (cachedStreamSupported != null) return cachedStreamSupported;
  const health = await lunaHealth();
  cachedStreamSupported = health?.streamSupported === true;
  return cachedStreamSupported;
}

function parseSseBlock(
  event: string,
  dataLine: string,
  handlers: LunaStreamHandlers,
): LunaStreamDone | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataLine) as Record<string, unknown>;
  } catch {
    return null;
  }

  switch (event) {
    case 'status':
      handlers.onStatus?.(data.phase as 'analysing' | 'memory' | 'writing');
      break;
    case 'reasoning':
      if (typeof data.delta === 'string') handlers.onReasoningDelta?.(data.delta);
      break;
    case 'content':
      if (typeof data.delta === 'string') handlers.onContentDelta?.(data.delta);
      break;
    case 'acao':
      if (typeof data.tipo === 'string' && typeof data.ferramenta === 'string') {
        handlers.onAcao?.({
          tipo: data.tipo as 'inicio_ferramenta' | 'fim_ferramenta',
          ferramenta: data.ferramenta,
          argumentos: (data.argumentos as Record<string, unknown>) ?? {},
          rodada: Number(data.rodada ?? 0),
          maxRodadas: Number(data.maxRodadas ?? 0),
          sucesso: typeof data.sucesso === 'boolean' ? data.sucesso : undefined,
          fontes: Array.isArray(data.fontes) ? (data.fontes as ResearchSource[]) : undefined,
        });
      }
      break;
    case 'error':
      handlers.onError?.(typeof data.error === 'string' ? data.error : 'Erro de streaming.');
      break;
    case 'done':
      return {
        text: String(data.text ?? ''),
        reasoning: typeof data.reasoning === 'string' ? data.reasoning : undefined,
        sessionId: String(data.sessionId ?? ''),
        turnCount: Number(data.turnCount ?? 0),
        providerId: typeof data.providerId === 'string' ? data.providerId : undefined,
        modelKey: typeof data.modelKey === 'string' ? data.modelKey : undefined,
        providerReason: typeof data.providerReason === 'string' ? data.providerReason : undefined,
        autoMode: data.autoMode === true,
        humor_atual: parseHumorBadge(data.humor_atual),
        idempotent: typeof data.idempotent === 'boolean' ? data.idempotent : undefined,
        quotaMode: data.quotaMode === 'reduced' ? 'reduced' : data.quotaMode === 'plan' ? 'plan' : undefined,
      };
  }
  return null;
}

/** Envia turno de chat com streaming SSE (Cerebras). */
export async function lunaChatStream(
  request: LunaChatRequest,
  handlers: LunaStreamHandlers,
): Promise<LunaStreamDone> {
  const base = getLunaApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let donePayload: LunaStreamDone | null = null;

  try {
    await postSse({
      url: `${base}/v1/chat/stream`,
      headers: authHeaders(request.idToken),
      body: JSON.stringify({
        message: request.message,
        sessionId: request.sessionId,
        userMessageId: request.userMessageId,
        lunaMessageId: request.lunaMessageId,
        userDisplayName: request.userDisplayName,
        providerId: request.providerId,
        modelKey: request.modelKey,
        timeZone: request.timeZone,
      }),
      signal: controller.signal,
      onEvent: (event, dataLine) => {
        const parsed = parseSseBlock(event, dataLine, handlers);
        if (parsed) donePayload = parsed;
      },
    });

    const result = donePayload as LunaStreamDone | null;
    if (!result || !result.text.trim()) {
      throw new LunaApiError('A Luna não gerou texto via streaming.');
    }

    handlers.onDone?.(result);
    return result;
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : undefined;
    if (status === 401) {
      throw new LunaApiError('Sessão expirada. Reinicie o app e tente novamente.', { status: 401 });
    }
    if (status === 429) {
      throw new LunaApiError('Limite atingido. Faça upgrade em Ajustes → Planos ou aguarde a renovação.', {
        code: 'quota_exceeded',
        status: 429,
      });
    }
    if (status != null && status >= 400) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LunaApiError(message.slice(0, 280) || `Erro ${status}`, { status });
    }
    if (isNetworkFailure(err)) {
      throw new LunaApiError(
        'Sem conexão com a internet. Verifique o Wi‑Fi ou os dados móveis e tente novamente.',
      );
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LunaApiError('A Luna demorou demais para responder. Tente novamente.');
    }
    throw new LunaApiError(
      'Não consegui falar com a Luna. Verifique a conexão ou se a API está online.',
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
