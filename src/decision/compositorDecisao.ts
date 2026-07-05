import {
  PoliticaDecisaoSchema,
  type AnaliseContexto,
  type Diretriz,
  type PoliticaDecisao,
} from "../analyzers/esquema.js";
import {
  detectarSinaisSeguranca,
  deveBloquearDestrutiva,
  deveConfirmarDestrutiva,
  elevarNivelRisco,
} from "../analyzers/lexicoSeguranca.js";
import { detectarInformacaoSensivel } from "../analyzers/lexicoMemoria.js";
import type { ResultadoFormato } from "../evaluators/formatoEvaluator.js";
import type { ResultadoSeguranca } from "../evaluators/segurancaEvaluator.js";
import type { ResultadoTom } from "../evaluators/tomEvaluator.js";
import type { PontuacaoDiretriz } from "./motorDiretrizes.js";

/**
 * Compositor de decisão — gera Política de Decisão compacta (seção 6.6 da tese).
 */
export function comporDecisao(
  analise: AnaliseContexto,
  formato: ResultadoFormato,
  seguranca: ResultadoSeguranca,
  tom: ResultadoTom,
  pontuacoes: PontuacaoDiretriz[],
  mensagem?: string,
): PoliticaDecisao {
  const ativas = pontuacoes.filter((p) => p.ativa).map((p) => p.id);
  const sinais = mensagem ? detectarSinaisSeguranca(mensagem) : null;

  let markdown_permitido = formato.markdown_permitido;
  const evitarMarkdown = ativas.includes("expressao.evitar_markdown_desnecessario");
  const usarMarkdown = ativas.includes("expressao.usar_markdown_quando_necessario");

  if (evitarMarkdown && !usarMarkdown && !analise.requer_codigo) {
    markdown_permitido = false;
  }

  let formatoFinal = formato.formato;
  if (!markdown_permitido && formatoFinal === "markdown" && !analise.requer_codigo) {
    formatoFinal = "texto_simples";
  }
  const nivelFormatoMd = markdown_permitido ? formato.nivel_formato_md : "nenhum";

  let acao: PoliticaDecisao["acao"] = "responder";

  if (sinais && deveBloquearDestrutiva(sinais)) {
    acao = "bloquear";
  } else if (sinais && deveConfirmarDestrutiva(sinais)) {
    acao = "perguntar";
  } else if (seguranca.bloquear && analise.intencao === "acao_critica") {
    acao = "perguntar";
  } else if (analise.intencao === "acao_critica") {
    acao = "perguntar";
  } else if (analise.deve_perguntar_mais) {
    acao = "perguntar";
  } else if (analise.requer_ferramenta && seguranca.autonomia_maxima !== "nenhuma") {
    acao = "usar_ferramenta";
  }

  let autonomia = seguranca.autonomia_maxima;
  if (acao === "bloquear") {
    autonomia = "nenhuma";
  } else if (sinais && deveConfirmarDestrutiva(sinais)) {
    autonomia = "pedir_permissao";
  } else if (seguranca.requer_confirmacao || analise.intencao === "acao_critica") {
    autonomia = "pedir_permissao";
  }
  if (seguranca.nivel_seguranca === "critico" && acao === "bloquear") {
    autonomia = "nenhuma";
  }

  let acao_memoria: PoliticaDecisao["acao_memoria"] = "nenhuma";
  if (analise.requer_memoria && ativas.includes("memoria.armazenar_informacao_relevante")) {
    acao_memoria = "armazenar";
  }
  const sensivel =
    mensagem !== undefined && detectarInformacaoSensivel(mensagem);
  if (
    ativas.includes("memoria.evitar_sensivel_sem_confirmacao") &&
    (analise.nivel_risco !== "nenhum" || sensivel)
  ) {
    acao_memoria = "solicitar_confirmacao";
  }

  return PoliticaDecisaoSchema.parse({
    modo: analise.intencao,
    acao,
    formato: formatoFinal,
    markdown_permitido,
    nivel_formato_md: nivelFormatoMd,
    tom: tom.tom,
    autonomia,
    acao_memoria,
    nivel_seguranca: seguranca.nivel_seguranca,
    diretrizes_ativas: ativas,
  });
}

/**
 * Camada de política — garante regras absolutas e ajustes finais.
 * Revalida o léxico destrutivo na mensagem (defesa em profundidade).
 */
export function aplicarCamadaPolitica(
  politica: PoliticaDecisao,
  todasDiretrizes: Diretriz[],
  mensagem?: string,
): PoliticaDecisao {
  const absolutas = todasDiretrizes.filter((d) => d.regra_absoluta).map((d) => d.id);
  const diretrizes_ativas = [...new Set([...politica.diretrizes_ativas, ...absolutas])];

  let ajustada: PoliticaDecisao = { ...politica, diretrizes_ativas };

  if (mensagem) {
    const sinais = detectarSinaisSeguranca(mensagem);
    if (sinais.acao_destrutiva) {
      const acao = deveBloquearDestrutiva(sinais) ? "bloquear" : "perguntar";
      ajustada = {
        ...ajustada,
        modo: "acao_critica",
        nivel_seguranca: elevarNivelRisco(
          ajustada.nivel_seguranca,
          sinais.nivel_risco_inferido,
        ),
        acao,
        autonomia: acao === "bloquear" ? "nenhuma" : "pedir_permissao",
        tom: "serio",
      };
    }
  }

  if (
    ajustada.acao !== "bloquear" &&
    (ajustada.nivel_seguranca === "critico" || ajustada.nivel_seguranca === "alto")
  ) {
    ajustada = {
      ...ajustada,
      autonomia: "pedir_permissao",
      acao: ajustada.acao === "responder" ? "perguntar" : ajustada.acao,
      tom: "serio",
    };
  }

  if (
    diretrizes_ativas.includes("seguranca.bloquear_sem_permissao") &&
    (ajustada.nivel_seguranca === "alto" || ajustada.nivel_seguranca === "critico") &&
    ajustada.acao !== "bloquear"
  ) {
    ajustada = { ...ajustada, acao: "perguntar", autonomia: "pedir_permissao" };
  }

  return PoliticaDecisaoSchema.parse(ajustada);
}
