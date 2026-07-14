/**
 * M3 — Compilador de contexto (Mundo Interior + identidade).
 * Único portão do briefing situacional para a voz — com orçamento explícito.
 */

export type EntradasCompilador = {
  politica: string;
  tempo?: string;
  identidade?: string;
  agentico?: string;
  formato?: string;
  ecossistema?: string;
  kernel?: string;
  intencao_luna?: string;
  humor?: string;
  presenca?: string;
  memorias_longas?: string;
  premissa?: string;
  objecao?: string;
  sense?: string;
  ambiente?: string;
  preditivo?: string;
  habitos?: string;
  habitat?: string;
  vida?: string;
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
  { chave: "tempo", titulo: "Agora", prioridade: 0, orcamento: 80 },
  { chave: "identidade", titulo: "Identidade", prioridade: 1, orcamento: 320 },
  { chave: "agentico", titulo: "Ferramentas", prioridade: 2, orcamento: 60 },
  { chave: "formato", titulo: "Formato", prioridade: 2, orcamento: 80 },
  { chave: "kernel", titulo: "Continuidade", prioridade: 2, orcamento: 400 },
  { chave: "intencao_luna", titulo: "Intenção agora", prioridade: 2, orcamento: 160 },
  { chave: "humor", titulo: "Estado", prioridade: 3, orcamento: 220 },
  { chave: "ecossistema", titulo: "Ecossistema", prioridade: 5, orcamento: 80 },
  { chave: "presenca", titulo: "Presença", prioridade: 4, orcamento: 200 },
  // Prioridade 2 e orçamento maior: com prioridade 5 e 300 tokens, a memória chegava
  // DEPOIS de as protegidas (que sozinhas somam ~1100) esgotarem o orçamento de 1100 do
  // turno casual — ou seja, era descartada SEMPRE. Não "às vezes": nunca cabia.
  { chave: "memorias_longas", titulo: "Memórias", prioridade: 2, orcamento: 600 },
  // O veredito do verificador de premissa. Prioridade 1 e protegida: se esta secção for
  // cortada, ela volta a engolir um passado que não existiu — que é o defeito que o
  // neurónio existe para matar. Só aparece nos turnos em que há algo a verificar.
  { chave: "premissa", titulo: "Verificação", prioridade: 1, orcamento: 120 },
  // O furo que um revisor externo encontrou no que ele disse. Protegida: se o orçamento a
  // cortar, ela volta a elogiar e a deixá-lo ir contra a parede sozinho.
  { chave: "objecao", titulo: "Revisão", prioridade: 1, orcamento: 180 },
  { chave: "sense", titulo: "Sense", prioridade: 6, orcamento: 200 },
  { chave: "ambiente", titulo: "Ambiente", prioridade: 7, orcamento: 200 },
  { chave: "habitat", titulo: "Habitat", prioridade: 3, orcamento: 140 },
  { chave: "vida", titulo: "Vida interior", prioridade: 3, orcamento: 180 },
  { chave: "preditivo", titulo: "Padrão recente", prioridade: 9, orcamento: 60 },
  { chave: "habitos", titulo: "Hábitos", prioridade: 9, orcamento: 80 },
  { chave: "sugestao_memoria", titulo: "Sugestão", prioridade: 10, orcamento: 60 },
];

/**
 * Secções nunca cortadas por orçamento.
 *
 * `memorias_longas` entrou aqui (2026-07-12) porque era o que a fazia esquecer: fatos do
 * usuário e trechos de outras conversas caíam nesta secção, que não era protegida — e o
 * orçamento acabava antes, sempre. A Luna lembra de quem ela é (identidade, humor, vida)
 * mas esquecia de quem está falando com ela. Lembrar do outro é parte de estar presente.
 */
const CHAVES_PROTEGIDAS = new Set<keyof Omit<EntradasCompilador, "politica">>([
  "tempo",
  "identidade",
  "intencao_luna",
  "humor",
  "vida",
  "habitat",
  "memorias_longas",
  "premissa",
  "objecao",
]);

/** Orçamento vinculante por profundidade do tálamo (pkg-comp). */
export function orcamentoPorProfundidade(profundidade: "simples" | "normal" | "profunda"): number {
  switch (profundidade) {
    case "simples":
      return 1100;
    case "profunda":
      return 1650;
    default:
      return 1300;
  }
}

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
    const protegida = CHAVES_PROTEGIDAS.has(secao.chave);
    if (limiteSecao <= 0 && !protegida) {
      cortes.push(secao.chave);
      continue;
    }

    let corpo = bruto;
    const teto = protegida ? secao.orcamento * 4 : limiteSecao;
    if (corpo.length > teto) {
      corpo = truncar(corpo, teto);
      if (!protegida) cortes.push(`${secao.chave}:truncado`);
    }

    const bloco = formatarSecao(secao.titulo, corpo);
    const tokensBloco = estimarTokens(bloco);

    if (!protegida && tokensBloco > orcamentoRestante()) {
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
