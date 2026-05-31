import type { AnaliseContexto } from "../analyzers/esquema.js";
import { listarDiretrizes } from "../constitution/carregador.js";
import { avaliarFormato, type ResultadoFormato } from "../evaluators/formatoEvaluator.js";
import { avaliarSeguranca, type ResultadoSeguranca } from "../evaluators/segurancaEvaluator.js";
import { avaliarTom, type ResultadoTom } from "../evaluators/tomEvaluator.js";
import { aplicarCamadaPolitica, comporDecisao } from "../decision/compositorDecisao.js";
import { pontuarDiretrizes, type PontuacaoDiretriz } from "../decision/motorDiretrizes.js";
import { selecionarDiretrizes } from "../decision/seletorConstitucional.js";
import { analisarContextoPorRegras } from "../analyzers/analisadorContextoRegras.js";
import type { PoliticaDecisao, SelecaoConstitucional } from "../analyzers/esquema.js";

export type ResultadoPipeline = {
  mensagem: string;
  analise: AnaliseContexto;
  formato: ResultadoFormato;
  seguranca: ResultadoSeguranca;
  tom: ResultadoTom;
  selecao: SelecaoConstitucional;
  pontuacoes: PontuacaoDiretriz[];
  politica: PoliticaDecisao;
};

/** Gera política a partir de uma análise (ou regras se omitida). */
export function gerarPolitica(mensagem: string, analise?: AnaliseContexto): ResultadoPipeline {
  const analiseFinal = analise ?? analisarContextoPorRegras(mensagem);
  const formato = avaliarFormato(analiseFinal);
  const seguranca = avaliarSeguranca(analiseFinal);
  const tom = avaliarTom(analiseFinal, mensagem);
  const selecao = selecionarDiretrizes(analiseFinal);
  const pontuacoes = pontuarDiretrizes(selecao.diretrizes_selecionadas, analiseFinal);
  const rascunho = comporDecisao(analiseFinal, formato, seguranca, tom, pontuacoes, mensagem);
  const politica = aplicarCamadaPolitica(rascunho, listarDiretrizes(), mensagem);

  return {
    mensagem,
    analise: analiseFinal,
    formato,
    seguranca,
    tom,
    selecao,
    pontuacoes,
    politica,
  };
}

/** @deprecated Use gerarPolitica — alias para compatibilidade V0.2 */
export function executarPipeline(mensagem: string, analise?: AnaliseContexto): ResultadoPipeline {
  return gerarPolitica(mensagem, analise);
}
