import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { isAnyLlmProviderConfigured } from "./llmProviders.js";
import { executarChatAster } from "./loadCore.js";

/**
 * Luna no suporte do Aster. Servidor-a-servidor: o Aster manda as orientações do
 * atendimento + a conversa; quem responde é a Luna inteira (mesmo pipeline do OrbitLab),
 * na superfície `aster`. As chaves nunca saem do Railway.
 */

export const AsterSupportRequestSchema = z.object({
  instructions: z.string().min(1).max(24_000),
  context: z.string().max(8_000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(30)
    .refine((list) => list[list.length - 1]?.role === "user", "A última mensagem precisa ser do membro."),
  memberId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  memberName: z.string().max(60).optional(),
});

export type AsterSupportRequest = z.infer<typeof AsterSupportRequestSchema>;

export function asterSupportKey(): string | undefined {
  return process.env.ASTER_LUNA_KEY?.trim() || undefined;
}

export function isAsterSupportConfigured(): boolean {
  return Boolean(asterSupportKey() && isAnyLlmProviderConfigured());
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
  const anteriores = input.messages.slice(0, -1);
  const atual = input.messages[input.messages.length - 1]!;
  const resultado = await executarChatAster({
    message: atual.content,
    historico: anteriores.map((m) => ({
      papel: m.role,
      conteudo: m.content,
    })),
    memberId: input.memberId,
    memberName: input.memberName,
    orientacoes: [input.instructions, input.context].filter(Boolean).join("\n\n"),
  });
  return { text: resultado.text, model: resultado.provider.modelKey };
}
