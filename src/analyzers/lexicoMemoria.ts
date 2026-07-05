import { AnaliseContextoSchema, type AnaliseContexto } from "./esquema.js";

function normalizarTexto(mensagem: string): string {
  return mensagem
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Apelidos reservados à Luna — nunca usar como nome do interlocutor. */
export const APELIDOS_LUNA_RESERVADOS = new Set([
  "luna",
  "luninha",
  "lu",
  "luquinha",
  "lunona",
  "voce",
  "você",
]);

export function ehApelidoDaLuna(nome: string): boolean {
  const lower = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return APELIDOS_LUNA_RESERVADOS.has(lower);
}

/**
 * Cumprimento ou vocativo dirigido à Luna («oi luninha») — não é nome do usuário.
 */
export function detectarVocativoParaLuna(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  const temApelidoLuna = /\b(luna|luninha|luquinha|lunona)\b/.test(texto);
  if (!temApelidoLuna) return false;

  if (/\b(meu nome|me chamo)\b/.test(texto)) return false;

  if (
    /^(oi|ola|e ai|bom dia|boa tarde|boa noite|hey|hi|salve|ta ai|tudo bem)\b/.test(
      texto,
    )
  ) {
    return true;
  }

  if (/\b(luna|luninha)[\s!?.…]*$/.test(texto)) return true;

  return false;
}

const PADROES_RECALL_SESSAO: RegExp[] = [
  /\blembra\s+(do|da|de|que|o)\b/,
  /\blembrou\s+(do|da|de|que|o)\b/,
  /\bo que (eu )?(te )?(disse|falei|contei|mencionei|pedi)\b/,
  /\bo que (te )?(contei|falei|disse)\b/,
  /\bo que falamos\b/,
  /\brecapitul/,
  /\bda ultima vez\b/,
  /\bda outra vez\b/,
];

/** Preferências explícitas do usuário — tipo "preferencia" no neurônio. */
const PADROES_PREFERENCIA: RegExp[] = [
  /\bprefiro\b/,
  /\bgosto de\b/,
  /\bnao gosto\b/,
  /\bsempre (use|utilize|escreva|prefira|coloque|responda|fale|comunique)\b/,
  /\bquando.*sempre\b/,
];

/** Informação que vale guardar na sessão (nome, contexto pessoal, fatos gerais). */
const PADROES_ARMAZENAR: RegExp[] = [
  ...PADROES_PREFERENCIA,
  /\bme chamo\b/,
  /\bmeu nome e\b/,
  /\btrabalho com\b/,
  /\bsou (arquiteto|dev|desenvolvedor|engenheiro|designer)\b/,
];

/** Saúde, neurodivergência e dados pessoais sensíveis — exigem confirmação (V1.2). */
const PADROES_SENSIVEL: RegExp[] = [
  /\bsou autist/,
  /\bsou neurodiverg/,
  /\btenho tdah\b/,
  /\btenho (depressao|ansiedade|bipolar|toc|diabetes|hipertensao|cancer|epilepsia|sindrome)\b/,
  /\b(sou|tenho) (transtorno|diagnost|condicao cronica|doenca cronica)\b/,
  /\b(sou )?(gay|lesbic|bissexual|trans|nao binari)/,
  /\b(sou )?(neurodivergente|autista)\b/,
];

/** Usuário confirma armazenamento pendente. */
const PADROES_CONFIRMACAO: RegExp[] = [
  /\bsim\b.*\b(pode|pode sim)\b.*\b(lembr|guard|salv|anot)/,
  /\b(pode lembrar|pode guardar|pode anotar|sim pode)\b/,
  /\bconfirmo\b.*\b(lembr|guard|salv)/,
  /\b(autorizo|pode sim)\b/,
];

export function detectarRecallSessao(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return PADROES_RECALL_SESSAO.some((re) => re.test(texto));
}

export function detectarPreferencia(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return PADROES_PREFERENCIA.some((re) => re.test(texto));
}

export function detectarInformacaoParaMemoria(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return PADROES_ARMAZENAR.some((re) => re.test(texto));
}

export function detectarInformacaoSensivel(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return PADROES_SENSIVEL.some((re) => re.test(texto));
}

export function detectarConfirmacaoMemoria(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return PADROES_CONFIRMACAO.some((re) => re.test(texto));
}

/** Corrige classificações erradas do LLM sobre memória de sessão. */
export function refinarAnaliseComMemoria(
  mensagem: string,
  analise: AnaliseContexto,
): AnaliseContexto {
  const recall = detectarRecallSessao(mensagem);
  const armazenar = detectarInformacaoParaMemoria(mensagem);

  if (!recall && !armazenar) return analise;

  const motivos = [
    ...analise.motivos.filter((m) => !m.startsWith("Refino memória:")),
  ];

  if (recall) {
    motivos.push("Refino memória: pedido de recall da sessão atual");
    return AnaliseContextoSchema.parse({
      ...analise,
      intencao: analise.intencao === "acao_critica" ? analise.intencao : "conversa_casual",
      requer_memoria: false,
      deve_perguntar_mais: false,
      nivel_risco: "nenhum",
      confianca: Math.max(analise.confianca, 0.9),
      motivos,
    });
  }

  if (detectarInformacaoSensivel(mensagem)) {
    motivos.push("Refino memória: informação sensível — confirmação via neurônio V1.2");
    return AnaliseContextoSchema.parse({
      ...analise,
      intencao: "conversa_casual",
      requer_memoria: true,
      deve_perguntar_mais: false,
      nivel_risco: "nenhum",
      confianca: Math.max(analise.confianca, 0.9),
      motivos,
    });
  }

  motivos.push("Refino memória: informação relevante para continuidade da sessão");
  return AnaliseContextoSchema.parse({
    ...analise,
    intencao: analise.intencao === "pergunta_identitaria" ? "conversa_casual" : analise.intencao,
    requer_memoria: true,
    deve_perguntar_mais: false,
    confianca: Math.max(analise.confianca, 0.88),
    motivos,
  });
}
