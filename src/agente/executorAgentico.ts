import type {
  ProvedorAgente,
  ConfigLuna,
  DefinicaoFerramenta,
  MensagemChatAgente,
} from "../providers/tipos.js";
import type { PlanoExecucao } from "./planejadorIde.js";
import {
  criarGuardaLeituraSecao,
  ehEscritaArtefato,
  ehLeituraSecao,
} from "./guardaLeituraSecao.js";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type PassoExecucao = {
  rodada: number;
  ferramenta: string;
  argumentos: Record<string, unknown>;
  resultado: string;
  duracao_ms: number;
  sucesso: boolean;
};

export type ResultadoExecutor = {
  resposta_final: string;
  passos: PassoExecucao[];
  rodadas: number;
  concluido: boolean;
};

export type OpcoeExecutor = {
  mensagemUsuario: string;
  systemPrompt: string;
  ferramentas: DefinicaoFerramenta[];
  toolExecutor: (nome: string, args: Record<string, unknown>) => Promise<string>;
  provedor: ProvedorAgente;
  config: ConfigLuna;
  plano?: PlanoExecucao;
  maxRodadas?: number;
  /** Default true — pede raciocínio explícito quando o modelo suporta. */
  raciocinioAtivo?: boolean;
  /** low/medium/high — controla profundidade do raciocínio quando suportado. */
  raciocinioEffort?: "low" | "medium" | "high";
  onToolCallStart?: (nome: string, args: Record<string, unknown>, rodada: number) => void;
  onToolCallComplete?: (passo: PassoExecucao) => void;
  onStatusHint?: (hint: string) => void;
  /** Texto de raciocínio do modelo por rodada (antes das ferramentas). */
  onRaciocinioRodada?: (rodada: number, texto: string, emProgresso: boolean) => void;
  /**
   * Ponte visível entre ações («Vou ler o documento…») — streama pro cliente via SSE `content`
   * sem encerrar o loop. Também entra na resposta final persistida.
   */
  onNarracaoRodada?: (texto: string) => void;
  /**
   * Coleira do plano em passos (OrbitLab): se ainda há ☐, o executor NÃO aceita texto-só como
   * resposta final — injeta um nudge e continua o loop.
   */
  planoAindaAberto?: () => {
    abertos: number;
    proximoNumero: number;
    proximo: string;
    render: string;
  } | null;
  /** True se este turno tem (ou teve) um plano com ≥1 passo — pra exigir fala no fecho. */
  planoTemPassos?: () => boolean;
  /**
   * Coleira de auditoria de artefato: depois de escrever/editar, exige releitura antes
   * de aceitar texto-só como resposta final.
   */
  artefatoPendenteAuditoria?: () => boolean;
  /**
   * Coleira pesquisa profunda: buscou/leu na web mas ainda não chamou `verificar_fontes`.
   * Impede fechar o relatório só com o primeiro achado.
   */
  pesquisaPendenteCruzamento?: () => boolean;
  /**
   * Marca um ☐ do plano (1-based). Usado quando o modelo teima em fechar a fala
   * sem `concluir_passo` no último item — depois do 1º nudge.
   */
  marcarPassoAberto?: (numero: number) => void;
  /** Orçamento vivo (sobe quando o plano cresce). Default = maxRodadas fixo. */
  obterMaxRodadas?: () => number;
  abortSignal?: AbortSignal;
};

const MAX_NUDGES_AUDITORIA_ARTEFATO = 2;
/** Uma chance de fechar a fala quando o modelo some após tools (sem texto/tools). */
const MAX_NUDGES_RESPOSTA_VAZIA = 1;
/**
 * Plano completo (todos ☑) mas ela sumiu sem falar com o usuário.
 * Sem isto o turno acaba só com badges e zero prosa.
 */
