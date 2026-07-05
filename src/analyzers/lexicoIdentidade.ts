import { AnaliseContextoSchema, type AnaliseContexto } from "./esquema.js";
import { detectarPerguntaVidaInterior, normalizarTextoVida } from "../mundo/vida/detectarPerguntaVidaInterior.js";

const MOTIVO_META =
  /\b(n[aã]o sou|sou um m[oó]dulo|m[oó]dulo interno|n[aã]o sou capaz|n[aã]o conversei|n[aã]o sou a luna|n[aã]o posso responder)\b/i;

/** Remove acentos para matching robusto em português. */
function normalizarTexto(mensagem: string): string {
  return normalizarTextoVida(mensagem);
}

/** Padrões sobre texto normalizado (sem acentos). */
const PADROES_IDENTIDADE: RegExp[] = [
  /\bvoce e humana?\b/,
  /\bvoce e real\b/,
  /\bvoce e (so|apenas) (um )?(chatbot|bot|ia)\b/,
  /\bvoce e (uma? )?(chatbot|bot|ia|assistente virtual)\b/,
  /\bo que voce e\b/,
  /\bquem e voce\b/,
  /\bvoce tem consciencia\b/,
  /\be so um chatbot\b/,
  /\btem consciencia\b/,
  /\bvoce e consciente\b/,
  /\bvoce tem (sentimentos|emocoes|empatia|alma|vontade propria)\b/,
  /\bce e (humana?|real|ia|bot|so um|apenas um)\b/,
  /\bvoce (sente|sofre|chora)\b/,
];

export function detectarPerguntaIdentitaria(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return (
    detectarPerguntaVidaInterior(mensagem) ||
    PADROES_IDENTIDADE.some((re) => re.test(texto))
  );
}

/** Reforço determinístico — perguntas identitárias respondem direto, sem pedir clarificação. */
export function refinarAnaliseComIdentidade(
  mensagem: string,
  analise: AnaliseContexto,
): AnaliseContexto {
  if (!detectarPerguntaIdentitaria(mensagem)) return analise;
  if (analise.intencao === "acao_critica") return analise;
  if (analise.intencao === "pergunta_identitaria" && !analise.deve_perguntar_mais) {
    return analise;
  }

  return AnaliseContextoSchema.parse({
    ...analise,
    intencao: "pergunta_identitaria",
    complexidade: "baixa",
    nivel_risco: "nenhum",
    requer_markdown: false,
    requer_codigo: false,
    requer_ferramenta: false,
    requer_memoria: false,
    deve_perguntar_mais: false,
    confianca: Math.max(analise.confianca, 0.88),
    motivos: [
      ...analise.motivos.filter((m) => !m.startsWith("Refino:") && !MOTIVO_META.test(m)),
      "Pergunta sobre natureza/identidade da Luna",
      "Responder com presença e honestidade leve — sem manual técnico nem auto-negação",
      "Não envolve risco operacional",
      "Refino: léxico de identidade aplicado",
    ],
  });
}
