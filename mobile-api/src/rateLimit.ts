import type { IncomingMessage } from "node:http";

/**
 * Rate limit in-memory (sliding window) por uid e teto frouxo por IP.
 *
 * Não substitui a cota do plano (`quota_exceeded`): isto é proteção anti-rajada /
 * abuso de custo. Resposta: HTTP 429 com `code: "rate_limited"`.
 *
 * Limites por env (defaults generosos pro uso humano normal):
 * - LUNA_RL_CHAT_PER_MIN (40)
 * - LUNA_RL_STT_PER_MIN (12)
 * - LUNA_RL_VISION_PER_MIN (20)
 * - LUNA_RL_EXTRACT_PER_MIN (20)
 * - LUNA_RL_BUSCAR_PER_MIN (30)
 * - LUNA_RL_ROSARY_PER_MIN (20)
 * - LUNA_RL_TITULO_PER_MIN (30)
 * - LUNA_RL_IP_PER_MIN (120) — teto por IP em rotas caras
 * - LUNA_RL_WINDOW_MS (60000)
 * - LUNA_RL_DISABLED=1 — desliga (dev/teste)
 */

export type RateLimitBucket =
  | "chat"
  | "stt"
  | "vision"
  | "extract"
  | "buscar"
  | "rosary"
  | "titulo";

export type RateLimitOk = { ok: true };
export type RateLimitDenied = {
  ok: false;
  retryAfterSec: number;
  limit: number;
  windowMs: number;
  scope: "uid" | "ip";
};
export type RateLimitDecision = RateLimitOk | RateLimitDenied;

export const RATE_LIMITED_CODE = "rate_limited" as const;

/** Mensagem humana — NÃO é parede de cota ("lua dormiu"). */
export const RATE_LIMITED_MESSAGE =
  "Calma — tô recebendo rápido demais agora. Espera uns segundos e manda de novo.";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function rateLimitDisabled(): boolean {
  const v = process.env.LUNA_RL_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function rateLimitWindowMs(): number {
  return envInt("LUNA_RL_WINDOW_MS", 60_000);
}

export function rateLimitForBucket(bucket: RateLimitBucket): number {
  switch (bucket) {
    case "chat":
      return envInt("LUNA_RL_CHAT_PER_MIN", 40);
    case "stt":
      return envInt("LUNA_RL_STT_PER_MIN", 12);
    case "vision":
      return envInt("LUNA_RL_VISION_PER_MIN", 20);
    case "extract":
      return envInt("LUNA_RL_EXTRACT_PER_MIN", 20);
    case "buscar":
      return envInt("LUNA_RL_BUSCAR_PER_MIN", 30);
    case "rosary":
      return envInt("LUNA_RL_ROSARY_PER_MIN", 20);
    case "titulo":
      return envInt("LUNA_RL_TITULO_PER_MIN", 30);
  }
}

export function rateLimitIpPerWindow(): number {
  return envInt("LUNA_RL_IP_PER_MIN", 120);
}

/** Contador sliding-window por chave (timestamps ms). */
export class SlidingWindowCounter {
  private readonly hits = new Map<string, number[]>();

  /** Para testes. */
  reset(): void {
    this.hits.clear();
  }

  /** Quantos hits ainda contam na janela (após poda). */
  peek(key: string, now: number, windowMs: number): number {
    const list = this.hits.get(key);
    if (!list?.length) return 0;
    const corte = now - windowMs;
    let i = 0;
    while (i < list.length && list[i]! < corte) i += 1;
    if (i > 0) list.splice(0, i);
    if (list.length === 0) this.hits.delete(key);
    return list.length;
  }

  /**
   * Tenta consumir 1 slot. Se já está no teto, NÃO registra o hit e devolve denied.
   */
  tryConsume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitDecision {
    if (limit < 1) return { ok: true };
    const list = this.hits.get(key) ?? [];
    const corte = now - windowMs;
    let i = 0;
    while (i < list.length && list[i]! < corte) i += 1;
    if (i > 0) list.splice(0, i);

    if (list.length >= limit) {
      const oldest = list[0] ?? now;
      const retryAfterMs = Math.max(1, oldest + windowMs - now);
      this.hits.set(key, list);
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        limit,
        windowMs,
        scope: key.startsWith("ip:") ? "ip" : "uid",
      };
    }

    list.push(now);
    this.hits.set(key, list);
    return { ok: true };
  }
}

/** Instância do processo (Railway = 1 instância por réplica — ok pra V1). */
export const rateLimitCounter = new SlidingWindowCounter();

export function clientIp(req: IncomingMessage): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0]!.trim().slice(0, 64);
  }
  if (Array.isArray(xf) && xf[0]) {
    return xf[0].split(",")[0]!.trim().slice(0, 64);
  }
  const ra = req.socket?.remoteAddress?.trim();
  return (ra && ra.length > 0 ? ra : "unknown").slice(0, 64);
}

/**
 * Checa uid (se houver) + teto de IP. Ambos precisam passar.
 * UID usa o limite do bucket; IP usa o teto frouxo global.
 */
export function checkRateLimit(opts: {
  uid?: string | null;
  ip: string;
  bucket: RateLimitBucket;
  now?: number;
  counter?: SlidingWindowCounter;
}): RateLimitDecision {
  if (rateLimitDisabled()) return { ok: true };

  const counter = opts.counter ?? rateLimitCounter;
  const windowMs = rateLimitWindowMs();
  const now = opts.now ?? Date.now();
  const ip = opts.ip.trim() || "unknown";

  const ipDecision = counter.tryConsume(
    `ip:${ip}`,
    rateLimitIpPerWindow(),
    windowMs,
    now,
  );
  if (!ipDecision.ok) {
    return { ...ipDecision, scope: "ip" };
  }

  const uid = opts.uid?.trim();
  if (uid) {
    const uidDecision = counter.tryConsume(
      `uid:${opts.bucket}:${uid}`,
      rateLimitForBucket(opts.bucket),
      windowMs,
      now,
    );
    if (!uidDecision.ok) {
      return { ...uidDecision, scope: "uid" };
    }
  }

  return { ok: true };
}

export function rateLimitedPayload(denied: RateLimitDenied): {
  ok: false;
  error: string;
  code: typeof RATE_LIMITED_CODE;
  retryAfterSec: number;
} {
  return {
    ok: false,
    error: RATE_LIMITED_MESSAGE,
    code: RATE_LIMITED_CODE,
    retryAfterSec: denied.retryAfterSec,
  };
}
