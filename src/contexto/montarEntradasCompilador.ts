/**
 * Monta EntradasCompilador a partir do estado do pipeline (M1/M3).
 */

import type { PoliticaDecisao } from "../analyzers/esquema.js";
import type { ContextoSessao } from "../memoria/esquemaMemoria.js";
import type { HabitoComportamental } from "../perfil/esquemaPerfil.js";
import { gerarBlocoPerfilComportamental } from "../perfil/gerenciadorPerfil.js";
import { gerarBlocoContextoPreditivo } from "../preditivo/analisadorPreditivo.js";
import type { PriorIntencao } from "../preditivo/esquemaPreditivo.js";
import type { EntradasCompilador } from "./compiladorContexto.js";
import { montarBlocoPoliticaSituacional } from "../responder/montarPoliticaSituacional.js";
import {
  extrairDadosAmbiente,
  extrairDadosMemoria,
  extrairDadosPresenca,
  extrairDadosSense,
} from "../responder/extrairSecoesContexto.js";

export type OpcoesMontarEntradas = {
  politica: PoliticaDecisao;
  contextoSessao?: ContextoSessao;
  kernel?: string | null;
  humor?: string | null;
  prior?: PriorIntencao;
  habitos?: HabitoComportamental[];
  sugestaoMemoria?: string;
  resumoRolante?: string;
};

export function montarEntradasCompilador(opcoes: OpcoesMontarEntradas): EntradasCompilador {
  const { politica, contextoSessao, kernel, humor, prior, habitos, sugestaoMemoria, resumoRolante } =
    opcoes;

  let kernelFinal = kernel?.trim() || undefined;
  if (resumoRolante?.trim()) {
    kernelFinal = [kernelFinal, `Resumo anterior: ${resumoRolante.trim()}`]
      .filter(Boolean)
      .join("\n");
  }

  return {
    politica: montarBlocoPoliticaSituacional(politica),
    kernel: kernelFinal,
    humor: humor?.trim() || undefined,
    presenca: contextoSessao ? (extrairDadosPresenca(contextoSessao) ?? undefined) : undefined,
    memorias_longas: contextoSessao
      ? (extrairDadosMemoria(contextoSessao) ?? undefined)
      : undefined,
    sense: contextoSessao ? (extrairDadosSense(contextoSessao) ?? undefined) : undefined,
    ambiente: contextoSessao ? (extrairDadosAmbiente(contextoSessao) ?? undefined) : undefined,
    preditivo: prior ? gerarBlocoContextoPreditivo(prior) : undefined,
    habitos:
      habitos && habitos.length > 0
        ? (gerarBlocoPerfilComportamental(habitos) ?? undefined)
        : undefined,
    sugestao_memoria: sugestaoMemoria?.trim()
      ? `Inclua com naturalidade: "${sugestaoMemoria.trim()}"`
      : undefined,
  };
}
