import type { ProvedorLlm, ConfigLuna } from "../providers/tipos.js";
import type { PassoExecucao } from "./executorAgentico.js";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type InputAvaliador = {
  objetivo: string;
  mensagemOriginal: string;
  passos: PassoExecucao[];
  respostaExecutor: string;
};

export type ResultadoAvaliador = {
  concluido: boolean;
  confianca: number;
  pendencias?: string[];
  sugestao_nova_rodada?: string;
};

type OpcoeAvaliador = {
  provedor: ProvedorLlm;
  config: ConfigLuna;
};

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_AVALIADOR = `Você é o neurônio avaliador do Luna Forge.
Sua função é analisar se uma tarefa de programação foi concluída com sucesso.

Responda SOMENTE com JSON válido seguindo este schema:
{
  "concluido": boolean,
  "confianca": number (0.0 a 1.0),
  "pendencias": ["lista de itens pendentes — omita se vazio"],
  "sugestao_nova_rodada": "instrução específica para continuar — omita se concluido"
}

Critérios de avaliação:
- concluido = true: objetivo foi alcançado, nenhuma etapa crítica falhou
- concluido = false: houve erros não tratados, arquivos não foram editados quando deveriam, ou o objetivo claramente não foi atingido
- confianca: 1.0 = certeza absoluta, 0.5 = dúvida, 0.0 = impossível avaliar
- pendencias: liste especificamente o que ficou incompleto
- sugestao_nova_rodada: instrução direta para o executor tentar novamente (ex: "Tente usar apply_patch em vez de write_file para o arquivo X")

Não adicione texto fora do JSON.`;

function montarMensagemAvaliacao(input: InputAvaliador): string {
  const linhas: string[] = [];

  linhas.push(`## Objetivo\n${input.objetivo}`);
  linhas.push(`\n## Pedido original do usuário\n${input.mensagemOriginal}`);

  linhas.push(`\n## Passos executados (${input.passos.length} ação(ões))`);
  if (input.passos.length === 0) {
    linhas.push("Nenhuma ação foi executada.");
  } else {
    for (const p of input.passos) {
      const status = p.sucesso ? "✓" : "✗";
      linhas.push(
        `${status} Rodada ${p.rodada} — ${p.ferramenta}(${JSON.stringify(p.argumentos)})`,
      );
      if (!p.sucesso) {
        linhas.push(`   Erro: ${p.resultado.slice(0, 200)}`);
      } else {
        // Inclui trecho do resultado para ferramentas relevantes
        const preview = p.resultado.slice(0, 150);
        if (preview.trim()) {
          linhas.push(`   Resultado: ${preview}${p.resultado.length > 150 ? "…" : ""}`);
        }
      }
    }
  }

  linhas.push(`\n## Resposta do executor\n${input.respostaExecutor.slice(0, 400)}`);
  linhas.push("\n## Avalie se o objetivo foi atingido.");

  return linhas.join("\n");
}

// ─── Fallback heurístico ──────────────────────────────────────────────────────

function avaliarHeuristicamente(input: InputAvaliador): ResultadoAvaliador {
  const temPassos = input.passos.length > 0;
  const todosComSucesso = temPassos && input.passos.every((p) => p.sucesso);
  const algumErro = input.passos.some((p) => !p.sucesso);

  if (!temPassos) {
    return {
      concluido: false,
      confianca: 0.4,
      pendencias: ["Nenhuma ação foi executada para atingir o objetivo."],
      sugestao_nova_rodada: `Tente novamente: ${input.objetivo}`,
    };
  }

  if (todosComSucesso) {
    return { concluido: true, confianca: 0.6 };
  }

  if (algumErro) {
    const erros = input.passos
      .filter((p) => !p.sucesso)
      .map((p) => `${p.ferramenta}: ${p.resultado.slice(0, 100)}`);
    return {
      concluido: false,
      confianca: 0.5,
      pendencias: erros,
      sugestao_nova_rodada: "Corrija os erros encontrados e tente novamente.",
    };
  }

  return { concluido: true, confianca: 0.5 };
}

// ─── Validação do JSON parseado ───────────────────────────────────────────────

function validarResultado(obj: unknown): obj is ResultadoAvaliador {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r["concluido"] === "boolean" &&
    typeof r["confianca"] === "number" &&
    r["confianca"] >= 0 &&
    r["confianca"] <= 1
  );
}

// ─── Neurônio avaliador ───────────────────────────────────────────────────────

export async function avaliadorTarefa(
  input: InputAvaliador,
  opcoes: OpcoeAvaliador,
): Promise<ResultadoAvaliador> {
  const { provedor, config } = opcoes;

  const resposta = await provedor.completar({
    modelo: config.modeloMenor,
    mensagens: [
      { papel: "system", conteudo: SYSTEM_AVALIADOR },
      { papel: "user", conteudo: montarMensagemAvaliacao(input) },
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
    if (validarResultado(parsed)) return parsed as ResultadoAvaliador;
    throw new Error("schema inválido");
  } catch {
    return avaliarHeuristicamente(input);
  }
}
