export type ResultadoValidadorFormaMd = {
  aprovado: boolean;
  falhas: string[];
};

export function validarFormaMd(texto: string): ResultadoValidadorFormaMd {
  const falhas: string[] = [];
  const linhas = texto.split(/\r?\n/);

  let quantidadeTitulos = 0;
  for (const linha of linhas) {
    if (/^#{1,6}\s+/.test(linha)) {
      quantidadeTitulos += 1;
      if (/^#{4,6}\s+/.test(linha)) {
        falhas.push("heading_profundo: evite heading nível 4+");
      }
    }
    if (/^\s{2,}[-*]\s+/.test(linha)) {
      falhas.push("lista_aninhada_profunda: prefira lista simples");
    }
  }

  if (quantidadeTitulos > 2) {
    falhas.push("excesso_heading: usar no máximo 2 títulos curtos");
  }

  const blocosCodigo = texto.match(/```/g)?.length ?? 0;
  if (blocosCodigo % 2 !== 0) {
    falhas.push("bloco_codigo_incompleto: fence markdown não fechada");
  }

  const bulletLines = linhas.filter((linha) => /^-\s+/.test(linha)).length;
  if (bulletLines > 10) {
    falhas.push("excesso_bullets: simplificar estrutura");
  }

  return {
    aprovado: falhas.length === 0,
    falhas,
  };
}