const MAX_NUDGES_FECHO_FALA = 3;
/** Pesquisa profunda: 1 empurrão pra cruzar fontes antes do relatório final. */
const MAX_NUDGES_VERIFICAR_FONTES = 1;

const NUDGE_VERIFICAR_FONTES_MSG =
  "PESQUISA PROFUNDA: você já buscou/leu fontes, mas ainda NÃO chamou `verificar_fontes`. " +
  "Antes da resposta final, chama UMA vez com as afirmações factuais que pretende dizer " +
  "(números, datas, versões, alegações). Depois escreve reconciliando o que voltar — " +
  "não feche o relatório só com o primeiro achado.";

const META_PLANO = new Set(["planejar", "concluir_passo", "adicionar_passo", "perguntar"]);

const FERRAMENTAS_LEITURA_ARTEFATO = new Set([
  "ler_estrutura",
  "ler_secao",
  "ler_artefato",
  "buscar_no_artefato",
  "ler_bloco",
]);

const STUB_LEITURA_ANTIGA =
  "(leitura anterior omitida — use o índice ou a leitura mais recente deste artefato.)";

// ─── Montagem da mensagem inicial ─────────────────────────────────────────────

function montarMensagemInicial(mensagemUsuario: string, plano?: PlanoExecucao): string {
  if (!plano) return mensagemUsuario;

  const linhas = [
    "[PLANO DE EXECUÇÃO]",
    `Objetivo: ${plano.objetivo}`,
    `Tipo: ${plano.tipo}`,
    `Complexidade: ${plano.complexidade}`,
  ];

  if (plano.arquivos_relevantes.length > 0) {
    linhas.push(`Arquivos relevantes: ${plano.arquivos_relevantes.join(", ")}`);
  }
  if (plano.ferramentas_previstas.length > 0) {
    linhas.push(`Ferramentas previstas: ${plano.ferramentas_previstas.join(", ")}`);
  }
  if (plano.requer_confirmacao) {
    linhas.push("⚠ Esta tarefa requer confirmação do usuário antes de ações destrutivas.");
  }
  if (plano.contexto_adicional) {
    linhas.push(`Contexto: ${plano.contexto_adicional}`);
  }
  linhas.push("[FIM DO PLANO]", "", mensagemUsuario);

  return linhas.join("\n");
}

const FALLBACK_COM_PASSOS =
  "Fiz o que dava com as ferramentas, mas não consegui fechar a resposta. Quer que eu tente de outro jeito?";
const FALLBACK_SEM_PASSOS = "Não consegui obter uma resposta agora. Pode repetir o pedido?";
const FALLBACK_LIMITE =
  "Cheguei no limite de passos desta tarefa. Me diz se quer que eu continue de onde parei.";

function nudgePlanoMsg(aberto: {
  abertos: number;
  proximoNumero: number;
  proximo: string;
  render: string;
}): string {
  return (
    `Ainda há ${aberto.abertos} passo(s) ☐ no plano — o trabalho NÃO acabou.\n` +
    `${aberto.render}\n\n` +
    `Executa AGORA o passo ${aberto.proximoNumero}: ${aberto.proximo}. ` +
    `Quando ESTE passo estiver feito de verdade, marca com \`concluir_passo(${aberto.proximoNumero})\`. ` +
    `NÃO entregues a resposta final enquanto houver ☐ — marque TODOS, depois fale com o Ethan.`
  );
}

const NUDGE_FECHO_FALA_MSG =
  "Todos os passos do plano estão ☑ — ótimo. Agora FALA com o Ethan: em 2–4 frases, " +
  "na tua voz, o que você fez / conferiu / deixou pronto. Sem mais tools de trabalho neste " +
  "fecho — só a resposta final pra ele. Não sumas em silêncio.";

const NUDGE_AUDITORIA_MSG =
  "Você alterou o artefato e ainda NÃO conferiu. Prefira `ler_estrutura` UMA vez " +
  "(mapa barato) ou `ler_secao` SÓ do trecho que mexeu — sem ping-pong 1↔2. " +
  "Compare, corrija com mão cirúrgica se precisar, e entregue a resposta final. " +
  "NÃO fique relendo capítulos.";

