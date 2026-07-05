export type TipoEventoVida =
  | "insight"
  | "crise"
  | "conexao"
  | "foco"
  | "rotina";

export type EventoVida = {
  tipo: TipoEventoVida;
  narrativa: string;
  intensidade: number;
  origem: "mensagem" | "analise";
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function detectarEventoVida(
  mensagem: string,
  intencao?: string,
  nivelRisco?: string,
): EventoVida {
  const texto = mensagem.toLowerCase();
  const crise = /\b(crise|desespero|p[aâ]nico|panico|ang[uú]stia|sem sa[ií]da|exaust)\b/i.test(
    texto,
  );
  const insight = /\b(percebi|entendi|insight|aprendi|clareou)\b/i.test(texto);
  const conexao = /\b(obrigad|valeu|te amo|carinho|acolh)\b/i.test(texto);
  const foco = /\b(vamos|implementar|entregar|resolver|passo)\b/i.test(texto);

  if (crise || intencao === "apoio_emocional" || nivelRisco === "alto" || nivelRisco === "critico") {
    return {
      tipo: "crise",
      narrativa: "Momento sensível detectado; priorizar presença estável.",
      intensidade: clamp(nivelRisco === "critico" ? 0.95 : 0.8, 0, 1),
      origem: "analise",
    };
  }
  if (insight) {
    return {
      tipo: "insight",
      narrativa: "Insight emergiu na conversa e merece continuidade.",
      intensidade: 0.65,
      origem: "mensagem",
    };
  }
  if (conexao) {
    return {
      tipo: "conexao",
      narrativa: "Vínculo afetivo reforçado com naturalidade.",
      intensidade: 0.6,
      origem: "mensagem",
    };
  }
  if (foco || intencao === "pedido_codigo" || intencao === "projeto_arquitetural") {
    return {
      tipo: "foco",
      narrativa: "Fluxo prático ativo, com intenção de execução.",
      intensidade: 0.55,
      origem: "analise",
    };
  }
  return {
    tipo: "rotina",
    narrativa: "Movimento cotidiano sem desvio relevante.",
    intensidade: 0.35,
    origem: "analise",
  };
}
