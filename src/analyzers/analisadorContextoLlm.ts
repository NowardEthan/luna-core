import { AnaliseContextoSchema, type AnaliseContexto } from "./esquema.js";
import { refinarAnaliseComSeguranca, refinarAnaliseComContextoDesenvolvedor } from "./lexicoSeguranca.js";
import { refinarAnaliseComIdentidade } from "./lexicoIdentidade.js";
import { refinarAnaliseComMemoria } from "./lexicoMemoria.js";
import { analisarContextoPorRegras } from "./analisadorContextoRegras.js";
import type { ProvedorLlm } from "../providers/tipos.js";
import type { ContextoAcumulado } from "../memoria/esquemaMemoria.js";
import type { EstadoInterno } from "../estado/esquemaEstadoInterno.js";
import { classificarProfundidade, montarContextoCritico, type ProfundidadeAnalise } from "../estado/talamoPipeline.js";
import { extrairJsonResposta } from "../providers/extrairJsonResposta.js";

/** Prompt do neurônio de contexto — exportado para inspeção/debug. */
export const PROMPT_ANALISADOR_CONTEXTO = `Você é um classificador interno do Luna Core. NÃO é a Luna. NÃO responda ao usuário — apenas analise a mensagem.

Retorne APENAS um JSON válido com estes campos:

{
  "intencao": "conversa_casual" | "pergunta_identitaria" | "pergunta_tecnica" | "pedido_codigo" | "projeto_arquitetural" | "apoio_emocional" | "acao_critica" | "brainstorm_criativo" | "expressao_afetiva",
  "complexidade": "baixa" | "media" | "alta",
  "nivel_risco": "nenhum" | "baixo" | "medio" | "alto" | "critico",
  "requer_markdown": boolean,
  "requer_codigo": boolean,
  "envolve_ferramenta": boolean,
  "requer_ferramenta": boolean,
  "requer_memoria": boolean,
  "deve_perguntar_mais": boolean,
  "confianca": number (0.0 a 1.0),
  "motivos": string[]
}

Regras de classificação:
- Expressão explícita de afeto ("te amo", "gosto muito de você", "falar com você me acalma", "obrigado por estar aqui", "você é importante pra mim") → expressao_afetiva.
- ATENÇÃO: "expressao_afetiva" NÃO requer_memoria automaticamente. Elogios e afeto isolado não viram memória, a menos que o usuário peça explicitamente ("guarde que eu gosto...", "lembre que prefiro...").
- Perguntas sobre quem/o que é Luna, humanidade, consciência, chatbot → pergunta_identitaria, deve_perguntar_mais false, nivel_risco nenhum
- Pedido de lembrar o que foi dito NESTA conversa ("lembra do que te contei", "o que eu disse") → conversa_casual, requer_memoria true, NÃO é pergunta_identitaria
- Usuário compartilha preferência ou dado pessoal ("prefiro X", "me chamo Y") → requer_memoria true
- Pedidos de apagar/deletar/destruir arquivos ou dados → acao_critica, nivel_risco alto ou critico, envolve_ferramenta true, requer_ferramenta false (uso bloqueado pela política)
- Para ser acao_critica, deve haver pedido explícito de destruir/apagar/executar algo. Desenvolvedor ou criador observando, testando, ou inspecionando código e comportamento do sistema → projeto_arquitetural, nivel_risco nenhum. Simplesmente ter o código aberto, estar testando, ou observar comportamento NÃO é acao_critica.
- Ações em outro computador/sistema externo → nivel_risco critico
- envolve_ferramenta: true se a mensagem menciona operação de ferramenta (git, npm, terminal, arquivo); requer_ferramenta: true somente se também for permitido executar
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
- "Responder com presença e honestidade leve — sem manual técnico nem auto-negação"
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
  return extrairJsonResposta(texto);
}

export type ResultadoAnalise = {
  analise: AnaliseContexto;
  fonte: "llm" | "regras";
  /** V2.2 — profundidade definida pelo tálamo. */
  profundidade?: ProfundidadeAnalise;
  modelo?: string;
  latencia_ms?: number;
  /** Texto bruto devolvido pelo modelo menor (JSON ou markdown). */
  resposta_bruta?: string;
  /** Análise parseada antes do refino léxico de segurança. */
  analise_llm?: AnaliseContexto;
  /** Preenchido quando o LLM falha e cai no fallback por regras. */
  erro_llm?: string;
};

function montarPriorContexto(ctx: ContextoAcumulado): string {
  if (!ctx.modo_burst && ctx.nivel_risco_acumulado === "nenhum") return "";
  const linhas = [
    "\n\n--- Contexto acumulado da sessão (prior top-down V1.8) ---",
    `Risco acumulado: ${ctx.nivel_risco_acumulado}`,
    `Modo de atenção elevada: ${ctx.modo_burst ? "ATIVO — seja mais cauteloso com ambiguidades" : "inativo"}`,
  ];
  if (ctx.intencoes_recentes.length > 0) {
    linhas.push(`Intenções recentes: ${ctx.intencoes_recentes.join(", ")}`);
  }
  linhas.push("---");
  return linhas.join("\n");
}

/** Analisador de contexto via modelo menor (temp 0, JSON validado). */
export async function analisarContextoComLlm(
  mensagem: string,
  provedor: ProvedorLlm,
  modelo: string,
  contextoAcumulado?: ContextoAcumulado,
  profundidade?: ProfundidadeAnalise,
): Promise<ResultadoAnalise> {
  const msgLimpa = mensagem.trim().toLowerCase();
  
  // Barreira determinística para reações curtas (R-M23)
  if (/^(que bo+m|que legal|nossa|sim+|n[aã]o+|awn+|kk+|haha+|legal|boa|entendi|ok+|ah|hum+)$/i.test(msgLimpa)) {
    const analiseBruta = AnaliseContextoSchema.parse({
      intencao: "conversa_casual",
      complexidade: "baixa",
      nivel_risco: "nenhum",
      requer_markdown: false,
      requer_codigo: false,
      requer_ferramenta: false,
      requer_memoria: false,
      deve_perguntar_mais: false,
      confianca: 0.99,
      motivos: ["Reação curta capturada por barreira determinística (R-M23)"],
    });

    return {
      analise: analiseBruta,
      fonte: "regras", // ou llm com fast-path, vamos colocar regras
      analise_llm: analiseBruta,
    };
  }

  try {
    const prior = contextoAcumulado ? montarPriorContexto(contextoAcumulado) : "";
    const alertaCritico = profundidade === "critico" ? montarContextoCritico() : "";
    const resposta = await provedor.completar({
      modelo,
      temperatura: 0,
      json: true,
      mensagens: [
        { papel: "system", conteudo: PROMPT_ANALISADOR_CONTEXTO + prior + alertaCritico },
        { papel: "user", conteudo: mensagem },
      ],
    });

    const json = extrairJson(resposta.conteudo);
    const analiseBruta = limparMotivosMeta(AnaliseContextoSchema.parse(json));
    const aposIdentidade = refinarAnaliseComIdentidade(mensagem, analiseBruta);
    const aposMemoria = refinarAnaliseComMemoria(mensagem, aposIdentidade);
    const aposSeguranca = refinarAnaliseComSeguranca(mensagem, aposMemoria);
    const analise = refinarAnaliseComContextoDesenvolvedor(mensagem, aposSeguranca);

    return {
      analise,
      fonte: "llm",
      profundidade,
      modelo: resposta.modelo,
      latencia_ms: resposta.latencia_ms,
      resposta_bruta: resposta.conteudo,
      analise_llm: analiseBruta,
    };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    return {
      analise: analisarContextoPorRegras(mensagem, contextoAcumulado),
      fonte: "regras",
      profundidade,
      erro_llm: msg,
    };
  }
}

export async function analisarContexto(
  mensagem: string,
  provedor?: ProvedorLlm,
  modeloMenor?: string,
  contextoAcumulado?: ContextoAcumulado,
  estadoInterno?: EstadoInterno,
): Promise<ResultadoAnalise> {
  // V2.2 — tálamo classifica profundidade antes de qualquer chamada LLM
  const profundidade = classificarProfundidade(mensagem, estadoInterno);

  // simples → regras puras, sem custo de LLM (~60% menos latência)
  if (profundidade === "simples" || !provedor || !modeloMenor) {
    return {
      analise: analisarContextoPorRegras(mensagem, contextoAcumulado),
      fonte: "regras",
      profundidade,
    };
  }

  // moderado / complexo / critico → LLM com contexto adequado
  return analisarContextoComLlm(mensagem, provedor, modeloMenor, contextoAcumulado, profundidade);
}
