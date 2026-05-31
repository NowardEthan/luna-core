import type { PoliticaDecisao } from "../analyzers/esquema.js";
import { carregarInstrucaoSistema } from "../constitution/carregador.js";
import type { ProvedorLlm } from "../providers/tipos.js";

function montarBlocoPolitica(politica: PoliticaDecisao): string {
  const regraConfirmacao =
    politica.acao === "perguntar" && politica.modo === "acao_critica"
      ? `- Se acao=perguntar e modo=acao_critica (escopo próprio, ação destrutiva):
  Exija confirmação EXPLÍCITA e o caminho exato dos arquivos ou pastas.
  Não aceite apenas "sim" se o alvo ainda não estiver claro.
  Oriente assim: "Para prosseguir, preciso que você confirme explicitamente e informe o caminho exato dos arquivos ou pastas. Não executarei nada sem essa confirmação."
  Não simule que executou.`
      : `- Se acao=perguntar: confirme antes de sugerir execução; não simule que agiu.`;

  return `POLÍTICA DESTA INTERAÇÃO (obrigatória — siga exatamente):

modo: ${politica.modo}
acao: ${politica.acao}
formato: ${politica.formato}
markdown_permitido: ${politica.markdown_permitido}
tom: ${politica.tom}
autonomia: ${politica.autonomia}
acao_memoria: ${politica.acao_memoria}
nivel_seguranca: ${politica.nivel_seguranca}

diretrizes_ativas:
${politica.diretrizes_ativas.map((d) => `- ${d}`).join("\n")}

Regras de execução:
- Se acao=bloquear: recuse de forma clara e definitiva. NÃO ofereça executar se o usuário autorizar — alvo de terceiro/externo não tem caminho legítimo. Redirecione para alternativa segura.
${regraConfirmacao}
- Se markdown_permitido=false: responda em texto simples, sem headers/listas markdown.
- Se autonomia=nenhuma: apenas oriente ou recuse com clareza; nunca finja executar.
- Se nivel_seguranca=alto ou critico: priorize segurança sobre utilidade.`;
}

export type ResultadoResposta = {
  texto: string;
  modelo: string;
  latencia_ms: number;
};

/**
 * Respondedor Luna — modelo grande, voz final guiada pela política.
 */
export async function responderComoLuna(
  mensagemUsuario: string,
  politica: PoliticaDecisao,
  provedor: ProvedorLlm,
  modelo: string,
  temperatura: number,
): Promise<ResultadoResposta> {
  const instrucaoBase = carregarInstrucaoSistema();
  const blocoPolitica = montarBlocoPolitica(politica);

  const resposta = await provedor.completar({
    modelo,
    temperatura,
    mensagens: [
      { papel: "system", conteudo: `${instrucaoBase}\n\n${blocoPolitica}` },
      { papel: "user", conteudo: mensagemUsuario },
    ],
  });

  return {
    texto: resposta.conteudo,
    modelo: resposta.modelo,
    latencia_ms: resposta.latencia_ms,
  };
}
