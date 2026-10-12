import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { groqApiKey } from "./llmProviders.js";

/**
 * Luna no suporte do Aster (comunidade de criadores). Servidor-a-servidor:
 * o Aster manda as instruções do produto + a conversa; aqui entra a voz da Luna
 * e a chave do provedor, que nunca saem do Railway. Sem memória, cota ou sessão:
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

export function isAsterSupportConfigured(): boolean {
  return Boolean(asterSupportKey() && groqApiKey());
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

export async function responderSuporteAster(
  input: AsterSupportRequest,
): Promise<{ text: string; model: string }> {
  const apiKey = groqApiKey();
  if (!apiKey) throw new Error("Provedor da Luna indisponível.");

  const baseUrl = process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1";
  const model = process.env.ASTER_SUPPORT_MODEL?.trim() || "openai/gpt-oss-120b";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      reasoning_effort: "low",
      max_completion_tokens: 1_400,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: VOZ_DA_LUNA },
        { role: "system", content: input.instructions },
        ...(input.context ? [{ role: "system", content: input.context }] : []),
        ...input.messages,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[aster-support] provedor falhou:", res.status, errText.slice(0, 300));
    throw new Error(`Provedor da Luna falhou (${res.status}).`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = (data.choices?.[0]?.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (!text) throw new Error("Resposta vazia da Luna.");
  return { text, model };
}
