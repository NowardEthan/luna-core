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
import { responderComoLunaAgentico, type AcaoAgenticoChat } from "../responder/responderComoLunaAgentico.js";
import { webSearchDisponivel } from "../ferramentas/pesquisaWeb.js";
import { carregarConfig, type ConfigLuna, type ProvedorAgente, type ProvedorLlm } from "../providers/tipos.js";
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
import { compilarContexto, orcamentoPorProfundidade } from "../contexto/compiladorContexto.js";
import { enxugarContextoParaSimples } from "../contexto/enxugarContexto.js";
import { montarEntradasCompilador } from "../contexto/montarEntradasCompilador.js";
import { despertar } from "../mundo/despertar.js";
import { atualizarHumor } from "../mundo/humor/atualizadorHumor.js";
import { lerClimaGlobal } from "../mundo/humor/climaHumor.js";
import { lerRelacaoHumor } from "../mundo/humor/relacaoHumor.js";
import { humorParaPerfilExpressao } from "../mundo/humor/humorParaPerfilExpressao.js";
import { humorParaBadge, type HumorBadgePayload } from "../mundo/humor/humorParaBadge.js";
import { classificarProfundidade, type ProfundidadeAnalise } from "../estado/talamoPipeline.js";
import { registrarTarefaMundo } from "../persistencia/contextoMundo.js";
import {
  classificarPesoTurno,
  escolherModeloResposta,
  precisaRigor,
  temperaturaResposta,
  blocoProtocoloRigor,
  blocoProtocoloDeducao,
  protocoloDeducaoAtivo,
} from "../estado/pesoTurno.js";
import {
  criticarRigor,
  criticoRigorAtivo,
  blocoRevisaoRigor,
} from "../estado/criticoRigor.js";
import { prepararNucleoMundoInterior } from "../mundo/montarNucleoMundoInterior.js";
import { coletarNeuroniosSempreAtivos } from "../neuronios/coletarSempreAtivos.js";
import { criarVontadeNarrativa } from "../mundo/vontade/storeVontade.js";
import { formarIntencaoLuna } from "../mundo/intencao/motorIntencao.js";
import { formatarBlocoIntencao } from "../mundo/intencao/formatarIntencao.js";
import type { IntencaoLuna } from "../mundo/intencao/esquemaIntencao.js";
import { inicializarNeuroniosPadrao } from "../neuronios/inicializarNeuronios.js";
import { coletarNeuroniosAtivos } from "../neuronios/roteador.js";
import type { ContextoCompilado } from "../contexto/compiladorContexto.js";
import type { InterlocutorPipeline } from "../interlocutor/esquemaInterlocutor.js";
import type { AnexoImagemChat } from "../agentico/especialistas/visaoGemma.js";
import type { AnexoDocumentoChat } from "../agentico/especialistas/leitorDocumento.js";
import { simularVidaInterior } from "../mundo/vida/simuladorVida.js";
import { inferirEFormatarConhecimento } from "../conhecimento/formatarConhecimento.js";

inicializarNeuroniosPadrao();

function mapProfundidadeOrcamento(p: ProfundidadeAnalise): "simples" | "normal" | "profunda" {
  if (p === "simples") return "simples";
  if (p === "complexo" || p === "critico") return "profunda";
  return "normal";
}

export type ResultadoCompleto = {
  pipeline: ResultadoPipeline;
  analise: ResultadoAnalise;
  memoria?: ResultadoMemoria;
  resposta?: ResultadoResposta;
  prior?: PriorIntencao;
  habitos_ativos?: HabitoComportamental[];
  /** Narrativa PT do pipeline PAIA — timeline rodada 1 no Orbit. */
  narrativa_pipeline?: string;
  humor_atual?: HumorBadgePayload;
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
  /** Interlocutor verificado — UID + flag criador (servidor). */
  interlocutor?: InterlocutorPipeline;
  /** I4 Orbit — trechos de outras sessões (recall entre conversas). */
  contexto_cross_sessao?: string[];
  /** I5 Orbit IDE — snapshot do workspace (explorador, editor, terminal, git). */
  contexto_ide?: string;
  /** Luna Sense — actividade do computador (separado de Forge). */
  contexto_sense?: string;
  /** Default true — pede raciocínio explícito ao modelo maior quando suportado. */
  raciocinioAtivo?: boolean;
  /** low/medium/high — controla a profundidade do raciocínio quando suportado. */
  raciocinioEffort?: "low" | "medium" | "high";
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
  anexosImagem?: AnexoImagemChat[];
  /** Documentos do turno (texto já extraído) — lidos por partes via `ler_arquivo`. */
  anexosDocumento?: AnexoDocumentoChat[];
  onAcaoAgentico?: (acao: AcaoAgenticoChat) => void;
  /** Fuso IANA do dispositivo do usuário (ex.: "America/Sao_Paulo") — para grounding temporal. */
  timeZone?: string;
};

