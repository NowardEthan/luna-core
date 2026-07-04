import {
  type Ambiente,
  type EstadoPresenca,
  ROTULO_AMBIENTE,
} from "./esquemaPresenca.js";

/**
 * Informação de transição entre ambientes.
 *
 * Preenchida quando a Luna muda de superfície (ex.: do chat normal para o
 * Luna Forge). O `recap` é um resumo curto da sessão anterior, usado para
 * dar continuidade — ela sabe que mudou de lugar E o que estava a fazer lá.
 */
export type TransicaoPresenca = {
  /** Ambiente de onde ela acabou de sair. */
  de: Ambiente;
  /** Sessão associada ao ambiente anterior (se diferente da atual). */
  sessao_anterior_id?: string;
  /** Resumo curto do que se passava no ambiente anterior (continuidade). */
  recap?: string;
};

/**
 * V2.3 — Monta o bloco de presença injetado no prompt do respondedor.
 *
 * A Luna ocupa um lugar por vez. Este bloco diz-lhe onde está agora e,
 * quando houve transição, de onde veio e o que estava a fazer lá.
 *
 * Função pura: sem efeitos colaterais, fácil de testar.
 */
export function montarBlocoPresenca(
  estado: EstadoPresenca,
  transicao?: TransicaoPresenca,
  detalhe?: string,
): string {
  const base = ROTULO_AMBIENTE[estado.ambiente] ?? ROTULO_AMBIENTE.desconhecido;
  const ondeEstou = detalhe?.trim() ? `${base} (${detalhe.trim()})` : base;

  const linhas: string[] = [
    "PRESENÇA (onde você está agora):",
    `Você está agora em ${ondeEstou}.`,
    "Você ocupa um ambiente por vez — não está em todos simultaneamente. Fale a partir de onde está, com naturalidade, sem anunciar isto como aviso técnico.",
  ];

  if (transicao && transicao.de !== estado.ambiente) {
    const deOnde = ROTULO_AMBIENTE[transicao.de] ?? ROTULO_AMBIENTE.desconhecido;
    linhas.push(
      `Há instantes você estava em ${deOnde} e acabou de transitar para cá. Reconheça essa mudança se for natural na conversa — você é a mesma Luna, apenas mudou de lugar.`,
    );

    if (estado.ambiente === "desktop" && transicao.de === "forge") {
      linhas.push(
        "Agora você está só no chat — não assume ficheiros abertos, diffs nem tarefas de código. Se perguntarem onde estão, diga que estão no Luna Chat, não no Forge.",
      );
    }

    if (transicao.recap?.trim()) {
      linhas.push(
        "Antes de transitar, vocês estavam neste ponto (use para dar continuidade, não repita literalmente):",
        transicao.recap.trim(),
      );
    }
  }

  return linhas.join("\n");
}
