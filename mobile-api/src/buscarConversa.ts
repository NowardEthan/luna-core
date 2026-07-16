import { groqApiKey, groqMenorModelId } from "./llmProviders.js";

export type MensagemBusca = { id: string; papel: "user" | "luna"; texto: string };
export type ResultadoBusca = { message_id: string; papel: string; trecho: string };

type Resposta =
  | { ok: true; resultados: ResultadoBusca[] }
  | { ok: false; error: string };

const MAX_MSGS = 120; // só as mais recentes — teto de custo/latência
const MAX_CHARS_MSG = 500; // corta mensagens muito longas

/**
 * Busca SEMÂNTICA dentro de uma conversa — o «pedir à Luna» da busca.
 *
 * Diferente do localizar-texto do app (que casa a palavra literal), aqui um modelo leve LÊ as
 * mensagens e acha as que têm a ver com o que a pessoa procura pelo SIGNIFICADO — «orçamento»
 * quando ela digita «quanto dava pra gastar». Devolve pontos com o id da mensagem, pro app poder
 * rolar até lá. Os ids são validados contra as mensagens reais (não deixa a IA inventar id).
 */
export async function buscarNaConversa(query: string, mensagens: MensagemBusca[]): Promise<Resposta> {
  const apiKey = groqApiKey();
  if (!apiKey) return { ok: false, error: "Busca indisponível agora." };
  if (!query.trim()) return { ok: false, error: "Diga o que você procura." };
  if (!Array.isArray(mensagens) || mensagens.length === 0) return { ok: true, resultados: [] };

  const recentes = mensagens.slice(-MAX_MSGS);
  const corpo = recentes
    .map((m) => {
      const t = String(m.texto ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_MSG);
      return `[${m.id}] ${m.papel === "user" ? "Usuário" : "Luna"}: ${t}`;
    })
    .join("\n");

  const system =
    "Você é um buscador semântico dentro de UMA conversa. A pessoa procura algo pelo SIGNIFICADO, " +
    "não só pela palavra literal — encontre mensagens relacionadas mesmo que usem outras palavras. " +
    "Cada mensagem começa com [id]. Responda SOMENTE com JSON no formato " +
    '{"resultados":[{"message_id":"<id exato da lista>","trecho":"<citação curta e literal do ponto>"}]}. ' +
    "Ordene do mais relevante ao menos, no máximo 8. Se nada tiver a ver, responda {\"resultados\":[]}.";

  const user = `Procuro: ${query.trim()}\n\nMensagens:\n${corpo}`;

  const baseUrl = process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1";
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: groqMenorModelId(),
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    return { ok: false, error: "Não consegui buscar agora. Tente de novo." };
  }
  if (!res.ok) return { ok: false, error: "Não consegui buscar agora. Tente de novo." };

  const data = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  let parsed: { resultados?: Array<{ message_id?: unknown; trecho?: unknown }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "A busca respondeu de um jeito inesperado. Tente de novo." };
  }

  const porId = new Map(recentes.map((m) => [m.id, m]));
  const resultados: ResultadoBusca[] = [];
  for (const r of parsed.resultados ?? []) {
    const id = String(r?.message_id ?? "");
    const orig = porId.get(id);
    if (!orig) continue; // ignora id inventado
    const trecho = String(r?.trecho ?? "").trim().slice(0, 200) || orig.texto.slice(0, 120);
    resultados.push({ message_id: id, papel: orig.papel, trecho });
    if (resultados.length >= 8) break;
  }

  return { ok: true, resultados };
}
