import { analisarContexto, type ResultadoAnalise } from "../analyzers/analisadorContextoLlm.js";
import { criarIdInteracao, registrarInteracao } from "../logs/registradorDecisao.js";
import { avaliarMemoria, type ResultadoMemoria } from "../memoria/analisadorMemoria.js";
import {
  obterOuCriarSessao,
  prepararContextoRespondedor,
  registrarTurno,
  atualizarContextoAcumulado,
  atualizarEstadoInterno,
} from "../memoria/gerenciadorSessao.js";
import type { MemoriaSessao } from "../memoria/esquemaMemoria.js";
import { mapDecisaoParaAcaoMemoria } from "../memoria/esquemaMemoria.js";
import { gerarPolitica, type ResultadoPipeline } from "./executarPipeline.js";
import { responderComoLuna, responderComoLunaStream, type ResultadoResposta } from "../responder/responderLuna.js";
import { carregarConfig, type ConfigLuna, type ProvedorLlm } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { providerSupportsStream, type ChunkStreamLlm } from "../providers/completarStream.js";
import { buscarFatosDePerfil, buscarFatosPorSimilaridade } from "../memoria/longa/storeSqlite.js";
import { entrarComTransicao, atualizarAtividade } from "../presenca/gerenciadorPresenca.js";
import type { Ambiente, EstadoPresenca } from "../presenca/esquemaPresenca.js";
import { montarBlocoPresenca, type TransicaoPresenca } from "../presenca/contextoPresenca.js";
import { montarRecapSessao } from "../presenca/recapTransicao.js";
import { gerarPriorIntencao } from "../preditivo/analisadorPreditivo.js";
import type { PriorIntencao } from "../preditivo/esquemaPreditivo.js";
import { carregarPerfil, salvarPerfil } from "../perfil/storePerfil.js";
import { ativarHabitos, adicionarOuIncrementarHabito } from "../perfil/gerenciadorPerfil.js";
import type { HabitoComportamental } from "../perfil/esquemaPerfil.js";
import { montarNarrativaRaciocinio } from "./montarNarrativaRaciocinio.js";

export type ResultadoCompleto = {
  pipeline: ResultadoPipeline;
  analise: ResultadoAnalise;
  memoria?: ResultadoMemoria;
  resposta?: ResultadoResposta;
  prior?: PriorIntencao;
  habitos_ativos?: HabitoComportamental[];
  /** Narrativa PT do pipeline PAIA — timeline rodada 1 no Orbit. */
  narrativa_pipeline?: string;
  log_path: string;
  sessao?: MemoriaSessao;
};

export type OpcoesPipelineCompleto = {
  provedor?: ProvedorLlm;
  config?: ConfigLuna;
  gerarResposta?: boolean;
  sessaoId?: string;
  usarMemoriaSessao?: boolean;
  /** Se false, neurônio de memória usa só regras (sem LLM). */
  usarNeuronioMemoriaLlm?: boolean;
  /** V2.3 — ambiente de origem da chamada (atualiza estado de presença). */
  ambiente?: Ambiente;
  /** V2.3 — detalhe legível do ambiente atual (ex.: nome do workspace no Forge). */
  detalhe_ambiente?: string;
  /** I4 Orbit — trechos de outras sessões (recall entre conversas). */
  contexto_cross_sessao?: string[];
  /** I5 Orbit IDE — snapshot do workspace (explorador, editor, terminal, git). */
  contexto_ide?: string;
  /** Luna Sense — actividade do computador (separado de Forge). */
  contexto_sense?: string;
  /** Default true — pede raciocínio explícito ao modelo maior quando suportado. */
  raciocinioAtivo?: boolean;
  onStatusHint?: (hint: string) => void;
  /** Trace parcial do pipeline PAIA para a timeline do Orbit. */
  onPipelineTrace?: (trace: {
    intencao?: string;
    complexidade?: string;
    nivelRisco?: string;
    politicaAcao?: string;
    politicaTom?: string;
    politicaModo?: string;
    memoriaAcao?: string;
    memoriaTipo?: string;
    memoriaMotivo?: string;
  }) => void;
  /** Raciocínio do modelo maior — rodada 2 no chat (rodada 1 = pipeline). */
  onRaciocinioRodada?: (rodada: number, texto: string, emProgresso: boolean) => void;
  /** Streaming SSE — só quando stream=true e provider Cerebras. */
  stream?: boolean;
  onStreamReasoningDelta?: (delta: string) => void;
  onStreamContentDelta?: (delta: string) => void;
  onStreamDone?: (resposta: ResultadoResposta) => void;
};

