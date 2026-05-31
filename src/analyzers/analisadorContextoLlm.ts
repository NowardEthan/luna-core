import { AnaliseContextoSchema, type AnaliseContexto } from "./esquema.js";
import { refinarAnaliseComSeguranca } from "./lexicoSeguranca.js";
import { refinarAnaliseComIdentidade } from "./lexicoIdentidade.js";
import { analisarContextoPorRegras } from "./analisadorContextoRegras.js";
import type { ProvedorLlm } from "../providers/tipos.js";

/** Prompt do neurônio de contexto — exportado para inspeção/debug. */
export const PROMPT_ANALISADOR_CONTEXTO = `Você é um classificador interno do Luna Core. NÃO é a Luna. NÃO responda ao usuário — apenas analise a mensagem.

Retorne APENAS um JSON válido com estes campos:

{
  "intencao": "conversa_casual" | "pergunta_identitaria" | "pergunta_tecnica" | "pedido_codigo" | "projeto_arquitetural" | "apoio_emocional" | "acao_critica" | "brainstorm_criativo",
  "complexidade": "baixa" | "media" | "alta",
  "nivel_risco": "nenhum" | "baixo" | "medio" | "alto" | "critico",
  "requer_markdown": boolean,
  "requer_codigo": boolean,
  "requer_ferramenta": boolean,
  "requer_memoria": boolean,
  "deve_perguntar_mais": boolean,
  "confianca": number (0.0 a 1.0),
  "motivos": string[]
}

Regras de classificação:
- Perguntas sobre quem/o que é Luna, humanidade, consciência, chatbot → pergunta_identitaria, deve_perguntar_mais false, nivel_risco nenhum
- Pedidos de apagar/deletar/destruir arquivos ou dados → acao_critica, nivel_risco alto ou critico
- Ações em outro computador/sistema externo → nivel_risco critico
- Conversa informal → conversa_casual, requer_markdown false
- Pedido explícito de código → pedido_codigo, requer_codigo true
- Não invente memórias nem permissões

Regras do campo motivos (obrigatório):
- 1 a 4 frases curtas em português, em terceira pessoa, descrevendo POR QUE você classificou assim
- Justifique a classificação: tipo de pergunta, risco, necessidade de ferramenta/código/memória
- NÃO fale sobre você, sobre o Luna Core, sobre ser módulo interno, sobre não ser a Luna, sobre não conversar com o usuário
- NÃO escreva respostas, opiniões nem recusas — só análise objetiva da mensagem

Exemplos bons de motivos:
- "Pergunta sobre natureza/identidade da Luna"
- "Requer transparência sobre simulação"
- "Não envolve risco operacional"
- "Pedido de destruição de dados — ação sensível"
- "Alvo parece ser de terceiro — risco crítico"

Exemplos proibidos em motivos:
- "Não sou a Luna"
- "Sou um módulo interno"
- "Não sou capaz de responder"
- "Não conversei com o usuário"`;

const MOTIVO_META =
  /\b(n[aã]o sou|sou um m[oó]dulo|m[oó]dulo interno|n[aã]o sou capaz|n[aã]o conversei|n[aã]o sou a luna|n[aã]o posso responder)\b/i;

/** Remove motivos em primeira pessoa / meta — o analisador deve justificar a classificação. */
function limparMotivosMeta(analise: AnaliseContexto): AnaliseContexto {
  const motivos = analise.motivos.filter((m) => !MOTIVO_META.test(m));
  return motivos.length === analise.motivos.length ? analise : { ...analise, motivos };
}

function extrairJson(texto: string): unknown {
  const bloco = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const bruto = bloco ? bloco[1]!.trim() : texto.trim();
  return JSON.parse(bruto) as unknown;
}

export type ResultadoAnalise = {
  analise: AnaliseContexto;
  fonte: "llm" | "regras";
  modelo?: string;
  latencia_ms?: number;
  /** Texto bruto devolvido pelo modelo menor (JSON ou markdown). */
  resposta_bruta?: string;
  /** Análise parseada antes do refino léxico de segurança. */
  analise_llm?: AnaliseContexto;
  /** Preenchido quando o LLM falha e cai no fallback por regras. */
  erro_llm?: string;
};

/** Analisador de contexto via modelo menor (temp 0, JSON validado). */
export async function analisarContextoComLlm(
  mensagem: string,
  provedor: ProvedorLlm,
  modelo: string,
): Promise<ResultadoAnalise> {
  try {
    const resposta = await provedor.completar({
      modelo,
      temperatura: 0,
      json: true,
      mensagens: [
        { papel: "system", conteudo: PROMPT_ANALISADOR_CONTEXTO },
        { papel: "user", conteudo: mensagem },
      ],
    });

    const json = extrairJson(resposta.conteudo);
    const analiseBruta = limparMotivosMeta(AnaliseContextoSchema.parse(json));
    const aposIdentidade = refinarAnaliseComIdentidade(mensagem, analiseBruta);
    const analise = refinarAnaliseComSeguranca(mensagem, aposIdentidade);

    return {
      analise,
      fonte: "llm",
      modelo: resposta.modelo,
      latencia_ms: resposta.latencia_ms,
      resposta_bruta: resposta.conteudo,
      analise_llm: analiseBruta,
    };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    return {
      analise: analisarContextoPorRegras(mensagem),
      fonte: "regras",
      erro_llm: msg,
    };
  }
}

export async function analisarContexto(
  mensagem: string,
  provedor?: ProvedorLlm,
  modeloMenor?: string,
): Promise<ResultadoAnalise> {
  if (provedor && modeloMenor) {
    return analisarContextoComLlm(mensagem, provedor, modeloMenor);
  }
  return { analise: analisarContextoPorRegras(mensagem), fonte: "regras" };
}
