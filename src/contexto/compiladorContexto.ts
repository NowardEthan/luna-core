/**
 * M3 — Compilador de contexto (Mundo Interior).
 * Único portão do briefing situacional para a voz — com orçamento explícito.
 */

export type EntradasCompilador = {
  politica: string;
  kernel?: string;
  humor?: string;
  presenca?: string;
  memorias_longas?: string;
  sense?: string;
  ambiente?: string;
  preditivo?: string;
  habitos?: string;
  sugestao_memoria?: string;
};

export type ContextoCompilado = {
  briefing: string;
  tokens_estimados: number;
  cortes: string[];
};

type SecaoDef = {
  chave: keyof Omit<EntradasCompilador, "politica">;
  titulo: string;
  prioridade: number;
  orcamento: number;
};

const SECOES: SecaoDef[] = [
  { chave: "kernel", titulo: "Continuidade", prioridade: 2, orcamento: 400 },
  { chave: "humor", titulo: "Estado", prioridade: 3, orcamento: 60 },
  { chave: "presenca", titulo: "Presença", prioridade: 4, orcamento: 250 },
  { chave: "memorias_longas", titulo: "Memórias", prioridade: 5, orcamento: 300 },
  { chave: "sense", titulo: "Sense", prioridade: 6, orcamento: 200 },
  { chave: "ambiente", titulo: "Ambiente", prioridade: 7, orcamento: 250 },
  { chave: "preditivo", titulo: "Padrão recente", prioridade: 8, orcamento: 60 },
  { chave: "habitos", titulo: "Hábitos", prioridade: 9, orcamento: 80 },
  { chave: "sugestao_memoria", titulo: "Sugestão", prioridade: 10, orcamento: 60 },
];

const ORCAMENTO_POLITICA = 150;

function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

function truncar(texto: string, maxChars: number): string {
  if (texto.length <= maxChars) return texto;
  return `${texto.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatarSecao(titulo: string, corpo: string): string {
  return `── ${titulo} ──\n${corpo.trim()}`;
}

export function compilarContexto(
  entradas: EntradasCompilador,
  orcamentoTokens = 1200,
): ContextoCompilado {
  const cortes: string[] = [];
  const partes: string[] = [];

  const politica = entradas.politica.trim();
  if (!politica) {
    throw new Error("compiladorContexto: política é obrigatória e não pode ser vazia");
  }

  const politicaFmt = formatarSecao("Política ativa", politica);
  partes.push(politicaFmt);

  let tokensUsados = estimarTokens(politicaFmt);
  const orcamentoRestante = () => Math.max(0, orcamentoTokens - tokensUsados);

  const secoesOrdenadas = [...SECOES].sort((a, b) => a.prioridade - b.prioridade);

  for (const secao of secoesOrdenadas) {
    const bruto = entradas[secao.chave]?.trim();
    if (!bruto) continue;

    const limiteSecao = Math.min(secao.orcamento * 4, orcamentoRestante() * 4);
    if (limiteSecao <= 0) {
      cortes.push(secao.chave);
      continue;
    }

    let corpo = bruto;
    if (corpo.length > limiteSecao) {
      corpo = truncar(corpo, limiteSecao);
      cortes.push(`${secao.chave}:truncado`);
    }

    const bloco = formatarSecao(secao.titulo, corpo);
    const tokensBloco = estimarTokens(bloco);

    if (tokensBloco > orcamentoRestante()) {
      cortes.push(secao.chave);
      continue;
    }

    partes.push(bloco);
    tokensUsados += tokensBloco;
  }

  const briefing = partes.join("\n\n");
  return {
    briefing,
    tokens_estimados: estimarTokens(briefing),
    cortes,
  };
}

/** M2 — entradas mínimas para rota simples. */
export function entradasCompiladorSimples(
  politica: string,
  extras?: Pick<EntradasCompilador, "kernel" | "humor">,
): EntradasCompilador {
  return {
    politica,
    kernel: extras?.kernel,
    humor: extras?.humor,
  };
}
