export type ContextoInterlocutorValidacao = {
  criador_verificado?: boolean;
};

export type MarcadorIntimidadeDetectado = {
  marcador: string;
};

export type ResultadoValidadorInterlocutor = {
  aprovado: boolean;
  exige_criador_verificado: boolean;
  detectados: MarcadorIntimidadeDetectado[];
};

const MARCADORES_INTIMIDADE = [
  "meu ethan",
  "meu amor",
  "meu bem",
  "te amo",
  "amor da minha vida",
  "saudade de voce",
  "saudade de você",
];

function normalizar(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function validarInterlocutor(
  texto: string,
  contexto: ContextoInterlocutorValidacao = {},
): ResultadoValidadorInterlocutor {
  const normalized = normalizar(texto);
  const detectados: MarcadorIntimidadeDetectado[] = [];

  for (const marcador of MARCADORES_INTIMIDADE) {
    if (normalized.includes(normalizar(marcador))) {
      detectados.push({ marcador });
    }
  }

  const exigeCriador = detectados.length > 0;
  const aprovado = !exigeCriador || contexto.criador_verificado === true;

  return {
    aprovado,
    exige_criador_verificado: exigeCriador,
    detectados,
  };
}
