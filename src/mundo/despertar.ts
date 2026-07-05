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
import { lerHumor } from "./humor/storeHumor.js";
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
        const humor = lerHumor();
        inserirEntradaDiario({
          sessao_id: anterior.id,
          quando: new Date().toISOString(),
          narrativa: entrada.narrativa,
          clima: entrada.clima,
          pendencias: entrada.pendencias,
          como_terminou: entrada.como_terminou,
          humor_no_fim: {
            valencia: humor.valencia,
            energia: humor.energia,
            proximidade: humor.proximidade,
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
