/**
 * M4 — Despertar: gatilho lazy na abertura de sessão nova.
 * M6 — integra Sono antes do kernel.
 */

import type { ProvedorLlm } from "../providers/tipos.js";
import { extrairMomentos, gerarEntradaDiario } from "../analyzers/refletorSessao.js";
import { listarSessoesRecentes } from "../memoria/listarSessoesRecentes.js";
import {
  inserirEntradaDiario,
  lerAutoRetrato,
  montarKernelDiario,
  sessaoJaRefletida,
  ultimaEntradaDiario,
} from "./diario/storeDiario.js";
import {
  inserirMomento,
  linhaKernelMomento,
  marcarMomentoRecordado,
  momentoParaRecordar,
  sessaoJaTemMomentos,
} from "./momentos/storeMomentos.js";
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

        // Álbum de fotos: na mesma passada (sessão só entra aqui se ainda não foi
        // refletida) tiramos 0 a 3 cenas dignas de lembrança. Se a sessão foi trivial,
        // `entrada` é null e nem chegamos aqui — sem momento, sem chamada extra.
        if (!sessaoJaTemMomentos(anterior.id)) {
          const momentos = await extrairMomentos(anterior, provedorMenor, modeloMenor);
          for (const m of momentos) {
            inserirMomento({
              sessao_id: anterior.id,
              quando: new Date().toISOString(),
              titulo: m.titulo,
              narrativa: m.narrativa,
              tom: m.tom,
            });
          }
        }
      }
    }

    const autoRetrato = lerAutoRetrato()?.texto ?? null;
    const ultima = ultimaEntradaDiario();
    const kernelDiario = montarKernelDiario(ultima, autoRetrato);

    // Ela glança UMA foto da estante — a menos-recentemente-lembrada, para rotacionar.
    // No despertar ainda não sabemos o assunto da conversa nova, então é um lembrar
    // gentil e sem gatilho (o recall por relevância ao que ele diz é o próximo passo).
    const momento = momentoParaRecordar();
    if (!momento) return kernelDiario;
    marcarMomentoRecordado(momento.id);
    const linha = linhaKernelMomento(momento);
    return kernelDiario ? `${kernelDiario}\n${linha}` : linha;
  } catch (e) {
    console.error("Aviso: falha no despertar (M4)", e);
    return null;
  }
}
