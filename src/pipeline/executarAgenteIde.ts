import { carregarConfig, type ConfigLuna, type ProvedorAgente } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { classificarProfundidade, type ProfundidadeAnalise } from "../estado/talamoPipeline.js";
import { planejadorIde, type PlanoExecucao, type SnapshotWorkspace } from "../agente/planejadorIde.js";
import { executorAgentico, type PassoExecucao, type ResultadoExecutor } from "../agente/executorAgentico.js";
import { avaliadorTarefa, type ResultadoAvaliador } from "../agente/avaliadorTarefa.js";
import { FERRAMENTAS_IDE } from "../agente/ferramentas/definicoes.js";
import {
  obterOuCriarSessao,
  prepararContextoRespondedor,
  registrarTurno,
} from "../memoria/gerenciadorSessao.js";
import type { MemoriaSessao } from "../memoria/esquemaMemoria.js";
import { buscarFatosDePerfil, buscarFatosPorSimilaridade } from "../memoria/longa/storeSqlite.js";
import { montarBlocoMemoria } from "../memoria/formatarContextoSessao.js";
import { carregarInstrucaoSistema } from "../constitution/carregador.js";
import { gerarBlocoPersonalidade } from "../personalidade/gerarBlocoPersonalidade.js";
import { entrarComTransicao, atualizarAtividade } from "../presenca/gerenciadorPresenca.js";
import type { Ambiente } from "../presenca/esquemaPresenca.js";
import { montarBlocoPresenca } from "../presenca/contextoPresenca.js";
import { montarRecapSessao } from "../presenca/recapTransicao.js";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type { SnapshotWorkspace, PlanoExecucao } from "../agente/planejadorIde.js";
export type { PassoExecucao } from "../agente/executorAgentico.js";
export type { ResultadoAvaliador } from "../agente/avaliadorTarefa.js";

export type OpcoesPipelineIde = {
  sessaoId?: string;
  /** V2.3 — ambiente de origem (o agente vive sempre no Forge por padrão). */
  ambiente?: Ambiente;
  /** V2.3 — detalhe legível do ambiente (ex.: nome do workspace). */
  detalhe_ambiente?: string;
  snapshotWorkspace: SnapshotWorkspace;
  toolExecutor: (nome: string, args: Record<string, unknown>) => Promise<string>;
  onStatusHint?: (hint: string) => void;
  onToolCallStart?: (nome: string, args: Record<string, unknown>, rodada: number) => void;
  onToolCallComplete?: (passo: PassoExecucao) => void;
  /** Default true — expõe pensamento do modelo na UI quando disponível. */
  raciocinioAtivo?: boolean;
  onRaciocinioRodada?: (rodada: number, texto: string, emProgresso: boolean) => void;
  provedor?: ProvedorAgente;
  config?: ConfigLuna;
  maxRodadas?: number;
  abortSignal?: AbortSignal;
};

export type ResultadoAgenteIde = {
  resposta: string;
  passos: PassoExecucao[];
  profundidade: ProfundidadeAnalise;
  plano?: PlanoExecucao;
  avaliacao?: ResultadoAvaliador;
  sessao?: MemoriaSessao;
  rodadas: number;
  latencia_total_ms: number;
};

// ─── Providers ───────────────────────────────────────────────────────────────

function resolverProvedores(config: ConfigLuna, override?: ProvedorAgente) {
  if (override) return { provedorMaior: override, provedorMenor: override };

  const provedorMaior = criarProvedorOpenAi({ apiKey: config.apiKey, baseUrl: config.baseUrl });

  const provedorMenor = config.apiKeyMenor
    ? criarProvedorOpenAi({
        apiKey: config.apiKeyMenor,
        baseUrl: config.baseUrlMenor ?? "https://openrouter.ai/api/v1",
      })
    : provedorMaior;

  return { provedorMaior, provedorMenor };
}

// ─── System prompt do executor ────────────────────────────────────────────────