function resolverProvedor(config: ConfigLuna): ProvedorLlm {
  return criarProvedorOpenAi({ apiKey: config.apiKey, baseUrl: config.baseUrl });
}

function resolverProvedorMenor(config: ConfigLuna): ProvedorLlm {
  if (config.apiKeyMenor) {
    return criarProvedorOpenAi({
      apiKey: config.apiKeyMenor,
      baseUrl: config.baseUrlMenor ?? "https://openrouter.ai/api/v1",
    });
  }
  return resolverProvedor(config);
}

/**
 * Pipeline V1.8 — analisador (+ prior top-down) → política → neurônio memória → respondedor → log.
 */
export async function executarPipelineCompleto(
  mensagem: string,
  opcoes: OpcoesPipelineCompleto = {},
): Promise<ResultadoCompleto> {
  const inicio = Date.now();
  const config = opcoes.config ?? carregarConfig() ?? undefined;
  const provedor = opcoes.provedor ?? (config ? resolverProvedor(config) : undefined);
  // Se provedor foi passado explicitamente (ex: testes com mock), usa ele para tudo.
  // Caso contrário, usa provedor separado para modelos menores quando configurado.
  const provedorMenor = opcoes.provedor ?? (config ? resolverProvedorMenor(config) : provedor);
  const gerarResposta = opcoes.gerarResposta ?? Boolean(provedor && config);
  const usarMemoria = opcoes.usarMemoriaSessao ?? true;
  const neuronioLlm = opcoes.usarNeuronioMemoriaLlm ?? true;
  const raciocinioAtivo = opcoes.raciocinioAtivo !== false;

  opcoes.onStatusHint?.("A analisar intenção…");

  // V2.3 — atualiza presença: entra no ambiente (detectando transição) e marca conversa ativa
  let estadoPresenca: EstadoPresenca | undefined;
  let transicaoPresenca: TransicaoPresenca | undefined;
  if (opcoes.ambiente) {
    const r = entrarComTransicao(opcoes.ambiente, opcoes.sessaoId);
    estadoPresenca = r.estado;
    transicaoPresenca = r.transicao;
    atualizarAtividade("conversa_ativa");
  }

  const sessao = usarMemoria ? obterOuCriarSessao(opcoes.sessaoId) : undefined;
  const contextoSessao = sessao ? prepararContextoRespondedor(sessao) : undefined;

  if (contextoSessao && opcoes.contexto_ide?.trim()) {
    contextoSessao.contexto_ambiente = opcoes.contexto_ide.trim();
  }

  if (contextoSessao && opcoes.contexto_sense?.trim()) {
    contextoSessao.contexto_sense = opcoes.contexto_sense.trim();
  }

  // V2.3 — injeta o bloco de presença (onde ela está + transição + recap de continuidade)
  if (contextoSessao && estadoPresenca) {
    contextoSessao.ambiente_atual = estadoPresenca.ambiente;
    const sessaoAnterior = transicaoPresenca?.sessao_anterior_id;
    if (sessaoAnterior && sessaoAnterior !== opcoes.sessaoId) {
      const recap = montarRecapSessao(sessaoAnterior);
      if (recap) transicaoPresenca = { ...transicaoPresenca!, recap };
    }
    contextoSessao.contexto_presenca = montarBlocoPresenca(
      estadoPresenca,
      transicaoPresenca,
      opcoes.detalhe_ambiente,
    );
  }

  if (contextoSessao) {
    try {
      const perfis = buscarFatosDePerfil();
      const palavras = await buscarFatosPorSimilaridade(mensagem);
      const longoPrazo = [...perfis, ...palavras].map(m => {
        let texto = `Fato: ${m.conteudo}`;
        if (m.uso_recomendado) texto += ` - Orientação: ${m.uso_recomendado}`;
        texto += ` - Visibilidade: ${m.visibilidade_uso}`;
        return texto;
      });
      const cross = opcoes.contexto_cross_sessao ?? [];
      const merged = [...longoPrazo, ...cross];
      if (merged.length > 0) {
        contextoSessao.memorias_longas = Array.from(new Set(merged));
      }
    } catch (e) {
      console.error("Aviso: falha ao buscar memórias longas do SQLite", e);
      const cross = opcoes.contexto_cross_sessao ?? [];
      if (cross.length > 0 && contextoSessao) {
        contextoSessao.memorias_longas = cross;
      }
    }
  }

  // V1.8 — lê contexto acumulado da sessão como prior top-down
  const contextoAcumulado = sessao?.contexto_acumulado;

  // V2.1 — lê estado interno anterior como prior para o tálamo
  const estadoInternoAnterior = sessao?.estado_interno;

  const analise = await analisarContexto(
    mensagem,
    provedorMenor,
    config?.modeloMenor,
    contextoAcumulado,
    estadoInternoAnterior,
  );

  opcoes.onPipelineTrace?.({
    intencao: analise.analise.intencao,
    complexidade: analise.analise.complexidade,
    nivelRisco: analise.analise.nivel_risco,
  });

  // V2.1 — recalcula e persiste estado interno após análise
  if (sessao) atualizarEstadoInterno(sessao, analise.analise);
  const estadoInterno = sessao?.estado_interno;

  // V3.1 — prior preditivo: padrão de intenções recentes → dica para o respondedor
  const prior = gerarPriorIntencao(sessao, analise.analise);

  // V3.2 — perfil comportamental: carrega hábitos e ativa os relevantes para esta intenção
  const perfil = carregarPerfil();
  const habitosAtivos = ativarHabitos(perfil, analise.analise.intencao);

  const pipeline = gerarPolitica(mensagem, analise.analise, estadoInterno);

  opcoes.onPipelineTrace?.({
    intencao: analise.analise.intencao,
    complexidade: analise.analise.complexidade,
    nivelRisco: analise.analise.nivel_risco,
    politicaAcao: pipeline.politica.acao,
    politicaTom: pipeline.politica.tom,
    politicaModo: pipeline.politica.modo,
  });

  opcoes.onStatusHint?.("A consultar memória…");

  const memoria = await avaliarMemoria(
    mensagem,
    sessao,
    neuronioLlm ? provedorMenor : undefined,
    neuronioLlm ? config?.modeloMenor : undefined,
  );

  const politicaComMemoria = {
    ...pipeline.politica,
    acao_memoria: mapDecisaoParaAcaoMemoria(memoria.decisao),
  };

  opcoes.onPipelineTrace?.({
    intencao: analise.analise.intencao,
    complexidade: analise.analise.complexidade,
    nivelRisco: analise.analise.nivel_risco,
    politicaAcao: politicaComMemoria.acao,
    politicaTom: politicaComMemoria.tom,
    politicaModo: politicaComMemoria.modo,
    memoriaAcao: memoria.decisao.acao,
    memoriaTipo: memoria.decisao.tipo,
    memoriaMotivo: memoria.decisao.motivo,
  });

  const traceCompleto = {
    intencao: analise.analise.intencao,
    complexidade: analise.analise.complexidade,
    nivelRisco: analise.analise.nivel_risco,
    politicaAcao: politicaComMemoria.acao,
    politicaTom: politicaComMemoria.tom,
    politicaModo: politicaComMemoria.modo,
    memoriaAcao: memoria.decisao.acao,
    memoriaTipo: memoria.decisao.tipo,
    memoriaMotivo: memoria.decisao.motivo,
  };
  const narrativaPipeline = montarNarrativaRaciocinio(traceCompleto);
  if (raciocinioAtivo && narrativaPipeline) {
    opcoes.onRaciocinioRodada?.(1, narrativaPipeline, true);
    opcoes.onRaciocinioRodada?.(1, narrativaPipeline, false);
  }

  let resposta: ResultadoResposta | undefined;

  if (gerarResposta && provedor && config) {
    opcoes.onStatusHint?.("A redigir resposta…");

    const usarStream =
      opcoes.stream === true && providerSupportsStream(config.baseUrl);

    if (usarStream) {
      resposta = await responderComoLunaStream(
        mensagem,
        politicaComMemoria,
        config.apiKey,
        config.baseUrl,
        config.modeloMaior,
        config.temperaturaMaior,
        contextoSessao,
        memoria.decisao.sugestao_resposta,
        prior ?? undefined,
        habitosAtivos,
        raciocinioAtivo,
        {
          onChunk: (chunk: ChunkStreamLlm) => {
            if (chunk.tipo === "reasoning") {
              opcoes.onStreamReasoningDelta?.(chunk.delta);
            } else {
              opcoes.onStreamContentDelta?.(chunk.delta);
            }
          },
        },
      );
      opcoes.onStreamDone?.(resposta);
    } else {
      resposta = await responderComoLuna(
        mensagem,
        politicaComMemoria,
        provedor,
        config.modeloMaior,
        config.temperaturaMaior,
        contextoSessao,
        memoria.decisao.sugestao_resposta,
        prior ?? undefined,
        habitosAtivos,
        raciocinioAtivo,
        config.baseUrl,
      );
    }

    const raciocinio = resposta.raciocinio?.trim() ?? "";
    if (raciocinio && raciocinioAtivo && !usarStream) {
      opcoes.onRaciocinioRodada?.(2, raciocinio, true);
      opcoes.onRaciocinioRodada?.(2, raciocinio, false);
    }
  }

  // V3.2 — atualiza perfil comportamental quando uma preferência é confirmada
  if (memoria.decisao.acao === "armazenar" && memoria.decisao.tipo === "preferencia") {
    adicionarOuIncrementarHabito(
      perfil,
      memoria.decisao.conteudo,
      analise.analise.intencao,
      "pessoal",
    );
    try {
      salvarPerfil(perfil);
    } catch (e) {
      console.error("Aviso: falha ao salvar perfil comportamental", e);
    }
  }

  // V2.3 — resposta entregue, volta para aguardando_input
  if (opcoes.ambiente) atualizarAtividade("aguardando_input");

  let sessaoAtualizada = sessao;
  if (sessao) {
    // V1.8 — atualiza contexto acumulado antes de salvar o turn
    atualizarContextoAcumulado(sessao, politicaComMemoria, analise.analise.intencao);
    sessaoAtualizada = registrarTurno(
      sessao,
      mensagem,
      resposta?.texto,
      memoria.decisao,
    );
  }

  const log_path = registrarInteracao({
    id: criarIdInteracao(),
    timestamp: new Date().toISOString(),
    versao_core: "0.2.0",
    mensagem_usuario: mensagem,
    analise: pipeline.analise,
    analise_fonte: analise.fonte,
    politica: politicaComMemoria,
    pontuacoes: pipeline.pontuacoes,
    resposta_luna: resposta?.texto,
    modelo_menor: analise.modelo ?? (analise.fonte === "regras" ? "regras" : undefined),
    modelo_maior: resposta?.modelo,
    latencia_analise_ms: analise.latencia_ms,
    latencia_resposta_ms: resposta?.latencia_ms,
    latencia_total_ms: Date.now() - inicio,
    sessao_id: sessaoAtualizada?.id,
    decisao_memoria: memoria.decisao,
    estado_interno: estadoInterno,
  });

  return {
    pipeline: { ...pipeline, politica: politicaComMemoria },
    analise,
    memoria,
    resposta,
    prior: prior ?? undefined,
    habitos_ativos: habitosAtivos.length > 0 ? habitosAtivos : undefined,
    narrativa_pipeline: narrativaPipeline || undefined,
    log_path,
    sessao: sessaoAtualizada,
  };
}
