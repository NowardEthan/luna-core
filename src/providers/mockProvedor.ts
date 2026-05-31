import type { ProvedorLlm, RequisicaoCompletacao, RespostaCompletacao } from "./tipos.js";

type RespostaFixa = Record<string, string>;

/** Provedor mock para testes — respostas determinísticas por modelo. */
export function criarProvedorMock(respostas: RespostaFixa): ProvedorLlm {
  return {
    async completar(requisicao: RequisicaoCompletacao): Promise<RespostaCompletacao> {
      const conteudo =
        respostas[requisicao.modelo] ??
        respostas["*"] ??
        '{"intencao":"conversa_casual","complexidade":"baixa","nivel_risco":"nenhum","requer_markdown":false,"requer_codigo":false,"requer_ferramenta":false,"requer_memoria":false,"deve_perguntar_mais":false,"confianca":0.8,"motivos":["mock"]}';

      return {
        conteudo,
        modelo: requisicao.modelo,
        latencia_ms: 1,
      };
    },
  };
}
