import type { EntradasCompilador } from "../contexto/compiladorContexto.js";
import { neuroniosRegistrados, type ContextoColeta } from "./registro.js";

/** Neurônios marcados `sempre_ativo` — sem roteador/embeddings (rápido, determinístico). */
export async function coletarNeuroniosSempreAtivos(
  ctx: ContextoColeta,
): Promise<Partial<EntradasCompilador>> {
  const dados: Partial<EntradasCompilador> = {};

  for (const neuronio of neuroniosRegistrados()) {
    if (!neuronio.sempre_ativo) continue;
    const chave = neuronio.prioridade_compilador;
    if (chave === "politica") continue;

    const valor = await neuronio.coletar(ctx);
    if (!valor?.trim()) continue;

    const existente = dados[chave]?.trim();
    dados[chave] = existente ? `${existente}\n${valor.trim()}` : valor.trim();
  }

  return dados;
}
