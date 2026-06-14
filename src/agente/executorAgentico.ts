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
  onToolCallStart?: (nome: string, args: Record<string, unknown>, rodada: number) => void;
  onToolCallComplete?: (passo: PassoExecucao) => void;
  onStatusHint?: (hint: string) => void;
  abortSignal?: AbortSignal;
};

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
    onToolCallStart,
    onToolCallComplete,
    onStatusHint,
    abortSignal,
  } = opcoes;

  const mensagens: MensagemChatAgente[] = [
    { papel: "system", conteudo: systemPrompt },
    { papel: "user", conteudo: montarMensagemInicial(mensagemUsuario, plano) },
  ];

  const passos: PassoExecucao[] = [];
  let rodada = 0;

  while (rodada < maxRodadas) {
    if (abortSignal?.aborted) {
      return {
        resposta_final: "Execução cancelada pelo usuário.",
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
    });

    // Modelo respondeu com texto → fim do loop
    if (resposta.conteudo !== undefined) {
      return {
        resposta_final: resposta.conteudo,
        passos,
        rodadas: rodada,
        concluido: true,
      };
    }

    // Modelo pediu ferramentas → executar e continuar
    if (resposta.chamadas && resposta.chamadas.length > 0) {
      // Registra a mensagem do assistant com as tool_calls
      mensagens.push({
        papel: "assistant",
        chamadas_ferramenta: resposta.chamadas,
      });

      // Executa cada ferramenta em sequência
      for (const chamada of resposta.chamadas) {
        onToolCallStart?.(chamada.nome, chamada.argumentos, rodada);
        onStatusHint?.(`Executando ${chamada.nome}…`);

        const inicioPasso = Date.now();
        let resultado: string;
        let sucesso = true;

        try {
          resultado = await toolExecutor(chamada.nome, chamada.argumentos);
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

        // Injeta resultado como mensagem de ferramenta
        mensagens.push({
          papel: "ferramenta",
          id_chamada: chamada.id,
          nome: chamada.nome,
          conteudo: resultado,
        });
      }

      // Continua o loop — modelo decide se pede mais ferramentas ou responde
      continue;
    }

    // Modelo não respondeu com texto nem com ferramentas (modelo fraco / sem suporte)
    return {
      resposta_final: passos.length > 0
        ? `Executei ${passos.length} ação(ões) no workspace.`
        : "Não foi possível obter resposta do modelo.",
      passos,
      rodadas: rodada,
      concluido: passos.length > 0,
    };
  }

  // Failsafe: maxRodadas atingido
  return {
    resposta_final: `Limite de ${maxRodadas} rodadas atingido. Verifique o resultado no workspace.`,
    passos,
    rodadas: rodada,
    concluido: false,
  };
}
