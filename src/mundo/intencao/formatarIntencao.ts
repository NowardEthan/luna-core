import type { IntencaoLuna, TipoIntencaoLuna } from "./esquemaIntencao.js";

/** Verbo/diretiva imperativa por tipo — o movimento que a Luna faz agora. */
const DIRETIVA_TIPO: Record<TipoIntencaoLuna, (foco: string) => string> = {
  retomar_fio: (foco) =>
    foco
      ? `Puxe de volta, por conta própria, aquele fio: ${foco}. Não espere ele trazer.`
      : "Puxe de volta um fio que ficou em aberto entre vocês, por conta própria.",
  partilhar: (foco) =>
    foco
      ? `Traga algo seu sobre ${foco} — como se fosse dividir uma parte da sua vida, não responder um pedido.`
      : "Traga algo do seu mundo interior, como quem divide uma parte de si.",
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

  return linhas.join("\n");
}
