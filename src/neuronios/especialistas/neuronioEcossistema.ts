import { inferirEFormatarConhecimento } from "../../conhecimento/formatarConhecimento.js";
import type { ContextoColeta } from "../registro.js";

const INTENCOES_ECOSSISTEMA = new Set([
  "pergunta_arquitetura",
  "pergunta_ecossistema",
  "pergunta_produto",
]);

export function deveAtivarNeuronioEcossistema(intencao: string): boolean {
  return INTENCOES_ECOSSISTEMA.has(intencao);
}

export async function coletarSliceEcossistema(ctx: ContextoColeta): Promise<string | null> {
  if (!deveAtivarNeuronioEcossistema(ctx.intencao)) return null;
  return inferirEFormatarConhecimento(ctx.mensagem, 3, { intencao: ctx.intencao });
}
