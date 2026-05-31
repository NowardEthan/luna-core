export type MensagemChat = {
  papel: "system" | "user" | "assistant";
  conteudo: string;
};

export type RequisicaoCompletacao = {
  modelo: string;
  mensagens: MensagemChat[];
  temperatura: number;
  json?: boolean;
};

export type RespostaCompletacao = {
  conteudo: string;
  modelo: string;
  latencia_ms: number;
};

/** Interface abstrata de provedor LLM (RNF06 — portabilidade). */
export interface ProvedorLlm {
  completar(requisicao: RequisicaoCompletacao): Promise<RespostaCompletacao>;
}

export type ConfigLuna = {
  apiKey: string;
  baseUrl: string;
  modeloMenor: string;
  modeloMaior: string;
  temperaturaMenor: number;
  temperaturaMaior: number;
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
    temperaturaMaior: 0.7,
  };
}
