import type { ProvedorLlm, ConfigLuna } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type SnapshotWorkspace = {
  workspaceRoot: string;
  arquivosAbertos: string[];
  arquivoAtivo?: string;
  selecaoAtiva?: string;
  gitStatus?: string;
  arquivosRecentes?: string[];
};

export type InputPlanejador = {
  mensagemUsuario: string;
  snapshotWorkspace: SnapshotWorkspace;
  historicoRecente?: string[];
  memoriaLonga?: string[];
};

export type PlanoExecucao = {
  objetivo: string;
  tipo: "leitura" | "edicao" | "terminal" | "git" | "misto";
  arquivos_relevantes: string[];
  ferramentas_previstas: string[];
  complexidade: "baixa" | "media" | "alta";
  requer_confirmacao: boolean;
  contexto_adicional?: string;
};

type OpcoesplanejadorIde = {
  provedor: ProvedorLlm;
  config: ConfigLuna;
};

// ─── Prompt ──────────────────────────────────────────────────────────────────

const FERRAMENTAS_DISPONIVEIS = [
  "read_file",
  "write_file",
  "apply_patch",
  "list_directory",
  "glob",
  "grep",
  "run_terminal_command",
  "git_status",
  "git_diff",
  "git_commit",
  "search_codebase",
];

const SYSTEM_PLANEJADOR = `Você é o neurônio planejador do Luna Forge — um IDE agentico.
Sua única função é analisar o pedido do usuário e o estado atual do workspace e produzir um plano de execução estruturado em JSON.

Ferramentas disponíveis para o executor:
${FERRAMENTAS_DISPONIVEIS.map((f) => `  - ${f}`).join("\n")}

Responda SOMENTE com JSON válido seguindo este schema:
{
  "objetivo": "string — o que precisa ser feito em 1 frase clara",
  "tipo": "leitura" | "edicao" | "terminal" | "git" | "misto",
  "arquivos_relevantes": ["array de paths que serão lidos ou editados"],
  "ferramentas_previstas": ["array de nomes de ferramentas que serão chamadas"],
  "complexidade": "baixa" | "media" | "alta",
  "requer_confirmacao": boolean,
  "contexto_adicional": "string opcional — notas para o executor"
}

Regras:
- requer_confirmacao = true se o pedido envolve: deletar arquivos, fazer commit, executar comandos perigosos, ou modificar muitos arquivos de uma vez
- arquivos_relevantes deve listar apenas os paths mencionados ou inferíveis do workspace — nunca inventar
- ferramentas_previstas deve ser subconjunto das ferramentas disponíveis listadas acima
- Não adicione texto fora do JSON`;

function montarMensagemUsuario(input: InputPlanejador): string {
  const linhas: string[] = [];

  linhas.push(`## Pedido do usuário\n${input.mensagemUsuario}`);

  const ws = input.snapshotWorkspace;
  linhas.push(`\n## Workspace\nRaiz: ${ws.workspaceRoot}`);

  if (ws.arquivoAtivo) {
    linhas.push(`Arquivo ativo: ${ws.arquivoAtivo}`);
  }
  if (ws.arquivosAbertos.length > 0) {
    linhas.push(`Arquivos abertos:\n${ws.arquivosAbertos.map((a) => `  - ${a}`).join("\n")}`);
  }
  if (ws.arquivosRecentes && ws.arquivosRecentes.length > 0) {
    linhas.push(
      `Editados recentemente:\n${ws.arquivosRecentes.slice(0, 5).map((a) => `  - ${a}`).join("\n")}`,
    );
  }
  if (ws.selecaoAtiva) {
    linhas.push(
      `\nCódigo selecionado:\n\`\`\`\n${ws.selecaoAtiva.slice(0, 500)}\n\`\`\``,
    );
  }
  if (ws.gitStatus) {
    linhas.push(`\nGit status:\n${ws.gitStatus.slice(0, 300)}`);
  }

  if (input.memoriaLonga && input.memoriaLonga.length > 0) {
    linhas.push(
      `\n## Memória relevante\n${input.memoriaLonga.slice(0, 3).map((m) => `  - ${m}`).join("\n")}`,
    );
  }

  if (input.historicoRecente && input.historicoRecente.length > 0) {
    linhas.push(
      `\n## Histórico recente\n${input.historicoRecente.slice(-3).join("\n")}`,
    );
  }

  linhas.push("\n## Tarefa\nGere o plano JSON para este pedido.");

  return linhas.join("\n");
}

// ─── Fallback seguro ─────────────────────────────────────────────────────────

function planoFallback(mensagem: string): PlanoExecucao {
  const lower = mensagem.toLowerCase();
  const ehEdicao =
    lower.includes("edita") ||
    lower.includes("altera") ||
    lower.includes("cria") ||
    lower.includes("adiciona") ||
    lower.includes("refatora") ||
    lower.includes("muda");
  const ehTerminal =
    lower.includes("roda") ||
    lower.includes("executa") ||
    lower.includes("test") ||
    lower.includes("build") ||
    lower.includes("npm") ||
    lower.includes("yarn");
  const ehGit =
    lower.includes("commit") ||
    lower.includes("git") ||
    lower.includes("push");

  const tipo = ehGit ? "git" : ehTerminal ? "terminal" : ehEdicao ? "edicao" : "leitura";

  return {
    objetivo: mensagem.slice(0, 120),
    tipo,
    arquivos_relevantes: [],
    ferramentas_previstas: tipo === "leitura" ? ["read_file"] : tipo === "terminal" ? ["run_terminal_command"] : tipo === "git" ? ["git_status", "git_commit"] : ["read_file", "write_file"],
    complexidade: "media",
    requer_confirmacao: ehGit || (ehEdicao && mensagem.length > 80),
  };
}

// ─── Validação do JSON parseado ───────────────────────────────────────────────

function validarPlano(obj: unknown): obj is PlanoExecucao {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p["objetivo"] === "string" &&
    ["leitura", "edicao", "terminal", "git", "misto"].includes(p["tipo"] as string) &&
    Array.isArray(p["arquivos_relevantes"]) &&
    Array.isArray(p["ferramentas_previstas"]) &&
    ["baixa", "media", "alta"].includes(p["complexidade"] as string) &&
    typeof p["requer_confirmacao"] === "boolean"
  );
}

// ─── Neurônio planejador ──────────────────────────────────────────────────────

export async function planejadorIde(
  input: InputPlanejador,
  opcoes: OpcoesplanejadorIde,
): Promise<PlanoExecucao> {
  const { provedor, config } = opcoes;

  const resposta = await provedor.completar({
    modelo: config.modeloMaior,
    mensagens: [
      { papel: "system", conteudo: SYSTEM_PLANEJADOR },
      { papel: "user", conteudo: montarMensagemUsuario(input) },
    ],
    temperatura: 0,
    json: true,
  });

  try {
    const raw = resposta.conteudo.trim();
    const inicio = raw.indexOf("{");
    const fim = raw.lastIndexOf("}");
    if (inicio === -1 || fim === -1) throw new Error("sem JSON");

    const parsed: unknown = JSON.parse(raw.slice(inicio, fim + 1));
    if (validarPlano(parsed)) return parsed;
    throw new Error("schema inválido");
  } catch {
    return planoFallback(input.mensagemUsuario);
  }
}