/**
 * Mantém só a leitura mais recente de cada artefato no histórico do loop —
 * corpos antigos viram stub pra não estourar contexto.
 */
export function trimLeiturasArtefatoAntigas(mensagens: MensagemChatAgente[]): void {
  const ultimaPorId = new Map<string, number>();
  for (let i = 0; i < mensagens.length; i++) {
    const m = mensagens[i]!;
    if (m.papel !== "ferramenta") continue;
    if (!FERRAMENTAS_LEITURA_ARTEFATO.has(m.nome)) continue;
    const id = extrairIdArtefatoDoResultado(m.conteudo);
    if (!id) continue;
    ultimaPorId.set(id, i);
  }
  for (let i = 0; i < mensagens.length; i++) {
    const m = mensagens[i]!;
    if (m.papel !== "ferramenta") continue;
    if (!FERRAMENTAS_LEITURA_ARTEFATO.has(m.nome)) continue;
    const id = extrairIdArtefatoDoResultado(m.conteudo);
    if (!id) continue;
    if (ultimaPorId.get(id) !== i && m.conteudo.length > 120) {
      m.conteudo = STUB_LEITURA_ANTIGA;
    }
  }
}

function extrairIdArtefatoDoResultado(conteudo: string): string | null {
  const m =
    /\(id:\s*([a-zA-Z0-9_-]+)\)/.exec(conteudo) ||
    /id:\s*([a-zA-Z0-9_-]+)/.exec(conteudo);
  return m?.[1] ?? null;
}

// ─── Executor agêntico ────────────────────────────────────────────────────────

