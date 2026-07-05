import { inferirAtlas, type ItemInferidoAtlas } from "./inferirAtlas.js";

export type ResultadoConsultaAtlas = {
  consulta: string;
  total_encontrado: number;
  itens: ItemInferidoAtlas[];
};

/**
 * Implementação determinística de consulta Atlas para uso como tool.
 */
export async function consultarAtlas(consulta: string, limite = 5): Promise<ResultadoConsultaAtlas> {
  const itens = await inferirAtlas(consulta, { limite });
  return {
    consulta,
    total_encontrado: itens.length,
    itens,
  };
}
