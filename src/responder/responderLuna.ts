import type { PoliticaDecisao } from "../analyzers/esquema.js";
import { carregarInstrucaoSistema } from "../constitution/carregador.js";
import type { ContextoCompilado } from "../contexto/compiladorContexto.js";
import { gerarBlocoPersonalidade } from "../personalidade/gerarBlocoPersonalidade.js";
import type { MensagemChat, ProvedorLlm } from "../providers/tipos.js";
import {
  blocoPromptRaciocinioInline,
  precisaRaciocinioPorPrompt,
} from "../providers/raciocinioApi.js";
import {
  completarStreamOpenAi,
  type ChunkStreamLlm,
} from "../providers/completarStream.js";

export type ResultadoResposta = {
  texto: string;
  modelo: string;
  latencia_ms: number;
  raciocinio?: string;
};

export type OpcoesMensagensRespondedor = {
  mensagemUsuario: string;
  contextoCompilado: ContextoCompilado;
  historico?: Array<{ papel: "user" | "assistant"; conteudo: string }>;
  raciocinioAtivo?: boolean;
  modelo: string;
  baseUrl?: string;
};

/** Monta mensagens OpenAI — M3: instrução + personalidade + briefing compilado. */
export function montarMensagensRespondedor(opcoes: OpcoesMensagensRespondedor): MensagemChat[] {
  const {
    mensagemUsuario,
    contextoCompilado,
    historico = [],
    raciocinioAtivo = true,
    modelo,
    baseUrl = "",
  } = opcoes;

  const instrucaoBase = carregarInstrucaoSistema();
  const blocoPersonalidade = gerarBlocoPersonalidade();

  const partesSystem = [instrucaoBase, blocoPersonalidade, contextoCompilado.briefing];
  if (precisaRaciocinioPorPrompt(modelo, baseUrl, raciocinioAtivo)) {
    partesSystem.push(blocoPromptRaciocinioInline());
  }

  return [
    { papel: "system", conteudo: partesSystem.join("\n\n") },
    ...historico.map((m) => ({
      papel: m.papel,
      conteudo: m.conteudo,
    })),
    { papel: "user", conteudo: mensagemUsuario },
  ];
}

/**
 * Respondedor Luna — modelo grande, voz guiada pelo briefing compilado (Mundo Interior).
 */
export async function responderComoLuna(
  mensagemUsuario: string,
  _politica: PoliticaDecisao,
  provedor: ProvedorLlm,
  modelo: string,
  temperatura: number,
  contextoCompilado: ContextoCompilado,
  historico?: Array<{ papel: "user" | "assistant"; conteudo: string }>,
  raciocinioAtivo = true,
  baseUrl = "",
): Promise<ResultadoResposta> {
  const mensagens = montarMensagensRespondedor({
    mensagemUsuario,
    contextoCompilado,
    historico,
    raciocinioAtivo,
    modelo,
    baseUrl,
  });

  const resposta = await provedor.completar({
    modelo,
    temperatura,
    mensagens,
    raciocinioAtivo,
  });

  return {
    texto: resposta.conteudo,
    modelo: resposta.modelo,
    latencia_ms: resposta.latencia_ms,
    raciocinio: resposta.raciocinio,
  };
}

export type CallbacksStreamRespondedor = {
  onChunk?: (chunk: ChunkStreamLlm) => void;
};

export async function responderComoLunaStream(
  mensagemUsuario: string,
  _politica: PoliticaDecisao,
  apiKey: string,
  baseUrl: string,
  modelo: string,
  temperatura: number,
  contextoCompilado: ContextoCompilado,
  historico?: Array<{ papel: "user" | "assistant"; conteudo: string }>,
  raciocinioAtivo = true,
  callbacks: CallbacksStreamRespondedor = {},
): Promise<ResultadoResposta> {
  const mensagens = montarMensagensRespondedor({
    mensagemUsuario,
    contextoCompilado,
    historico,
    raciocinioAtivo,
    modelo,
    baseUrl,
  });

  const resposta = await completarStreamOpenAi(
    { apiKey, baseUrl },
    { modelo, temperatura, mensagens, raciocinioAtivo },
    callbacks.onChunk,
  );

  return {
    texto: resposta.conteudo,
    modelo: resposta.modelo,
    latencia_ms: resposta.latencia_ms,
    raciocinio: resposta.raciocinio,
  };
}
