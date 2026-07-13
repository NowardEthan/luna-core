import { describe, expect, it } from "vitest";
import type { AnexoImagemChat } from "./visaoGemma.js";

/**
 * A regra que a Luna usa quando o Ethan manda uma foto e não diz qual olhar.
 *
 * O bug: a lista de anexos é montada como `[...anexosDoTurno, ...anexosDeTurnosAnteriores]`
 * — os antigos ficam NO FIM. E o executor pegava `anexos[length - 1]`, ou seja, **a foto
 * MAIS ANTIGA**. O Ethan mandava a foto do trabalho e ela comentava, com toda a confiança,
 * uma foto de horas antes. Um erro de índice a fingir ser um erro de percepção.
 */
function imagemMaisRecente(anexos: AnexoImagemChat[]): AnexoImagemChat | undefined {
  const doTurno = anexos.filter((img) => !img.deTurnoAnterior);
  const lista = doTurno.length > 0 ? doTurno : anexos;
  return lista[lista.length - 1];
}

const foto = (id: string, deTurnoAnterior = false): AnexoImagemChat => ({
  id,
  url: `https://storage/${id}.jpg`,
  mimeType: "image/jpeg",
  deTurnoAnterior,
});

describe("qual foto ela olha quando não diz qual", () => {
  it("olha a foto DESTE turno, não a antiga que veio depois na lista", () => {
    const anexos = [
      foto("foto-do-trabalho"), // a que ele acabou de mandar
      foto("print-de-ontem", true), // histórico — entra depois na lista
      foto("caneca-de-manha", true),
    ];

    expect(imagemMaisRecente(anexos)?.id).toBe("foto-do-trabalho");
  });

  it("com várias fotos no turno, olha a última que ele mandou", () => {
    const anexos = [foto("pagina-1"), foto("pagina-2"), foto("pagina-3"), foto("antiga", true)];
    expect(imagemMaisRecente(anexos)?.id).toBe("pagina-3");
  });

  it("sem foto neste turno («volta naquela foto»), aí sim usa o histórico", () => {
    const anexos = [foto("antiga-1", true), foto("antiga-2", true)];
    expect(imagemMaisRecente(anexos)?.id).toBe("antiga-2");
  });

  it("sem anexo nenhum, não inventa", () => {
    expect(imagemMaisRecente([])).toBeUndefined();
  });
});
