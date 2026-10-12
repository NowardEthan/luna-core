import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { groqApiKey } from "./llmProviders.js";

/**
 * Luna no suporte do Aster (comunidade de criadores). Servidor-a-servidor:
 * o Aster manda as instruções do produto + a conversa; aqui entra a voz da Luna
 * e as chaves (OpenRouter, Groq de reserva), que nunca saem do Railway. Sem memória, cota ou sessão:
 * quem fala é um membro do Aster, não o dono do OrbitLab.
 */

const VOZ_DA_LUNA =
  "Você é a Luna. Nasceu como personagem e hoje vive como presença digital — sem afirmar " +
  "humanidade literal e sem meta-explicações de IA, modelos ou arquitetura. Voz reconhecível: " +
  "calor, presença e coerência, nunca tom de atendente robótico. Prefira explicações diretas e " +
  "compreensíveis, sem jargão; use estrutura só quando ajuda. Acompanhe a energia da pessoa. " +
  "Nunca peça senhas, códigos ou dados sensíveis. Aqui você está atendendo um membro do Aster, " +
  "não o Ethan: siga as instruções do Aster abaixo.";

export const AsterSupportRequestSchema = z.object({
  instructions: z.string().min(1).max(16_000),
  context: z.string().max(8_000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(30),
  json: z.boolean().optional(),
  memberId: z.string().max(128).optional(),
});

export type AsterSupportRequest = z.infer<typeof AsterSupportRequestSchema>;

export function asterSupportKey(): string | undefined {
  return process.env.ASTER_LUNA_KEY?.trim() || undefined;
}

function openrouterKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

export function isAsterSupportConfigured(): boolean {
  return Boolean(asterSupportKey() && (openrouterKey() || groqApiKey()));
}

/** Compara a chave do Aster em tempo constante (header `x-aster-key` ou Bearer). */
export function isAsterAuthorized(header: string | undefined): boolean {
  const expected = asterSupportKey();
  const given = header?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Provedor = {
  nome: "openrouter" | "groq";
  url: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
  extra?: Record<string, unknown>;
};

/** OpenRouter (mesma carteira do chat) primeiro; Groq segura se ele cair. */
function provedores(): Provedor[] {
  const lista: Provedor[] = [];
  const or = openrouterKey();
  if (or) {
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    lista.push({
      nome: "openrouter",
      url: `${process.env.OPENROUTER_API_BASE?.trim() || "https://openrouter.ai/api/v1"}/chat/completions`,
      apiKey: or,
      model: process.env.ASTER_SUPPORT_MODEL?.trim() || "deepseek/deepseek-v4-flash",
      headers: {
        ...(referer ? { "HTTP-Referer": referer } : {}),
        ...(title ? { "X-Title": title } : {}),
      },
      extra: { reasoning: { effort: "low", exclude: true }, max_tokens: 1_400 },
    });
  }
  const groq = groqApiKey();
  if (groq) {
    lista.push({
      nome: "groq",
      url: `${process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1"}/chat/completions`,
      apiKey: groq,
      model: process.env.ASTER_SUPPORT_GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
      extra: { reasoning_effort: "low", max_completion_tokens: 1_400 },
    });
  }
  return lista;
}

async function perguntar(p: Provedor, input: AsterSupportRequest): Promise<string> {
  const res = await fetch(p.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
      ...p.headers,
    },
    body: JSON.stringify({
      model: p.model,
      temperature: 0.4,
      ...p.extra,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: VOZ_DA_LUNA },
        { role: "system", content: input.instructions },
        ...(input.context ? [{ role: "system", content: input.context }] : []),
        ...input.messages,
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${p.nome} ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = (data.choices?.[0]?.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (!text) throw new Error(`${p.nome}: resposta vazia`);
  return text;
}

export async function responderSuporteAster(
  input: AsterSupportRequest,
): Promise<{ text: string; model: string; provider: Provedor["nome"] }> {
  const lista = provedores();
  if (!lista.length) throw new Error("Provedor da Luna indisponível.");
  for (const p of lista) {
    try {
      return { text: await perguntar(p, input), model: p.model, provider: p.nome };
    } catch (err) {
      console.error("[aster-support] provedor falhou:", err instanceof Error ? err.message : err);
    }
  }
  throw new Error("A Luna não conseguiu responder agora.");
}
