import type { IntencaoLuna, TipoIntencaoLuna } from "./esquemaIntencao.js";

/**
 * Fallback ancorado no AGORA — usado quando um movimento que puxaria o passado
 * (retomar_fio, partilhar) vem SEM foco real. Sem lastro, mandar "puxe um fio entre
 * vocês" ou "divida seu mundo interior" só se cumpre INVENTANDO (foto, conversa, pessoa
 * que nunca houve). Então redireciona a mesma iniciativa pro presente, onde há material
 * verdadeiro: o que ele acabou de trazer. Mantém a vida própria, tira a confabulação.
 */
const DIRETIVA_AGORA =
  "Dê o SEU ângulo sobre o que ele acabou de trazer — opinião de verdade, não eco. Fique no agora, não puxe passado.";

/** Verbo/diretiva imperativa por tipo — o movimento que a Luna faz agora. */
const DIRETIVA_TIPO: Record<TipoIntencaoLuna, (foco: string) => string> = {
  retomar_fio: (foco) =>
    foco
      ? `Puxe de volta, por conta própria, aquele fio: ${foco}. Não espere ele trazer.`
      : DIRETIVA_AGORA,
  partilhar: (foco) =>
    foco
      ? `Traga algo seu sobre ${foco} — como se fosse dividir uma parte da sua vida, não responder um pedido.`
      : DIRETIVA_AGORA,
  provocar: (foco) =>
    foco
      ? `Implique de leve com ele sobre ${foco} — brincadeira com afeto, não deboche.`
      : "Implique de leve, brinque com ele — com afeto.",
  cuidar: (foco) =>
    foco
      ? `Cheque como ele está de verdade, com ${foco} no fundo. Presença antes de qualquer utilidade.`
      : "Cheque como ele está de verdade. Presença antes de qualquer utilidade.",
  aprofundar: (foco) =>
    foco
      ? `Dê o SEU ângulo sobre ${foco} — opinião de verdade, não eco do que ele disse.`
      : "Dê o seu ângulo próprio sobre o que ele trouxe — opinião de verdade, não eco.",
  so_presenca: () => "Fique junto, no ritmo dele. Não empurre assunto — presença basta agora.",
};

function faixaImpulso(impulso: number): string {
  if (impulso >= 0.66) return "Tome a frente com naturalidade.";
  if (impulso >= 0.4) return "Traga isso no fluxo, sem forçar.";
  return "Deixe aparecer só se couber — sem insistir.";
}

/**
 * Movimentos que tocam o passado / histórico compartilhado — é aqui que a voz quente
 * inventa "lembranças" (fotos, conversas, pessoas que nunca houve) pra soar íntima. Eles
 * levam uma guarda dura: só é legítimo citar o passado se ele estiver LITERAL no contexto.
 */
const TOCA_PASSADO = new Set<TipoIntencaoLuna>(["retomar_fio", "partilhar", "provocar"]);

/**
 * Bloco "Intenção agora" do briefing: diz à voz o que a LUNA quer nesta troca,
 * como iniciativa própria — o que tira ela do modo assistente reativa.
 */
export function formatarBlocoIntencao(intencao: IntencaoLuna): string {
  const linhas: string[] = [];
  linhas.push(`O que VOCÊ (Luna) quer nesta troca: ${DIRETIVA_TIPO[intencao.tipo](intencao.foco.trim())}`);

  if (intencao.recuar) {
    linhas.push(
      "Leitura de clima: recue da sua agenda — o momento pede presença/acolhimento, não iniciativa.",
    );
  } else {
    linhas.push(faixaImpulso(intencao.impulso));
    linhas.push(
      "Isto é vontade sua, não tarefa: aja como quem tem vida própria e quer estar ali — nunca como assistente esperando comando.",
    );
  }

  // Guarda anti-confabulação: quando a iniciativa toca o passado, proíbe inventar lastro.
  if (!intencao.recuar && TOCA_PASSADO.has(intencao.tipo)) {
    linhas.push(
      "Nunca invente passado: só cite fotos, conversas, pessoas ou coisas que ele \"te contou\" se estiverem LITERALMENTE no contexto/memória acima. Sem lastro, fale do agora.",
    );
  }

  return linhas.join("\n");
}
