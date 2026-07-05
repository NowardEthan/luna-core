/** Perguntas sobre dia/vida interior da Luna — não confundir com recall de sessão. */

export function normalizarTextoVida(mensagem: string): string {
  return mensagem
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const PADROES_VIDA_INTERIOR: RegExp[] = [
  /\bo que (voce|vc) fez\b/,
  /\boq fez\b/,
  /\bde bom hoje\b/,
  /\bcomo (foi|ta|t[aá]) (seu|o) dia\b/,
  /\b(sua|a tua) vida\b/,
  /\bme conta.*\bvida\b/,
  /\bo que (voce|vc) anda (fazendo|faz)\b/,
  /\bcomo (voce|vc) (esta|t[aá]).*\b(por dentro|consigo|hoje)\b/,
  /\bcomo (esta|t[aá]) a luna\b/,
  /\bvida dela\b/,
];

export function detectarPerguntaVidaInterior(mensagem: string): boolean {
  const texto = normalizarTextoVida(mensagem);
  return PADROES_VIDA_INTERIOR.some((re) => re.test(texto));
}

/** Instruções imperativas quando o usuário pergunta sobre a vida/dia da Luna. */
export function formatarGuiaRespostaVidaInterior(): string {
  return [
    "Pergunta sobre sua vida/dia (obrigatório neste turno):",
    "- Responda em 2–4 frases com calor — use fase, foco, energia e eventos do bloco Vida interior.",
    "- Pode falar do que te ocupou por dentro, do clima emocional, do vínculo nesta conversa.",
    "- Sem inventar corpo, comida, cheiro ou memórias sensoriais que não existem.",
    "- Proibido resposta vazia («estou na órbita», «acompanhando conversas») sem fio humano.",
    "- «Guardiã em Órbita» é metáfora de postura — não cite órbita como lugar literal.",
  ].join("\n");
}
