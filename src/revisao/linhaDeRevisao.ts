import type { ConfigLuna } from "../providers/tipos.js";
import { detectar, precisaReescritor, type Achado, type EntradaDeteccao } from "./detectores.js";
import { reescrever, linhaRevisaoAtiva } from "./reescritor.js";

/**
 * A linha de revisão — a Luna responde livre, e depois passa aqui.
 *
 *   Luna responde LIVRE (sem mordaça, sem teto cego)
 *          │
 *   DETETORES ─── determinísticos, ~0 ms, sem LLM
 *          │       passou do alvo? ecoou? recapitulou? encenou? inventou link?
 *          │
 *          ├── nada disparou ────────────► passa intacta. CUSTO ZERO.
 *          │
 *   CONSERTOS MECÂNICOS ─── sem LLM, quando o conserto é óbvio
 *          │       «*abro o whitepaper*» sem ferramenta → apaga. É um `delete`.
 *          │
 *   UM REESCRITOR ─── uma passada, com todos os achados na mesa. CORTA, não reescreve.
 *
 * O caso normal — um «bom dia», um «kkk pois é» — não dispara nada e não custa nada. O
 * modelo só entra quando há mesmo o que cortar.
 */

export type ResultadoLinha = {
  texto: string;
  achados: Achado[];
  /** O reescritor chegou a correr? */
  revisado: boolean;
};

export type EntradaLinha = EntradaDeteccao & { config: ConfigLuna };

export async function passarPelaLinha(e: EntradaLinha): Promise<ResultadoLinha> {
  if (!linhaRevisaoAtiva()) {
    return { texto: e.resposta, achados: [], revisado: false };
  }

  const { texto, achados } = detectar(e);

  if (!achados.length) {
    return { texto, achados, revisado: false }; // o caso normal
  }

  if (process.env.LUNA_DEBUG_REGISTRO === "1") {
    console.error(
      `[revisao] ${achados.map((a) => a.tipo + (a.resolvido ? "(mecânico)" : "")).join(", ")}`,
    );
  }

  if (!precisaReescritor(achados)) {
    // Tudo resolvido à mão. Nenhuma chamada de modelo.
    return { texto, achados, revisado: false };
  }

  const r = await reescrever(texto, achados, e.alvoPalavras, e.config);
  return { texto: r.texto, achados, revisado: r.reescrito };
}