function pipelineMobileRapido(ambiente?: string): boolean {
  if (ambiente === "orbit_mobile") return true;
  const flag = process.env.LUNA_MOBILE_FAST?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

function embeddingsDesactivados(): boolean {
  const flag = process.env.LUNA_EMBEDDINGS?.trim().toLowerCase();
  return flag === "0" || flag === "false" || flag === "off";
}

function featureFlagAgenticoVisionAtiva(): boolean {
  const raw = process.env.LUNA_AGENTIC_VISION?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function featureFlagAgenticoWebAtiva(): boolean {
  if (!webSearchDisponivel()) return false;
  const raw = process.env.LUNA_AGENTIC_WEB_SEARCH?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

function mensagemContemUrl(mensagem: string): boolean {
  return /https?:\/\/\S+/i.test(mensagem);
}

function deveUsarModoAgentico(
  provedor: ProvedorLlm,
  mensagem: string,
  anexosImagem: AnexoImagemChat[],
  anexosDocumento: AnexoDocumentoChat[] = [],
): boolean {
  if (!ehProvedorAgente(provedor)) return false;
  const vision =
    featureFlagAgenticoVisionAtiva() &&
    (anexosImagem.length > 0 || mensagemPedeImagem(mensagem));
  // Documento anexado exige o modo agêntico: é lá que vive o `ler_arquivo`. Sem isto,
  // ela receberia o cartão do arquivo e não teria como abri-lo.
  const documento = anexosDocumento.length > 0;
  const web = featureFlagAgenticoWebAtiva() || mensagemContemUrl(mensagem);
  return vision || documento || web;
}

function mensagemPedeImagem(mensagem: string): boolean {
  return /\b(ver|veja|olha|assiste|assista|analisa|analise|descreve|descrição|ocr|imagem|foto|print|captura|v[ií]deo|filmagem)\b/i
    .test(mensagem);
}

function ehProvedorAgente(provedor: ProvedorLlm): provedor is ProvedorAgente {
  return typeof (provedor as ProvedorAgente).completarComFerramentas === "function";
}

function intencaoPedeEcossistema(intencao: string): boolean {
  return (
    intencao === "pergunta_arquitetura" ||
    intencao === "pergunta_ecossistema" ||
    intencao === "pergunta_produto"
  );
}

function simularVidaPosResposta(
  mensagem: string,
  analise: Pick<ResultadoAnalise["analise"], "intencao" | "nivel_risco">,
): void {
  Promise.resolve().then(() => {
    try {
      simularVidaInterior(mensagem, analise);
    } catch (e) {
      console.error("Aviso: falha ao simular vida pós-resposta", e);
    }
  });
}

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
  const raciocinioEffort = opcoes.raciocinioEffort;

  opcoes.onStatusHint?.("Analisando intenção…");

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
  if (sessao && opcoes.interlocutor?.uid && !sessao.owner_uid) {
    sessao.owner_uid = opcoes.interlocutor.uid;
  }
  if (sessao && sessao.mensagens.length === 0) {
    try {
      criarVontadeNarrativa({
        sessao_id: sessao.id,
        vontade: "Chegar presente e manter continuidade humana nesta conversa.",
        gatilho: "inicio_sessao",
        prioridade: 3,
      });
    } catch {
      /* vontade opcional */
    }
  }
  const contextoSessao = sessao ? prepararContextoRespondedor(sessao) : undefined;

  let kernelDespertar: string | null = null;
  const mobileRapido = pipelineMobileRapido(opcoes.ambiente);
  if (sessao && sessao.mensagens.length === 0 && provedorMenor && config?.modeloMenor) {
    if (mobileRapido) {
      // Despertar/sono em background — não bloqueia a 1ª resposta no app. Mas é
      // REGISTADO: quem persiste espera por ele antes da descarga final, senão o diário
      // que ela escreve aqui evapora com o fim do turno (e ela nunca evolui).
      registrarTarefaMundo(
        despertar(sessao.id, provedorMenor, config.modeloMenor).catch((e) => {
          console.error("Aviso: despertar em background falhou", e);
          return null;
        }),
      );
    } else {
      kernelDespertar = await despertar(sessao.id, provedorMenor, config.modeloMenor);
    }
  }

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
    if (!kernelDespertar && sessaoAnterior && sessaoAnterior !== opcoes.sessaoId) {
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
      const palavras =
        mobileRapido || embeddingsDesactivados()
          ? []
          : await buscarFatosPorSimilaridade(mensagem);
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

  const contextoAcumulado = sessao?.contexto_acumulado;
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

  if (sessao) atualizarEstadoInterno(sessao, analise.analise);
  const estadoInterno = sessao?.estado_interno;
  let humorAtualBadge: HumorBadgePayload | undefined;
  let perfilExpressaoAtual:
    | ReturnType<typeof humorParaPerfilExpressao>
    | undefined;
  let intencaoLuna: IntencaoLuna | undefined;

  try {
    atualizarHumor(
      analise.analise,
      sessao?.mensagens.length ?? 0,
      opcoes.interlocutor?.uid,
      mensagem,
    );
  } catch (e) {
    console.error("Aviso: falha ao atualizar humor", e);
  }

  // P1 (Luna Profunda) — memória depende só de `analise`, não de intenção/neurônios.
  // Dispara já, roda concorrente com intenção; awaited abaixo onde é consumida.
  const memoriaPromise = avaliarMemoria(
    mensagem,
    sessao,
    neuronioLlm ? provedorMenor : undefined,
    neuronioLlm ? config?.modeloMenor : undefined,
  );

  // Intenção própria da Luna: o que ELA quer nesta troca (não só reagir).
  // Turnos simples usam regras (sem custo de LLM); demais usam o modelo menor (Cerebras).
  try {
    const clima = lerClimaGlobal();
    const relacao = lerRelacaoHumor(opcoes.interlocutor?.uid);
    const ultimoAssistant = [...(contextoSessao?.historico ?? [])]
      .reverse()
      .find((m) => m.papel === "assistant")?.conteudo;
    const usarLlmIntencao = analise.profundidade !== "simples";
    intencaoLuna = await formarIntencaoLuna(
      {
        mensagem,
        intencao_usuario: analise.analise.intencao,
        nivel_risco: analise.analise.nivel_risco,
        criador_verificado: opcoes.interlocutor?.criador_verificado,
        clima: { valencia: clima.valencia, energia: clima.energia },
        relacao: { proximidade: relacao.proximidade, disposicao: relacao.disposicao },
        ultimoFio: ultimoAssistant,
      },
      usarLlmIntencao ? provedorMenor : undefined,
      usarLlmIntencao ? config?.modeloMenor : undefined,
    );
  } catch (e) {
    console.error("Aviso: falha ao formar intenção da Luna", e);
  }

  try {
    const clima = lerClimaGlobal();
    const relacao = lerRelacaoHumor(opcoes.interlocutor?.uid);
    const perfil = humorParaPerfilExpressao(clima, relacao, {
      intencao: analise.analise.intencao,
      nivel_risco: analise.analise.nivel_risco,
      criador_verificado: opcoes.interlocutor?.criador_verificado,
      intencaoLuna: intencaoLuna
        ? { tipo: intencaoLuna.tipo, impulso: intencaoLuna.impulso, recuar: intencaoLuna.recuar }
        : undefined,
    });
    perfilExpressaoAtual = perfil;
    humorAtualBadge = humorParaBadge(perfil);
  } catch (e) {
    console.error("Aviso: falha ao montar badge de humor", e);
    humorAtualBadge = {
      emoji: "😐",
      label: "neutra",
      tema: "neutro",
      accessibilityLabel: "Humor da Luna: neutra",
    };
  }

  const profundidade = analise.profundidade ?? "moderado";

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

  opcoes.onStatusHint?.("Consultando memória…");

  const memoria = await memoriaPromise;

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
  let contextoCompilado: ContextoCompilado | undefined;
  let neuroniosAtivos: string[] = [];

  if (gerarResposta && provedor && config) {
    opcoes.onStatusHint?.("Redigindo resposta…");

    const presencaBruta = contextoSessao?.contexto_presenca?.trim();
    let ctxRespondedor = contextoSessao;
    if (profundidade === "simples" && contextoSessao) {
      ctxRespondedor = enxugarContextoParaSimples(contextoSessao);
    }

    let humorLinha: string | null = null;
    const nucleo = prepararNucleoMundoInterior({
      mensagem,
      analise: analise.analise,
      perfilExpressao: perfilExpressaoAtual,
      ambiente: opcoes.ambiente,
      criador_verificado: opcoes.interlocutor?.criador_verificado,
      interlocutorId: opcoes.interlocutor?.uid,
    });
    humorLinha = nucleo.humor;

    const ecossistemaBase = intencaoPedeEcossistema(analise.analise.intencao)
      ? await inferirEFormatarConhecimento(mensagem, 3, {
        intencao: analise.analise.intencao,
        ambiente: opcoes.ambiente,
      })
      : null;

    let entradas = montarEntradasCompilador({
      politica: politicaComMemoria,
      kernel: kernelDespertar,
      humor: humorLinha,
      habitat: nucleo.habitat,
      mensagemUsuario: mensagem,
      ecossistema: ecossistemaBase ?? undefined,
      sugestaoMemoria: memoria.decisao.sugestao_resposta,
      resumoRolante: sessao?.resumo_rolante,
      interlocutor: opcoes.interlocutor,
      intencao: analise.analise.intencao,
      timeZone: opcoes.timeZone,
    });
    entradas = { ...entradas, vida: nucleo.vida };

    const ctxColeta = ctxRespondedor ?? contextoSessao;
    if (ctxColeta) {
      try {
        const sempreAtivos = await coletarNeuroniosSempreAtivos({
          mensagem,
          intencao: analise.analise.intencao,
          contextoSessao: ctxColeta,
          prior: prior ?? undefined,
          habitos: habitosAtivos,
        });
        entradas = {
          ...entradas,
          ...sempreAtivos,
          identidade: entradas.identidade ?? sempreAtivos.identidade,
          humor: entradas.humor ?? sempreAtivos.humor,
          habitat: entradas.habitat ?? sempreAtivos.habitat,
          vida: entradas.vida ?? sempreAtivos.vida,
        };
      } catch (e) {
        console.error("Aviso: falha ao coletar neurônios sempre ativos", e);
      }
    }

    if (profundidade === "simples" && presencaBruta && !entradas.presenca) {
      entradas.presenca = presencaBruta;
    }

    if (profundidade !== "simples" && ctxColeta) {
      try {
        const { dados: coletado, ativos, scores } = await coletarNeuroniosAtivos({
          mensagem,
          intencao: analise.analise.intencao,
          contextoSessao: ctxColeta,
          prior: prior ?? undefined,
          habitos: habitosAtivos,
        });
        neuroniosAtivos = ativos;
        entradas = {
          ...entradas,
          ...coletado,
          identidade: entradas.identidade ?? coletado.identidade,
          humor: entradas.humor ?? coletado.humor,
          habitat: entradas.habitat ?? coletado.habitat,
          vida: entradas.vida ?? coletado.vida,
        };
        void scores;
      } catch (e) {
        console.error("Aviso: falha no roteador — fallback para coleta completa", e);
        entradas = montarEntradasCompilador({
          politica: politicaComMemoria,
          contextoSessao: ctxColeta,
          kernel: kernelDespertar,
          humor: humorLinha,
          habitat: nucleo.habitat,
          prior: prior ?? undefined,
          habitos: habitosAtivos,
          mensagemUsuario: mensagem,
          ecossistema: ecossistemaBase ?? undefined,
          sugestaoMemoria: memoria.decisao.sugestao_resposta,
          resumoRolante: sessao?.resumo_rolante,
          interlocutor: opcoes.interlocutor,
          intencao: analise.analise.intencao,
          timeZone: opcoes.timeZone,
        });
        entradas = { ...entradas, vida: nucleo.vida };
      }
    }

    if (intencaoLuna) {
      entradas.intencao_luna = formatarBlocoIntencao(intencaoLuna);
    }

    const orcamento = orcamentoPorProfundidade(mapProfundidadeOrcamento(profundidade));
    if (profundidade === "simples" && entradas.presenca) {
      const presenca = entradas.presenca;
      const { presenca: _p, ...semPresenca } = entradas;
      contextoCompilado = compilarContexto(semPresenca, orcamento);
      contextoCompilado = {
        ...contextoCompilado,
        briefing: `${contextoCompilado.briefing}\n\n── Presença ──\n${presenca}`,
        tokens_estimados: contextoCompilado.tokens_estimados + Math.ceil(presenca.length / 4),
      };
    } else {
      contextoCompilado = compilarContexto(entradas, orcamento);
    }
    const historico = ctxRespondedor?.historico ?? [];

    const usarStream = opcoes.stream === true && providerSupportsStream(config.baseUrl);
    const anexosImagem = opcoes.anexosImagem ?? [];
    // Só anexo DESTE turno liga o modo agêntico. Os de turnos anteriores ficam à
    // disposição dela, mas não podem forçar o modo agêntico em toda mensagem só
    // porque a conversa teve uma foto lá atrás — quem os invoca é a fala ("olha
    // aquela foto"), que o `mensagemPedeImagem` já reconhece.
    const anexosDesteTurno = anexosImagem.filter((a) => !a.deTurnoAnterior);
    const anexosDocumento = opcoes.anexosDocumento ?? [];
    const usarModoAgentico = deveUsarModoAgentico(
      provedor,
      mensagem,
      anexosDesteTurno,
      anexosDocumento,
    );

    // P1 camada 1 — gate de peso: papo leve responde no modelo rápido; peso
    // emocional/técnico continua no modelo grande. Sem custo: usa a análise já feita.
    const pesoTurno = classificarPesoTurno(analise.analise, profundidade, mensagem);
    const modeloResposta = escolherModeloResposta(pesoTurno, config.modeloMenor, config.modeloMaior);

    // P1 camada 3 — rigor: em turno técnico, injeta o protocolo de autocrítica no
    // briefing e baixa a temperatura (consistência > flair). Sem chamada de LLM extra.
    const rigor = precisaRigor(analise.analise);
    if (process.env.LUNA_DEBUG_CRITICO === "1") {
      console.error(`[rigor] intent=${analise.analise.intencao} rigor=${rigor}`);
    }
    const tempResposta = temperaturaResposta(rigor, config.temperaturaMaior);
    if (rigor && contextoCompilado) {
      contextoCompilado = {
        ...contextoCompilado,
        briefing: `${contextoCompilado.briefing}\n\n${blocoProtocoloRigor()}`,
      };
    }

    // P2 — dedução: o protocolo de rigor nunca alcança o papo leve, mas é lá que a
    // charada mora ("4x0, adivinha"). Sob a chave, o turno leve ganha o protocolo de
    // dedução — sem mudar modelo, temperatura ou o tom dela.
    if (!rigor && pesoTurno === "leve" && protocoloDeducaoAtivo() && contextoCompilado) {
      contextoCompilado = {
        ...contextoCompilado,
        briefing: `${contextoCompilado.briefing}\n\n${blocoProtocoloDeducao()}`,
      };
    }
    const configResposta =
      modeloResposta === config.modeloMaior && tempResposta === config.temperaturaMaior
        ? config
        : { ...config, modeloMaior: modeloResposta, temperaturaMaior: tempResposta };

    if (usarModoAgentico && ehProvedorAgente(provedor)) {
      resposta = await responderComoLunaAgentico(
        mensagem,
        provedor,
        configResposta,
        contextoCompilado,
        {
          historico,
          // Sem o fuso, as marcas de tempo do histórico ("ontem 23:47") sairiam no
          // relógio do servidor, não no do Ethan.
          timeZone: opcoes.timeZone,
          anexosImagem,
          anexosDocumento,
          raciocinioAtivo,
          raciocinioEffort,
          onAcao: opcoes.onAcaoAgentico,
          // onRaciocinioRodada dispara 2x por rodada (emProgresso true/false) com o
          // MESMO texto completo — não são deltas incrementais. Repassa só na 1ª,
          // senão o texto duplica na tira de raciocínio do cliente.
          onRaciocinio: opcoes.onStreamReasoningDelta
            ? (_rodada, texto, emProgresso) => {
                if (emProgresso) opcoes.onStreamReasoningDelta!(texto);
              }
            : undefined,
        },
      );
    } else if (usarStream) {
      resposta = await responderComoLunaStream(
        mensagem,
        politicaComMemoria,
        config.apiKey,
        config.baseUrl,
        modeloResposta,
        tempResposta,
        contextoCompilado,
        historico,
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
        opcoes.interlocutor,
        analise.analise.intencao,
        raciocinioEffort,
      );
      opcoes.onStreamDone?.(resposta);
    } else {
      resposta = await responderComoLuna(
        mensagem,
        politicaComMemoria,
        provedor,
        modeloResposta,
        tempResposta,
        contextoCompilado,
        historico,
        raciocinioAtivo,
        config.baseUrl,
        opcoes.interlocutor,
        analise.analise.intencao,
        raciocinioEffort,
      );
    }

    // P1 camada 3 v2 — crítico dedicado: em turno de rigor, um 2º LLM (o menor)
    // checa se a resposta cobriu as implicações dos fatos concretos. Se achar
    // lacunas, uma passada de revisão as incorpora. Nunca bloqueia: em falha, o
    // crítico devolve "sólido". Kill-switch LUNA_CRITICO=0.
    //
    // Só é pulado no caminho de streaming AO VIVO (responderComoLunaStream), onde
    // o texto já foi para o cliente token-a-token — revisar ali seria "jarring".
    // O caminho agêntico entrega o texto inteiro no fim, então revisar é seguro.
    const respostaStreamadaAoVivo = usarStream && !usarModoAgentico;
    if (
      rigor &&
      criticoRigorAtivo() &&
      !respostaStreamadaAoVivo &&
      resposta.texto.trim() &&
      contextoCompilado &&
      config.modeloMenor
    ) {
      const critica = await criticarRigor(
        { mensagemUsuario: mensagem, respostaRascunho: resposta.texto },
        { provedor: provedorMenor ?? provedor, modelo: config.modeloMenor },
      );
      if (process.env.LUNA_DEBUG_CRITICO === "1") {
        console.error(
          `[critico] intent=${analise.analise.intencao} solido=${critica.solido} lacunas=${JSON.stringify(critica.lacunas)}`,
        );
      }
      if (!critica.solido && critica.lacunas.length > 0) {
        const ctxRevisao: ContextoCompilado = {
          ...contextoCompilado,
          briefing: `${contextoCompilado.briefing}\n\n${blocoRevisaoRigor(critica.lacunas)}`,
        };
        const revisada = await responderComoLuna(
          mensagem,
          politicaComMemoria,
          provedor,
          modeloResposta,
          tempResposta,
          ctxRevisao,
          historico,
          raciocinioAtivo,
          config.baseUrl,
          opcoes.interlocutor,
          analise.analise.intencao,
          raciocinioEffort,
        );
        if (revisada.texto.trim()) resposta = revisada;
      }
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
    // NÃO registrar isto como gosto da Luna: `conteudo` é a preferência do USUÁRIO
    // (ex.: "prefiro respostas curtas"). Copiá-la para `luna_gostos` injetava texto do
    // usuário em 1ª pessoa como identidade dela, causando confabulação de história
    // compartilhada (ela trocava "meu hobby" por "teu hobby"). O perfil acima já é o
    // lugar correto para preferências do usuário.
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
    tokens_briefing: contextoCompilado?.tokens_estimados,
    cortes_briefing: contextoCompilado?.cortes,
    profundidade,
    neuronios_ativos: neuroniosAtivos.length > 0 ? neuroniosAtivos : undefined,
  });

  simularVidaPosResposta(mensagem, {
    intencao: analise.analise.intencao,
    nivel_risco: analise.analise.nivel_risco,
  });

  return {
    pipeline: { ...pipeline, politica: politicaComMemoria },
    analise,
    memoria,
    resposta,
    prior: prior ?? undefined,
    habitos_ativos: habitosAtivos.length > 0 ? habitosAtivos : undefined,
    narrativa_pipeline: narrativaPipeline || undefined,
    humor_atual: humorAtualBadge,
    log_path,
    sessao: sessaoAtualizada,
  };
}
