/**
 * M4 — Despertar: gatilho lazy na abertura de sessão nova.
 * M6 — integra Sono antes do kernel.
 */

import type { ProvedorLlm } from "../providers/tipos.js";
import { gerarEntradaDiario } from "../analyzers/refletorSessao.js";
import { listarSessoesRecentes } from "../memoria/listarSessoesRecentes.js";
import {
  inserirEntradaDiario,
  lerAutoRetrato,
  montarKernelDiario,
  sessaoJaRefletida,
  ultimaEntradaDiario,
} from "./diario/storeDiario.js";
import { lerClimaGlobal } from "./humor/climaHumor.js";
import { HUMOR_BASELINE } from "./humor/esquemaHumor.js";
import { executarSono } from "./sono/consolidador.js";

export async function despertar(
  sessaoAtualId: string,
  provedorMenor?: ProvedorLlm,
  modeloMenor?: string,
): Promise<string | null> {
  try {
    if (provedorMenor && modeloMenor) {
      await executarSono(provedorMenor, modeloMenor);
    }

    const recentes = listarSessoesRecentes();
    const anterior = recentes.find((s) => s.id !== sessaoAtualId && !sessaoJaRefletida(s.id));

    if (anterior && provedorMenor && modeloMenor) {
      const entrada = await gerarEntradaDiario(anterior, provedorMenor, modeloMenor);
      if (entrada) {
        const clima = lerClimaGlobal();
        inserirEntradaDiario({
          sessao_id: anterior.id,
          quando: new Date().toISOString(),
          narrativa: entrada.narrativa,
          clima: entrada.clima,
          pendencias: entrada.pendencias,
          como_terminou: entrada.como_terminou,
          humor_no_fim: {
            valencia: clima.valencia,
            energia: clima.energia,
            proximidade: HUMOR_BASELINE.proximidade,
          },
        });
      }
    }

    const autoRetrato = lerAutoRetrato()?.texto ?? null;
    const ultima = ultimaEntradaDiario();
    return montarKernelDiario(ultima, autoRetrato);
  } catch (e) {
    console.error("Aviso: falha no despertar (M4)", e);
    return null;
  }
}
