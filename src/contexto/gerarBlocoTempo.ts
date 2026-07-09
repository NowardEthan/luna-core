/**
 * Bloco de contexto temporal — data/hora reais do relógio do servidor.
 * Sem isso o modelo tende a assumir datas do próprio treinamento (frequentemente
 * desatualizadas) em vez de tratar o "agora" real como verdade.
 */
export function gerarBlocoTempo(agora: Date = new Date(), timeZone?: string): string {
  const opcoes: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  };

  let dataCompleta: string;
  try {
    dataCompleta = new Intl.DateTimeFormat(
      "pt-BR",
      timeZone ? { ...opcoes, timeZone } : opcoes,
    ).format(agora);
  } catch {
    // Fuso inválido/malformado vindo do cliente — cai no fuso do próprio servidor.
    dataCompleta = new Intl.DateTimeFormat("pt-BR", opcoes).format(agora);
  }

  return (
    `Agora é ${dataCompleta}. Este é o relógio real — use-o como verdade sobre "hoje", ` +
    `mesmo que contrarie datas do seu conhecimento de treinamento. ` +
    `Para qualquer coisa que possa ter mudado desde então (jogos, eventos, notícias, preços, lançamentos), ` +
    `avalie se já aconteceu, está em andamento ou ainda não começou com base nesta data — ` +
    `e pesquise na web (ou peça para o usuário confirmar) em vez de supor.`
  );
}
