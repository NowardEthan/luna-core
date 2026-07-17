export type MensagemChat = {
  papel: "system" | "user" | "assistant";
  conteudo: string;
};

export type RequisicaoCompletacao = {
  modelo: string;
  mensagens: MensagemChat[];
  temperatura: number;
  json?: boolean;
  /** Pedir raciocínio explícito quando o modelo suporta (default: true no respondedor). */
  raciocinioAtivo?: boolean;
  /** low/medium/high — controla profundidade do raciocínio quando suportado. */
  raciocinioEffort?: "low" | "medium" | "high";
  /**
   * Teto de saída — a PAREDE. Pedir "seja breve" no prompt é negociar com o modelo, e ele
   * ganha essa negociação: o módulo de intenção já mandava "não ecoe" e ela ecoava. O teto
   * não se negocia. Quem o calcula é o neurônio de registro (`estado/registroConversa.ts`).
   */
  maxTokens?: number;
};

export type RespostaCompletacao = {
  conteudo: string;
  modelo: string;
  latencia_ms: number;
  raciocinio?: string;
};

export type ChunkStreamLlm =
  | { tipo: "content"; delta: string }
  | { tipo: "reasoning"; delta: string };

export type RespostaStreamCompletacao = {
  conteudo: string;
  raciocinio?: string;
  modelo: string;
  latencia_ms: number;
};

/** Interface abstrata de provedor LLM (RNF06 — portabilidade). */
export interface ProvedorLlm {
  completar(requisicao: RequisicaoCompletacao): Promise<RespostaCompletacao>;
}

// ─── Tipos para tool calling (V3 — PAIA Agêntica) ──────────────────────────

/** Definição de ferramenta no formato OpenAI function calling. */
export type DefinicaoFerramenta = {
  nome: string;
  descricao: string;
  parametros: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        /** Para `type: "array"` — o esquema dos itens (ex.: os dias da semana da rotina). */
        items?: { type: string; properties?: Record<string, unknown> };
      }
    >;
    required?: string[];
  };
};

/** Uma chamada de ferramenta solicitada pelo modelo. */
export type ChamadaFerramenta = {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
};

/**
 * Mensagem agêntica — suporta papéis extras além do chat simples:
 * - assistant pode conter tool_calls em vez de texto
 * - ferramenta carrega o resultado de uma tool call
 */
export type MensagemChatAgente =
  | { papel: "system"; conteudo: string }
  | { papel: "user"; conteudo: string }
  | { papel: "assistant"; conteudo?: string; chamadas_ferramenta?: ChamadaFerramenta[] }
  | { papel: "ferramenta"; id_chamada: string; nome: string; conteudo: string };

export type RequisicaoAgente = {
  modelo: string;
  mensagens: MensagemChatAgente[];
  temperatura: number;
  ferramentas?: DefinicaoFerramenta[];
  /** Pedir raciocínio explícito à API quando o modelo suporta (default: true no agente). */
  raciocinioAtivo?: boolean;
  /** low/medium/high — controla profundidade do raciocínio quando suportado. */
  raciocinioEffort?: "low" | "medium" | "high";
  /** Teto de saída — ver RequisicaoCompletacao.maxTokens. */
  maxTokens?: number;
};

/** Resposta agêntica — texto final OU chamadas de ferramentas a executar. */
export type RespostaAgente = {
  /** Resposta em texto quando o modelo terminou o loop. */
  conteudo?: string;
  /** Chamadas de ferramentas quando o modelo quer executar ações. */
  chamadas?: ChamadaFerramenta[];
  /** Pensamento do modelo (Groq reasoning, OpenRouter thinking, etc.). */
  raciocinio?: string;
  modelo: string;
  latencia_ms: number;
};

/** Provedor com suporte a tool calling (V3). */
export interface ProvedorAgente extends ProvedorLlm {
  completarComFerramentas(requisicao: RequisicaoAgente): Promise<RespostaAgente>;
}

export type ConfigLuna = {
  apiKey: string;
  baseUrl: string;
  modeloMenor: string;
  modeloMaior: string;
  temperaturaMenor: number;
  temperaturaMaior: number;
  // Provedor separado para modelos menores (opcional — se ausente, usa o mesmo provedor)
  apiKeyMenor?: string;
  baseUrlMenor?: string;
  /**
   * Teto de saída DESTE turno — decidido pelo neurônio de registro, igual à temperatura
   * (que já varia por turno em `temperaturaResposta`). Ausente = sem teto.
   */
  maxTokensResposta?: number;
};

export function carregarConfig(): ConfigLuna | null {
  const apiKey = process.env.LUNA_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1",
    modeloMenor: process.env.LUNA_MODELO_MENOR?.trim() || "llama-3.1-8b-instant",
    modeloMaior: process.env.LUNA_MODELO_MAIOR?.trim() || "openai/gpt-oss-120b",
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
    apiKeyMenor: process.env.LUNA_API_KEY_MENOR?.trim() || undefined,
    baseUrlMenor: process.env.LUNA_API_BASE_MENOR?.trim() || undefined,
  };
}
