import { groqApiKey, groqMenorModelId } from "./llmProviders.js";

export type MensagemTitulo = {
  papel: "user" | "luna";
  texto: string;
};

/**
 * Limpa a saída do modelo — espelho do `LunaTitler` no OrbitLab.
 * No máximo 6 palavras / 40 caracteres (cabe no header e na lista).
 */
export function limparTituloConversa(bruto: string): string | null {
  const linha = bruto
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)
    ?.replace(/^T[ií]tulo:\s*/i, "")
    .trim()
    .replace(/^["'“”]+|["'“”.—\-\s]+$/g, "")
    .trim();

  if (!linha || linha === "…" || linha === "...") return null;
  const palavras = linha.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  const final = palavras.slice(0, 40).trim();
  return final.length > 0 ? final : null;
}

function montarCorpo(mensagens: MensagemTitulo[]): string {
  return mensagens
    .slice(-10)
    .map((m) => {
      const quem = m.papel === "luna" ? "Luna" : "Usuário";
      const t = m.texto.trim().slice(0, 280) || "(sem texto)";
      return `${quem}: ${t}`;
    })
    .join("\n")
    .trim();
}

/**
 * Gera um título curto (2–4 palavras) pro assunto ATUAL da conversa.
 * Modelo barato (Groq menor) — mesma família de buscar/rosário.
 */
export async function gerarTituloConversa(mensagens: MensagemTitulo[]): Promise<string> {
  const apiKey = groqApiKey();
  if (!apiKey) {
    throw new Error("Provedor de título indisponível.");
  }

  const corpo = montarCorpo(mensagens);
  if (!corpo) {
    throw new Error("Sem mensagens pra batizar a conversa.");
  }

  const baseUrl = process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1";
  const model = groqMenorModelId();

  const system =
    "Você nomeia conversas. Responda APENAS com um título curto em português do Brasil, " +
    "de 2 a 4 palavras, sem aspas e sem ponto final, capitalizado como uma frase. " +
    "Capture o assunto atual da conversa.";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 40,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Conversa:\n${corpo}\n\nTítulo:` },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `Título falhou (${res.status}).`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const bruto = data.choices?.[0]?.message?.content?.trim() ?? "";
  const limpo = limparTituloConversa(bruto);
  if (!limpo) throw new Error("Resposta vazia no título.");
  return limpo;
}
