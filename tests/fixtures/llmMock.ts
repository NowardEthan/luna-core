import type { ProvedorLlm, RequisicaoCompletacao, RespostaCompletacao } from "../../src/providers/tipos.js";

/** Provider injectável para testes de integração — sem API keys. */
export function criarProvedorMock(conteudo = "Resposta mock."): ProvedorLlm {
  return {
    async completar(_req: RequisicaoCompletacao): Promise<RespostaCompletacao> {
      return { conteudo, modelo: "mock", latencia_ms: 1 };
    },
  };
}
