/**
 * Medidor de fome — C1 (A Luna que Conversa), o passo "medir antes de consertar".
 *
 * O C0 mostrou o sintoma: ela ECOA — decora o assunto DELE em vez de trazer o próprio.
 * A hipótese do C1 é a CAUSA: em muitos turnos o motor de intenção chega à mesa com a
 * DESPENSA VAZIA — sem vontades / gostos / eventos afetivos próprios — e aí o único "foco"
 * que lhe sobra é «o que a pessoa acabou de dizer» (a porta do eco, ver PROMPT_MOTOR_INTENCAO
 * em `motorIntencao.ts`, ~linha 38).
 *
 * Este medidor NÃO conserta nada (alimentar o self é C2+). Ele só PROVA se a despensa veio
 * cheia ou vazia, turno a turno — medindo EXATAMENTE o material que o motor lê (as mesmas
 * três fontes), para não medir uma aproximação. Fica DESLIGADO por padrão: só emite log se
 * `LUNA_MEDIR_FOME` estiver ligado, então não muda comportamento nenhum em produção.
 *
 * Fome = as três fontes próprias dela vieram zeradas nesse turno.
 */

export type MedidaFome = {
  vontades: number;
  gostos: number;
  eventos: number;
  /** Soma das três fontes PRÓPRIAS (o mundo interior dela). */
  total: number;
  /** true quando o motor não tinha NADA próprio — o foco cai no assunto dele (eco). */
  faminto: boolean;
  /**
   * Havia um fio em aberto entre eles? É material, mas DERIVADO da conversa (pode ser o
   * assunto dele) — por isso conta à parte e não tira a fome sozinho.
   */
  temFio: boolean;
};

/**
 * Monta a medida a partir das contagens que o motor JÁ leu — sem reler o cache, para o
 * medidor provar precisamente o que entrou (ou não entrou) no prompt daquele turno.
 */
export function medidaDeContagens(
  vontades: number,
  gostos: number,
  eventos: number,
  temFio: boolean,
): MedidaFome {
  const total = vontades + gostos + eventos;
  return { vontades, gostos, eventos, total, faminto: total === 0, temFio };
}

const FLAG = "LUNA_MEDIR_FOME";

/** Liga/desliga o medidor. Off por padrão — em produção não emite nada sem a env. */
export function medidorFomeAtivo(): boolean {
  const v = process.env[FLAG]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export type ContextoFome = {
  /** É o Ethan? (a fome dele é o caso que mais importa medir.) */
  criador: boolean;
  /** Valência do clima da Luna no turno (para cruzar fome × clima leve). */
  climaValencia: number;
};

/**
 * Emite UMA linha estruturada por turno, fácil de filtrar nos logs (Railway):
 *   grep '\[fome\]'  →  taxa de turnos famintos, e se a fome bate com clima leve.
 * No-op quando o medidor está desligado.
 */
export function registrarFome(medida: MedidaFome, ctx: ContextoFome): void {
  if (!medidorFomeAtivo()) return;
  // eslint-disable-next-line no-console
  console.info(
    `[fome] faminto=${medida.faminto} v=${medida.vontades} g=${medida.gostos} ` +
      `e=${medida.eventos} fio=${medida.temFio} total=${medida.total} ` +
      `criador=${ctx.criador} val=${ctx.climaValencia.toFixed(2)}`,
  );
}
