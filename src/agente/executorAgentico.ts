import type {
  ProvedorAgente,
  ConfigLuna,
  DefinicaoFerramenta,
  MensagemChatAgente,
} from "../providers/tipos.js";
import type { PlanoExecucao } from "./planejadorIde.js";

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
  /** Orçamento vivo (sobe quando o plano cresce). Default = maxRodadas fixo. */
  obterMaxRodadas?: () => number;
  abortSignal?: AbortSignal;
};

const MAX_NUDGES_PLANO = 3;

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

  const tetoRodadas = () => obterMaxRodadas?.() ?? maxRodadas;

  const emitirNarracao = (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    partesVisiveis.push(t);
    const delta = narracaoJaEnviada ? `\n\n${t}` : t;
    narracaoJaEnviada = true;
    onNarracaoRodada?.(delta);
  };

  while (rodada < tetoRodadas()) {
    if (abortSignal?.aborted) {
      return {
        resposta_final: partesVisiveis.length > 0
          ? partesVisiveis.join("\n\n")
          : "Execução cancelada pelo usuário.",
        passos,
        rodadas: rodada,
        concluido: false,
      };
    }

    rodada++;

    const resposta = await provedor.completarComFerramentas({
      modelo: config.modeloMaior,
      mensagens,
      temperatura: config.temperaturaMaior,
      ferramentas,
      raciocinioAtivo,
      raciocinioEffort: opcoes.raciocinioEffort,
      // O teto do neurónio de registo — igual à temperatura, vem da config do turno.
      // Ela pode PENSAR à vontade (a reserva de raciocínio está no cálculo); o que o teto
      // limita é o que ela DIZ.
      maxTokens: config.maxTokensResposta,
    });

    const raciocinio = resposta.raciocinio?.trim() ?? "";
    if (raciocinio && raciocinioAtivo) {
      onRaciocinioRodada?.(rodada, raciocinio, true);
      onRaciocinioRodada?.(rodada, raciocinio, false);
    }

    const conteudo = typeof resposta.conteudo === "string" ? resposta.conteudo.trim() : "";
    const temTools = Boolean(resposta.chamadas && resposta.chamadas.length > 0);

    // Tools (+ ponte opcional) → narrar, executar, continuar o loop
    if (temTools && resposta.chamadas) {
      if (conteudo) {
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
          resultado = await toolExecutor(chamada.nome, chamada.argumentos);
          // Muitas mãos devolvem «ERRO: …» em string (sem throw). Sem isto o badge do app
          // marcava sucesso («Lançamento registrado») e ela ainda podia narrar que gravou
          // — enquanto o Extrato ficava vazio de verdade.
          if (/^\s*ERRO\b/i.test(resultado)) {
            sucesso = false;
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

      continue;
    }

    // Só texto → resposta final (fim do loop), EXCETO se a checklist ainda tem ☐.
    // Sem isto o modelo larga o plano no meio («pronto») e o turno morre.
    // Exceção: acabou de `perguntar` — aí o turno PARA de propósito até ele responder.
    if (conteudo) {
      const ultimo = passos[passos.length - 1];
      const esperandoResposta =
        ultimo?.ferramenta === "perguntar" && ultimo.sucesso === true;
      const aberto = !esperandoResposta ? planoAindaAberto?.() ?? null : null;

      if (aberto && aberto.abertos > 0 && nudgesPlano < MAX_NUDGES_PLANO) {
        nudgesPlano++;
        mensagens.push({ papel: "assistant", conteudo });
        mensagens.push({
          papel: "user",
          conteudo:
            `Ainda há ${aberto.abertos} passo(s) ☐ no plano — o trabalho NÃO acabou.\n` +
            `${aberto.render}\n\n` +
            `Executa AGORA o passo ${aberto.proximoNumero}: ${aberto.proximo}. ` +
            `Depois marca com \`concluir_passo(${aberto.proximoNumero})\`. ` +
            `NÃO entregues a resposta final enquanto houver ☐.`,
        });
        continue;
      }

      emitirNarracao(conteudo);
      return {
        resposta_final: partesVisiveis.join("\n\n"),
        passos,
        rodadas: rodada,
        concluido: true,
      };
    }

    // Modelo não respondeu com texto nem com ferramentas (modelo fraco / sem suporte)
    return {
      resposta_final:
        partesVisiveis.length > 0
          ? partesVisiveis.join("\n\n")
          : passos.length > 0
            ? FALLBACK_COM_PASSOS
            : FALLBACK_SEM_PASSOS,
      passos,
      rodadas: rodada,
      concluido: passos.length > 0 || partesVisiveis.length > 0,
    };
  }

  // Failsafe: maxRodadas atingido
  return {
    resposta_final:
      partesVisiveis.length > 0 ? `${partesVisiveis.join("\n\n")}\n\n${FALLBACK_LIMITE}` : FALLBACK_LIMITE,
    passos,
    rodadas: rodada,
    concluido: false,
  };
}
