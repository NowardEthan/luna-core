import type { PoliticaDecisao, AnaliseContexto } from "../analyzers/esquema.js";
import { carregarInstrucaoSistema } from "../constitution/carregador.js";
import type { ContextoCompilado } from "../contexto/compiladorContexto.js";
import type { InterlocutorPipeline } from "../interlocutor/esquemaInterlocutor.js";
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
  raciocinioEffort?: "low" | "medium" | "high";
  modelo: string;
  baseUrl?: string;
  interlocutor?: InterlocutorPipeline;
  intencao?: AnaliseContexto["intencao"];
};

/** Monta mensagens OpenAI — M3: instrução constitucional + briefing compilado (identidade incluída). */
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

  const partesSystem = [instrucaoBase, contextoCompilado.briefing];
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
  interlocutor?: InterlocutorPipeline,
  intencao?: AnaliseContexto["intencao"],
  raciocinioEffort?: "low" | "medium" | "high",
): Promise<ResultadoResposta> {
  const mensagens = montarMensagensRespondedor({
    mensagemUsuario,
    contextoCompilado,
    historico,
    raciocinioAtivo,
    raciocinioEffort,
    modelo,
    baseUrl,
    interlocutor,
    intencao,
  });

  const resposta = await provedor.completar({
    modelo,
    temperatura,
    mensagens,
    raciocinioAtivo,
    raciocinioEffort,
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
  interlocutor?: InterlocutorPipeline,
  intencao?: AnaliseContexto["intencao"],
  raciocinioEffort?: "low" | "medium" | "high",
): Promise<ResultadoResposta> {
  const mensagens = montarMensagensRespondedor({
    mensagemUsuario,
    contextoCompilado,
    historico,
    raciocinioAtivo,
    raciocinioEffort,
    modelo,
    baseUrl,
    interlocutor,
    intencao,
  });

  const resposta = await completarStreamOpenAi(
    { apiKey, baseUrl },
    { modelo, temperatura, mensagens, raciocinioAtivo, raciocinioEffort },
    callbacks.onChunk,
  );

  return {
    texto: resposta.conteudo,
    modelo: resposta.modelo,
    latencia_ms: resposta.latencia_ms,
    raciocinio: resposta.raciocinio,
  };
}