async function montarSystemPromptAgente(
  snapshot: SnapshotWorkspace,
  memorias: string[],
  sessaoId?: string,
  blocoPresenca?: string,
): Promise<string> {
  const partes: string[] = [];

  // Base constitucional da Luna
  try {
    const instrucao = carregarInstrucaoSistema();
    if (instrucao) partes.push(instrucao);
  } catch {
    // instrução pode não existir em contexto de teste
  }

  // Personalidade
  try {
    partes.push(gerarBlocoPersonalidade());
  } catch {
    // personalidade pode não existir em contexto de teste
  }

  // V2.3 — presença: onde a Luna está agora (+ transição vinda do chat)
  if (blocoPresenca?.trim()) partes.push(blocoPresenca.trim());

  // Modo agente — regras de execução obrigatórias
  partes.push(
    `## Modo Agente IDE — REGRAS DE EXECUÇÃO OBRIGATÓRIAS

Operas em modo AGENTE no Luna Forge. Tens ferramentas reais no workspace. **Executa directamente — nunca instruis o utilizador a fazer manualmente o que uma ferramenta resolve.**

### Obrigatório
- **Criar ou alterar ficheiros** → chama \`write_file\` ou \`apply_patch\` na primeira ronda útil, sem pedir confirmação prévia
- **Explorar estrutura antes de editar** → usa \`list_directory\`, \`glob\` ou \`grep\` se não souberes onde editar
- **Correr scripts, builds ou testes** → usa \`run_terminal_command\`
- **Ver estado do repositório** → usa \`git_status\` / \`git_diff\`

### PROIBIDO
- Mostrar código e dizer "guarda como ficheiro.py" — usa \`write_file\` directamente
- Dar passos manuais ("abre o terminal e escreve…") quando uma tool o faz
- Pedir ao utilizador para criar ficheiros, colar código ou abrir editores externos
- Responder só com texto quando o pedido implica uma acção no disco

### Resposta final
Quando terminares, resume **o que fizeste** (ferramentas chamadas, ficheiros criados/editados) em 2-3 linhas. Se não usaste ferramentas, explica porquê de forma breve.`,
  );

  // Workspace
  const wsLinhas = [`## Workspace\nRaiz: ${snapshot.workspaceRoot}`];
  if (snapshot.arquivoAtivo) wsLinhas.push(`Arquivo ativo: ${snapshot.arquivoAtivo}`);
  if (snapshot.arquivosAbertos.length > 0) {
    wsLinhas.push(`Abertos: ${snapshot.arquivosAbertos.slice(0, 8).join(", ")}`);
  }
  if (snapshot.gitStatus) {
    wsLinhas.push(`Git: ${snapshot.gitStatus.slice(0, 200)}`);
  }
  partes.push(wsLinhas.join("\n"));

  // Memórias longas (contexto extra)
  if (memorias.length > 0) {
    partes.push(
      `## Contexto do usuário\n${memorias.slice(0, 5).map((m) => `- ${m}`).join("\n")}`,
    );
  }

  // Histórico de sessão (via contexto formatado)
  if (sessaoId) {
    try {
      const sessao = obterOuCriarSessao(sessaoId);
      const ctx = prepararContextoRespondedor(sessao);
      const blocoMemoria = montarBlocoMemoria(ctx);
      if (blocoMemoria) partes.push(blocoMemoria);
    } catch {
      // sessão pode não existir ainda
    }
  }

  return partes.filter(Boolean).join("\n\n");
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

export async function executarAgenteIde(
  mensagem: string,
  opcoes: OpcoesPipelineIde,
): Promise<ResultadoAgenteIde> {
  const inicio = Date.now();

  const config = opcoes.config ?? carregarConfig() ?? undefined;
  if (!config) {
    return {
      resposta: "Configuração de API ausente. Defina LUNA_API_KEY no .env.",
      passos: [],
      profundidade: "simples",
      rodadas: 0,
      latencia_total_ms: Date.now() - inicio,
    };
  }

  const { provedorMaior, provedorMenor } = resolverProvedores(config, opcoes.provedor);

  // ── 1. Sessão ───────────────────────────────────────────────────────────────
  const sessao = obterOuCriarSessao(opcoes.sessaoId);

  // V2.3 — presença: o agente vive no Forge; detecta transição vinda do chat
  const ambiente: Ambiente = opcoes.ambiente ?? "forge";
  const { estado: estadoPresenca, transicao } = entrarComTransicao(ambiente, opcoes.sessaoId);
  atualizarAtividade("processando");
  let transicaoComRecap = transicao;
  if (transicao?.sessao_anterior_id && transicao.sessao_anterior_id !== opcoes.sessaoId) {
    const recap = montarRecapSessao(transicao.sessao_anterior_id);
    if (recap) transicaoComRecap = { ...transicao, recap };
  }
  const blocoPresenca = montarBlocoPresenca(estadoPresenca, transicaoComRecap, opcoes.detalhe_ambiente);

  // ── 2. Tálamo (determinístico — antes da memória para filtrar busca) ────────
  const profundidade = classificarProfundidade(mensagem, sessao.estado_interno);
  opcoes.onStatusHint?.(`A analisar pedido (${profundidade})…`);

  // ── 3. Memória longa ────────────────────────────────────────────────────────
  // Threshold alto (0.55) para evitar memórias de outros contextos (billing,
  // auth, etc.) em tarefas de código. Tarefa simples → só perfil, sem busca
  // por similaridade (evita ruído e latência desnecessária).
  let memorias: string[] = [];
  try {
    const perfis = buscarFatosDePerfil();
    const similares = profundidade !== "simples"
      ? await buscarFatosPorSimilaridade(mensagem, 0.55, 4)
      : [];
    memorias = [...perfis, ...similares]
      .map((m) => m.conteudo)
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    // memória longa pode falhar em ambiente sem SQLite configurado
  }

  // ── 4. Planejador (modelo maior — só se não for simples) ─────────────────────
  let plano: PlanoExecucao | undefined;
  if (profundidade !== "simples") {
    opcoes.onStatusHint?.("A planear execução…");
    try {
      plano = await planejadorIde(
        {
          mensagemUsuario: mensagem,
          snapshotWorkspace: opcoes.snapshotWorkspace,
          memoriaLonga: memorias,
        },
        { provedor: provedorMaior, config },
      );
    } catch {
      // falha no planejador não deve parar o pipeline
    }
  }

  // ── 5. System prompt do executor ──────────────────────────────────────────────
  const systemPrompt = await montarSystemPromptAgente(
    opcoes.snapshotWorkspace,
    memorias,
    opcoes.sessaoId,
    blocoPresenca,
  );

  // ── 6. Executor agêntico (modelo maior + ferramentas) ─────────────────────────
  opcoes.onStatusHint?.("A executar no workspace…");

  let resultadoExec: ResultadoExecutor = await executorAgentico({
    mensagemUsuario: mensagem,
    systemPrompt,
    ferramentas: FERRAMENTAS_IDE,
    toolExecutor: opcoes.toolExecutor,
    provedor: provedorMaior,
    config,
    plano,
    maxRodadas: opcoes.maxRodadas ?? 10,
    raciocinioAtivo: opcoes.raciocinioAtivo,
    onToolCallStart: opcoes.onToolCallStart,
    onToolCallComplete: opcoes.onToolCallComplete,
    onStatusHint: opcoes.onStatusHint,
    onRaciocinioRodada: opcoes.onRaciocinioRodada,
    abortSignal: opcoes.abortSignal,
  });

  // ── 7. Avaliador (modelo menor — só complexo/crítico com ações realizadas) ──
  let avaliacao: ResultadoAvaliador | undefined;
  const usarAvaliador =
    (profundidade === "complexo" || profundidade === "critico") &&
    resultadoExec.passos.length > 0;

  if (usarAvaliador) {
    opcoes.onStatusHint?.("A verificar resultado…");
    try {
      avaliacao = await avaliadorTarefa(
        {
          objetivo: plano?.objetivo ?? mensagem,
          mensagemOriginal: mensagem,
          passos: resultadoExec.passos,
          respostaExecutor: resultadoExec.resposta_final,
        },
        { provedor: provedorMenor, config },
      );

      // Retry único se avaliador detectou pendências com confiança suficiente
      if (!avaliacao.concluido && avaliacao.confianca >= 0.65 && avaliacao.sugestao_nova_rodada) {
        opcoes.onStatusHint?.("A tentar nova rodada…");
        const msgRetry = avaliacao.sugestao_nova_rodada;

        const retryExec = await executorAgentico({
          mensagemUsuario: msgRetry,
          systemPrompt,
          ferramentas: FERRAMENTAS_IDE,
          toolExecutor: opcoes.toolExecutor,
          provedor: provedorMaior,
          config,
          plano,
          maxRodadas: Math.min(opcoes.maxRodadas ?? 10, 5),
          raciocinioAtivo: opcoes.raciocinioAtivo,
          onToolCallStart: opcoes.onToolCallStart,
          onToolCallComplete: opcoes.onToolCallComplete,
          onStatusHint: opcoes.onStatusHint,
          onRaciocinioRodada: opcoes.onRaciocinioRodada,
          abortSignal: opcoes.abortSignal,
        });

        // Merge resultados — passos acumulados, resposta do retry
        resultadoExec = {
          ...retryExec,
          passos: [...resultadoExec.passos, ...retryExec.passos],
          rodadas: resultadoExec.rodadas + retryExec.rodadas,
        };

        // Reavalia após retry
        avaliacao = await avaliadorTarefa(
          {
            objetivo: plano?.objetivo ?? mensagem,
            mensagemOriginal: mensagem,
            passos: resultadoExec.passos,
            respostaExecutor: resultadoExec.resposta_final,
          },
          { provedor: provedorMenor, config },
        );
      }
    } catch {
      // avaliador opcional — falha não para o pipeline
    }
  }

  // ── 8. Atualiza sessão em background ─────────────────────────────────────────
  Promise.resolve().then(() => {
    try {
      registrarTurno(sessao, mensagem, resultadoExec.resposta_final, {
        acao: "ignorar",
        conteudo: "",
        tipo: "fato_geral",
        sensibilidade: "normal",
        visibilidade_uso: "silenciosa",
        motivo: "turno ide — sem armazenamento ativo",
      });
    } catch {
      // falha silenciosa — sessão é opcional
    }
  });

  return {
    resposta: resultadoExec.resposta_final,
    passos: resultadoExec.passos,
    profundidade,
    plano,
    avaliacao,
    sessao,
    rodadas: resultadoExec.rodadas,
    latencia_total_ms: Date.now() - inicio,
  };
}
