/** Trace parcial do pipeline PAIA — espelha o que o Orbit recebe em onPipelineTrace. */
export type TraceNarrativaRaciocinio = {
  intencao?: string;
  complexidade?: string;
  nivelRisco?: string;
  politicaAcao?: string;
  politicaTom?: string;
  politicaModo?: string;
  memoriaAcao?: string;
  memoriaTipo?: string;
  memoriaMotivo?: string;
};

const INTENCAO: Record<string, string> = {
  conversa_casual: "uma saudação ou conversa casual",
  pedido_codigo: "um pedido de código",
  pedido_ajuda: "um pedido de ajuda",
  pergunta_factual: "uma pergunta factual",
  recall: "uma consulta de memória",
  criacao_conteudo: "um pedido de criação de conteúdo",
};

const RISCO: Record<string, string> = {
  nenhum: "sem risco relevante",
  baixo: "com risco baixo",
  medio: "com risco médio",
  alto: "com risco alto",
  critico: "com risco crítico",
};

const COMPLEXIDADE: Record<string, string> = {
  baixa: "baixa",
  media: "média",
  alta: "alta",
};

const ACAO_POLITICA: Record<string, string> = {
  responder: "responder directamente",
  recusar: "recusar o pedido",
  confirmar: "pedir confirmação antes de agir",
  executar: "executar uma acção",
  perguntar: "perguntar antes de prosseguir",
  bloquear: "bloquear por segurança",
};

const TOM: Record<string, string> = {
  casual: "de forma casual",
  tecnico: "de forma técnica",
  empatico: "com empatia",
  direto: "de forma directa",
  formal: "de forma formal",
  acolhedor_afetivo: "de forma acolhedora",
};

const MEMORIA_ACAO: Record<string, string> = {
  armazenar: "guardar algo relevante na memória",
  ignorar: "não guardar nada neste turno",
  confirmar: "pedir confirmação antes de guardar",
  atualizar: "actualizar memória existente",
  solicitar_confirmacao: "solicitar confirmação de memória",
};

function rotulo(map: Record<string, string>, key: string | undefined, fallback: string): string {
  if (!key?.trim()) return fallback;
  return map[key] ?? key.replace(/_/g, " ");
}

/**
 * Narrativa legível do pipeline interno — mostrada na timeline do Orbit (rodada 1).
 */
export function montarNarrativaRaciocinio(trace: TraceNarrativaRaciocinio): string {
  const partes: string[] = [];

  const intencao = rotulo(INTENCAO, trace.intencao, "uma mensagem tua");
  const risco = rotulo(RISCO, trace.nivelRisco, "");
  const complexidade = trace.complexidade
    ? rotulo(COMPLEXIDADE, trace.complexidade, trace.complexidade)
    : null;

  if (risco && risco !== "sem risco relevante") {
    partes.push(`Percebi ${intencao}, ${risco}.`);
  } else {
    partes.push(`Percebi ${intencao}, sem risco relevante.`);
  }

  if (complexidade) {
    partes.push(`A complexidade parece-me ${complexidade}.`);
  }

  const acao = rotulo(ACAO_POLITICA, trace.politicaAcao, "responder");
  const tom = rotulo(TOM, trace.politicaTom, "de forma natural");
  partes.push(`Vou ${acao} ${tom}.`);

  const memAcao = rotulo(MEMORIA_ACAO, trace.memoriaAcao, "não alterar a memória");
  if (trace.memoriaAcao === "ignorar" || !trace.memoriaAcao) {
    partes.push("Não vou guardar nada na memória neste turno.");
  } else {
    partes.push(`Quanto à memória: ${memAcao}.`);
  }

  if (trace.memoriaMotivo?.trim()) {
    partes.push(trace.memoriaMotivo.trim().endsWith(".")
      ? trace.memoriaMotivo.trim()
      : `${trace.memoriaMotivo.trim()}.`);
  }

  return partes.join(" ");
}
