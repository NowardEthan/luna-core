import { analisarContexto, type ResultadoAnalise } from "../analyzers/analisadorContextoLlm.js";
import { criarIdInteracao, registrarInteracao } from "../logs/registradorDecisao.js";
import { gerarPolitica, type ResultadoPipeline } from "./executarPipeline.js";
import { responderComoLuna, type ResultadoResposta } from "../responder/responderLuna.js";
import { carregarConfig, type ConfigLuna, type ProvedorLlm } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";

export type ResultadoCompleto = {
  pipeline: ResultadoPipeline;
  analise: ResultadoAnalise;
  resposta?: ResultadoResposta;
  log_path: string;
};

export type OpcoesPipelineCompleto = {
  provedor?: ProvedorLlm;
  config?: ConfigLuna;
  /** Se false, só calcula política (modo policy). */
  gerarResposta?: boolean;
};

function resolverProvedor(config: ConfigLuna): ProvedorLlm {
  return criarProvedorOpenAi({ apiKey: config.apiKey, baseUrl: config.baseUrl });
}

/**
 * Pipeline V0.3 — mini modelos → política → modelo grande → log.
 */
export async function executarPipelineCompleto(
  mensagem: string,
  opcoes: OpcoesPipelineCompleto = {},
): Promise<ResultadoCompleto> {
  const inicio = Date.now();
  const config = opcoes.config ?? carregarConfig() ?? undefined;
  const provedor = opcoes.provedor ?? (config ? resolverProvedor(config) : undefined);
  const gerarResposta = opcoes.gerarResposta ?? Boolean(provedor && config);

  const analise = await analisarContexto(
    mensagem,
    provedor,
    config?.modeloMenor,
  );

  const pipeline = gerarPolitica(mensagem, analise.analise);

  let resposta: ResultadoResposta | undefined;

  if (gerarResposta && provedor && config) {
    resposta = await responderComoLuna(
      mensagem,
      pipeline.politica,
      provedor,
      config.modeloMaior,
      config.temperaturaMaior,
    );
  }

  const log_path = registrarInteracao({
    id: criarIdInteracao(),
    timestamp: new Date().toISOString(),
    versao_core: "0.1.0",
    mensagem_usuario: mensagem,
    analise: pipeline.analise,
    analise_fonte: analise.fonte,
    politica: pipeline.politica,
    pontuacoes: pipeline.pontuacoes,
    resposta_luna: resposta?.texto,
    modelo_menor: analise.modelo ?? (analise.fonte === "regras" ? "regras" : undefined),
    modelo_maior: resposta?.modelo,
    latencia_analise_ms: analise.latencia_ms,
    latencia_resposta_ms: resposta?.latencia_ms,
    latencia_total_ms: Date.now() - inicio,
  });

  return { pipeline, analise, resposta, log_path };
}