export async function executorAgentico(opcoes: OpcoeExecutor): Promise<ResultadoExecutor> {
  const {
    mensagemUsuario,
    systemPrompt,
    ferramentas,
    toolExecutor,
    provedor,
    config,
    plano,
    maxRodadas = 10,
    raciocinioAtivo = true,
    onToolCallStart,
    onToolCallComplete,
    onStatusHint,
    onRaciocinioRodada,
    onNarracaoRodada,
    planoAindaAberto,
    planoTemPassos,
    artefatoPendenteAuditoria,
    pesquisaPendenteCruzamento,
    marcarPassoAberto,
    obterMaxRodadas,
    abortSignal,
  } = opcoes;

  const mensagens: MensagemChatAgente[] = [
    { papel: "system", conteudo: systemPrompt },
    { papel: "user", conteudo: montarMensagemInicial(mensagemUsuario, plano) },
  ];

  const passos: PassoExecucao[] = [];
  /** Partes visíveis já streamadas (pontes + resposta final) — viram o texto persistido. */
  const partesVisiveis: string[] = [];
  let narracaoJaEnviada = false;
  let rodada = 0;
  let nudgesPlano = 0;
  let nudgesAuditoria = 0;
  let nudgesRespostaVazia = 0;
  let nudgesFechoFala = 0;
  let nudgesVerificarFontes = 0;
  /** Depois de todos ☑, exige pelo menos uma fala-só (não só pontes mid-tool). */
  let fechoFalaCumprido = false;
  /** Anti-piripaque: bloqueia ler_secao em loop 1↔2 no mesmo turno. */
  const guardaSecao = criarGuardaLeituraSecao();

  const tetoRodadas = () => obterMaxRodadas?.() ?? maxRodadas;

  const emitirNarracao = (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    partesVisiveis.push(t);
    const delta = narracaoJaEnviada ? `\n\n${t}` : t;
    narracaoJaEnviada = true;
    onNarracaoRodada?.(delta);
  };

  const tentarNudgePendente = (
    conteudoAssistant: string | null,
    /** Só no branch vazio: também pede fechar a fala se já houve tools. */
    aposVazio = false,
  ): boolean => {
    const ultimo = passos[passos.length - 1];
    const esperandoResposta =
      ultimo?.ferramenta === "perguntar" && ultimo.sucesso === true;
    if (esperandoResposta) return false;

    const aberto = planoAindaAberto?.() ?? null;
    // Sem teto baixo: ☐ aberto NÃO pode virar resposta final (antes 3 nudges e ela escapava).
    if (aberto && aberto.abertos > 0) {
      nudgesPlano++;
      if (conteudoAssistant) {
        mensagens.push({ papel: "assistant", conteudo: conteudoAssistant });
      }
      mensagens.push({ papel: "user", conteudo: nudgePlanoMsg(aberto) });
      return true;
    }

    if ((artefatoPendenteAuditoria?.() ?? false) && nudgesAuditoria < MAX_NUDGES_AUDITORIA_ARTEFATO) {
      nudgesAuditoria++;
      if (conteudoAssistant) {
        mensagens.push({ papel: "assistant", conteudo: conteudoAssistant });
      }
      mensagens.push({ papel: "user", conteudo: NUDGE_AUDITORIA_MSG });
      return true;
    }

    if (
      (pesquisaPendenteCruzamento?.() ?? false) &&
      nudgesVerificarFontes < MAX_NUDGES_VERIFICAR_FONTES
    ) {
      nudgesVerificarFontes++;
      if (conteudoAssistant) {
        mensagens.push({ papel: "assistant", conteudo: conteudoAssistant });
      }
      mensagens.push({ papel: "user", conteudo: NUDGE_VERIFICAR_FONTES_MSG });
      return true;
    }

    // Plano todo ☑ mas ainda não houve fala de fecho (só tools / pontes).
    const tevePlano = planoTemPassos?.() ?? false;
    if (tevePlano && !fechoFalaCumprido) {
      // Texto-só = prosa de fecho → aceita.
      if (conteudoAssistant && conteudoAssistant.trim() && !aposVazio) {
        fechoFalaCumprido = true;
        return false;
      }
      if (nudgesFechoFala < MAX_NUDGES_FECHO_FALA) {
        nudgesFechoFala++;
        if (conteudoAssistant) {
          mensagens.push({ papel: "assistant", conteudo: conteudoAssistant });
        }
        mensagens.push({ papel: "user", conteudo: NUDGE_FECHO_FALA_MSG });
        return true;
      }
    }

    if (
      aposVazio &&
      passos.length > 0 &&
      nudgesRespostaVazia < MAX_NUDGES_RESPOSTA_VAZIA
    ) {
      nudgesRespostaVazia++;
      mensagens.push({
        papel: "user",
        conteudo:
          "Você usou ferramentas mas não fechou a resposta. Diz agora, em 1–3 frases, " +
          "o que fez / o que conferiu — sem repetir o artefato inteiro.",
      });
      return true;
    }

    return false;
  };

  while (rodada < tetoRodadas()) {
    if (abortSignal?.aborted) {
      return {
        resposta_final: partesVisiveis.length > 0
          ? partesVisiveis.filter(Boolean).join("\n\n")
          : "Execução cancelada pelo usuário.",
        passos,
        rodadas: rodada,
        concluido: false,
      };
    }

    rodada++;

    /**
     * A6.1 + coleira: NÃO streama content pro cliente até saber se a rodada é
     * ponte+tool (ok flushar) ou texto-só barrado por ☐ (senão vaza «já terminei»
     * e o turno parece fechado sem marcar o último passo).
     */
    let bufferNarracaoRodada = "";
    let narracaoRecebidaNestaRodada = false;
    let raciocinioStreamedNestaRodada = false;

    const flushNarracaoBuffer = () => {
      const bruto = bufferNarracaoRodada.trim();
      bufferNarracaoRodada = "";
      if (!bruto) return;
      // Emite de uma vez (cliente typewrita o delta grande). Evita vazar fala
      // prematura que a coleira do plano ainda pode barrar.
      emitirNarracao(bruto);
    };
    const descartarNarracaoBuffer = () => {
      bufferNarracaoRodada = "";
    };

    const resposta = await provedor.completarComFerramentas({
      modelo: config.modeloMaior,
      mensagens,
      temperatura: config.temperaturaMaior,
      ferramentas,
      raciocinioAtivo,
      raciocinioEffort: opcoes.raciocinioEffort,
      maxTokens: config.maxTokensResposta,
      onDelta: onNarracaoRodada || onRaciocinioRodada
        ? (chunk) => {
            if (chunk.tipo === "content" && chunk.delta) {
              narracaoRecebidaNestaRodada = true;
              bufferNarracaoRodada += chunk.delta;
            }
            if (chunk.tipo === "reasoning" && chunk.delta && raciocinioAtivo) {
              raciocinioStreamedNestaRodada = true;
              onRaciocinioRodada?.(rodada, chunk.delta, true);
            }
          }
        : undefined,
    });

    const raciocinio = resposta.raciocinio?.trim() ?? "";
    if (raciocinio && raciocinioAtivo && !raciocinioStreamedNestaRodada) {
      onRaciocinioRodada?.(rodada, raciocinio, true);
      onRaciocinioRodada?.(rodada, raciocinio, false);
    } else if (raciocinioStreamedNestaRodada) {
      onRaciocinioRodada?.(rodada, "", false);
    }

    const conteudo = typeof resposta.conteudo === "string" ? resposta.conteudo.trim() : "";
    const temTools = Boolean(resposta.chamadas && resposta.chamadas.length > 0);

    // Tools (+ ponte opcional) → narrar, executar, continuar o loop
    if (temTools && resposta.chamadas) {
      if (bufferNarracaoRodada) {
        flushNarracaoBuffer();
      } else if (conteudo && !narracaoRecebidaNestaRodada) {
        emitirNarracao(conteudo);
      }

      mensagens.push({
        papel: "assistant",
        ...(conteudo ? { conteudo } : {}),
        chamadas_ferramenta: resposta.chamadas,
      });

      for (const chamada of resposta.chamadas) {
        onToolCallStart?.(chamada.nome, chamada.argumentos, rodada);
        onStatusHint?.(`Executando ${chamada.nome}…`);

        const inicioPasso = Date.now();
        let resultado: string;
        let sucesso = true;

        try {
          const bloqueio =
            ehLeituraSecao(chamada.nome)
              ? guardaSecao.tentarBloquear(chamada.argumentos)
              : null;
          if (bloqueio) {
            resultado = bloqueio;
            sucesso = false;
            onStatusHint?.("Anti-loop: parou de reler seções");
          } else {
            resultado = await toolExecutor(chamada.nome, chamada.argumentos);
            // Muitas mãos devolvem «ERRO: …» em string (sem throw). Sem isto o badge do app
            // marcava sucesso («Lançamento registrado») e ela ainda podia narrar que gravou
            // — enquanto o Extrato ficava vazio de verdade.
            if (/^\s*ERRO\b/i.test(resultado) || /^\s*PARADA\b/i.test(resultado)) {
              sucesso = false;
            } else if (ehLeituraSecao(chamada.nome)) {
              guardaSecao.registrarLeituraOk(chamada.argumentos);
            } else if (ehEscritaArtefato(chamada.nome)) {
              guardaSecao.aposEscrita(chamada.argumentos);
            }
            // Lembrete vivo: fez a mão de trabalho mas o ☐ ainda está aberto.
            if (
              sucesso &&
              !META_PLANO.has(chamada.nome) &&
              !/^\s*ERRO\b/i.test(resultado) &&
              !/^\s*PARADA\b/i.test(resultado)
            ) {
              const abertoAgora = planoAindaAberto?.() ?? null;
              if (abertoAgora && abertoAgora.abertos > 0) {
                resultado +=
                  `\n\n(Plano: passo ${abertoAgora.proximoNumero} ainda ☐ — «${abertoAgora.proximo}». ` +
                  `Quando ESTE passo estiver feito, marca com \`concluir_passo(${abertoAgora.proximoNumero})\`. ` +
                  `No fim, com todos ☑, fala com o Ethan o que você fez.)`;
              }
            }
          }
        } catch (erro) {
          resultado = `ERRO: ${erro instanceof Error ? erro.message : String(erro)}`;
          sucesso = false;
        }

        const passo: PassoExecucao = {
          rodada,
          ferramenta: chamada.nome,
          argumentos: chamada.argumentos,
          resultado,
          duracao_ms: Date.now() - inicioPasso,
          sucesso,
        };

        passos.push(passo);
        onToolCallComplete?.(passo);

        mensagens.push({
          papel: "ferramenta",
          id_chamada: chamada.id,
          nome: chamada.nome,
          conteudo: resultado,
        });
      }

      trimLeiturasArtefatoAntigas(mensagens);
      continue;
    }

    // Só texto → resposta final (fim do loop), EXCETO se a checklist ainda tem ☐
    // ou auditoria pendente. Exceção: acabou de `perguntar` — turno PARA de propósito.
    if (conteudo) {
      // Teima em fechar sem marcar o ÚLTIMO ☐: depois do 1º nudge, marca por ela.
      const abertoAgora = planoAindaAberto?.() ?? null;
      if (
        abertoAgora &&
        abertoAgora.abertos === 1 &&
        nudgesPlano >= 1 &&
        marcarPassoAberto
      ) {
        marcarPassoAberto(abertoAgora.proximoNumero);
      }

      if (tentarNudgePendente(conteudo)) {
        descartarNarracaoBuffer();
        continue;
      }

      if (bufferNarracaoRodada) {
        flushNarracaoBuffer();
      } else if (!narracaoRecebidaNestaRodada) {
        emitirNarracao(conteudo);
      }
      return {
        resposta_final: partesVisiveis.filter(Boolean).join("\n\n"),
        passos,
        rodadas: rodada,
        concluido: true,
      };
    }

    // Sem content/tools — descarta buffer vazio residual.
    descartarNarracaoBuffer();

    // Modelo não respondeu com texto nem com ferramentas — se ainda há trabalho
    // pendente (plano/auditoria) ou só «sumiu» após tools, NÃO encerra: nudge e continua.
    if (tentarNudgePendente(null, true)) {
      continue;
    }

    return {
      resposta_final:
        partesVisiveis.length > 0
          ? partesVisiveis.filter(Boolean).join("\n\n")
          : passos.length > 0
            ? FALLBACK_COM_PASSOS
            : FALLBACK_SEM_PASSOS,
      passos,
      rodadas: rodada,
      concluido: passos.length > 0 || partesVisiveis.length > 0,
    };
  }

  // Failsafe: maxRodadas atingido
  const abertoFinal = planoAindaAberto?.() ?? null;
  const extraPlano =
    abertoFinal && abertoFinal.abertos > 0
      ? `\n\nAinda ficaram ${abertoFinal.abertos} passo(s) ☐:\n${abertoFinal.render}`
      : planoTemPassos?.() && !fechoFalaCumprido
        ? "\n\nConsegui avançar nas ferramentas, mas não fechei contando pra você o que fiz — me pergunta que eu retomo."
        : "";
  return {
    resposta_final:
      partesVisiveis.length > 0
        ? `${partesVisiveis.filter(Boolean).join("\n\n")}\n\n${FALLBACK_LIMITE}${extraPlano}`
        : `${FALLBACK_LIMITE}${extraPlano}`,
    passos,
    rodadas: rodada,
    concluido: false,
  };
}
