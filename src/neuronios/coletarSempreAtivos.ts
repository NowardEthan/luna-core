import type { EntradasCompilador } from "../contexto/compiladorContexto.js";
import { neuroniosRegistrados, type ContextoColeta } from "./registro.js";

/** Neurônios marcados `sempre_ativo` — sem roteador/embeddings (rápido, determinístico). */
export async function coletarNeuroniosSempreAtivos(
  ctx: ContextoColeta,
): Promise<Partial<EntradasCompilador>> {
  const dados: Partial<EntradasCompilador> = {};

  // P1 (Luna Profunda) — coleta concorrente. A aplicação abaixo mantém a ordem
  // de registro dos neurônios, então a concatenação sai idêntica à versão em série.
  const ativos = neuroniosRegistrados().filter(
    (n) => n.sempre_ativo && n.prioridade_compilador !== "politica",
  );
  const valores = await Promise.all(ativos.map((n) => n.coletar(ctx)));

  for (let i = 0; i < ativos.length; i++) {
    const valor = valores[i];
    if (!valor?.trim()) continue;
    const chave = ativos[i].prioridade_compilador;
    const existente = dados[chave]?.trim();
    dados[chave] = existente ? `${existente}\n${valor.trim()}` : valor.trim();
  }

  return dados;
}
