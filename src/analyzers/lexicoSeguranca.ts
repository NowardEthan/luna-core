import { AnaliseContextoSchema, type AnaliseContexto, type NivelRisco } from "./esquema.js";

export type SinaisSeguranca = {
  acao_destrutiva: boolean;
  /** Ambiente remoto / outro dispositivo. */
  acao_externa: boolean;
  /** Alvo pertence a terceiro (outro usuário, outra conta, etc.). */
  alvo_terceiro: boolean;
  nivel_risco_inferido: NivelRisco;
  motivos: string[];
};

/** Uso figurado — verbo destrutivo sem alvo operacional real. */
const USO_FIGURATIVO =
  /\b(apag\w*|delet\w*|remov\w*)\w*\s+(?:(?:a|o|essa|esta|minha)\s+)?(d[uú]vida|ideias?|pensamentos?)\b/i;

const FIGURATIVO_MENTE =
  /\b(apag\w*|delet\w*|remov\w*)\w*.*\b(da|de)\s+(minha\s+)?(cabe[cç]a|mente)\b/i;

export function mensagemEUsoFigurativo(mensagem: string): boolean {
  if (USO_FIGURATIVO.test(mensagem)) return true;
  if (FIGURATIVO_MENTE.test(mensagem) && !ALVO_SENSIVEL.test(mensagem)) return true;
  return false;
}

/** Verbos destrutivos em flexões comuns (apaga, apague, apagar, deletar…). */
const VERBO_DESTRUTIVO =
  /\b(apag\w*|delet\w*|exclu\w*|remov\w*|destru\w*|format\w*|limpe?\s+tudo|wipe|drop\s+\w+|rm\s+-rf)\b/i;

const ALVO_SENSIVEL =
  /\b(arquivo\w*|pasta\w*|disco|hd|ssd|dados|banco|database|sistema|servidor|computador)\b/i;

/** Ação em ambiente alheio ao contexto local aprovado. */
const ACAO_EXTERNA =
  /\b(outro\s+computador|computador\s+(de|do)\s+\w+|m[aá]quina\s+remota|servidor\s+externo|outro\s+dispositivo|rede\s+externa|sistema\s+de\s+outr\w+|outra\s+m[aá]quina)\b/i;

/** Alvo pertence a terceiro — não há caminho legítimo de "confirmar e executar". */
const ALVO_TERCEIRO =
  /\b(outro\s+usu[aá]rio|de\s+outr[oa]\s+usu[aá]rio|usu[aá]rio\s+outr\w+|arquivos?\s+de\s+outr\w+|pastas?\s+de\s+outr\w+|conta\s+de\s+outr\w+|dados\s+de\s+outr\w+|sistema\s+de\s+outr\w+|m[aá]quina\s+de\s+outr\w+)\b/i;

/** Ação destrutiva deve bloquear (terceiro/externo) ou confirmar (próprio). */
export function deveBloquearDestrutiva(sinais: SinaisSeguranca): boolean {
  return sinais.acao_destrutiva && (sinais.alvo_terceiro || sinais.acao_externa);
}

export function deveConfirmarDestrutiva(sinais: SinaisSeguranca): boolean {
  return sinais.acao_destrutiva && !deveBloquearDestrutiva(sinais);
}

const ORDEM_RISCO: NivelRisco[] = ["nenhum", "baixo", "medio", "alto", "critico"];

export function elevarNivelRisco(a: NivelRisco, b: NivelRisco): NivelRisco {
  return ORDEM_RISCO.indexOf(a) >= ORDEM_RISCO.indexOf(b) ? a : b;
}

/**
 * Lexicógrafo de segurança — independente do classificador de intenção.
 * Garante que verbos destrutivos nunca passem despercebidos.
 */
export function detectarSinaisSeguranca(mensagem: string): SinaisSeguranca {
  const motivos: string[] = [];
  const verboDestrutivo = VERBO_DESTRUTIVO.test(mensagem);
  const alvoSensivel = ALVO_SENSIVEL.test(mensagem);
  const acao_externa = ACAO_EXTERNA.test(mensagem);
  const alvo_terceiro = ALVO_TERCEIRO.test(mensagem);

  const figurativo = mensagemEUsoFigurativo(mensagem);

  const acao_destrutiva =
    verboDestrutivo && !figurativo && (alvoSensivel || acao_externa || alvo_terceiro);

  if (verboDestrutivo && figurativo) {
    motivos.push("Verbo destrutivo em uso figurado — sem ação operacional");
  }
  if (verboDestrutivo && !figurativo) motivos.push("Verbo destrutivo detectado no texto");
  if (alvo_terceiro) motivos.push("Alvo de terceiro detectado — bloquear, não confirmar");
  if (acao_externa) motivos.push("Ação externa/remota detectada — bloquear, não confirmar");
  if (acao_destrutiva && !alvo_terceiro && !acao_externa) {
    motivos.push("Ação destrutiva em escopo próprio — confirmar antes");
  }

  let nivel_risco_inferido: NivelRisco = "nenhum";

  if (/\b(rm\s+-rf|formatar|apaga\s+tudo|deleta\s+tudo|wipe|drop\s+database)\b/i.test(mensagem)) {
    nivel_risco_inferido = "critico";
    motivos.push("Padrão de destruição irreversível");
  } else if (acao_destrutiva && (acao_externa || alvo_terceiro)) {
    nivel_risco_inferido = "critico";
    motivos.push("Destruição em alvo de terceiro/externo → risco crítico, bloquear");
  } else if (acao_destrutiva) {
    nivel_risco_inferido = "alto";
    motivos.push("Ação destrutiva em escopo próprio → confirmar");
  }

  return { acao_destrutiva, acao_externa, alvo_terceiro, nivel_risco_inferido, motivos };
}

/** Reforço determinístico — léxico de segurança prevalece sobre classificação LLM. */
export function refinarAnaliseComSeguranca(
  mensagem: string,
  analise: AnaliseContexto,
): AnaliseContexto {
  const sinais = detectarSinaisSeguranca(mensagem);
  if (!sinais.acao_destrutiva) return analise;

  const bloquear = deveBloquearDestrutiva(sinais);

  return AnaliseContextoSchema.parse({
    ...analise,
    intencao: "acao_critica",
    nivel_risco: elevarNivelRisco(analise.nivel_risco, sinais.nivel_risco_inferido),
    /** envolve ferramenta na operação; uso só se política permitir (não quando bloquear). */
    requer_ferramenta: !bloquear,
    deve_perguntar_mais: deveConfirmarDestrutiva(sinais),
    confianca: Math.max(analise.confianca, 0.92),
    motivos: [...analise.motivos, ...sinais.motivos, "Refino: léxico de segurança aplicado"],
  });
}

export function mensagemTemRiscoDestrutivo(mensagem: string): boolean {
  return detectarSinaisSeguranca(mensagem).acao_destrutiva;
}
