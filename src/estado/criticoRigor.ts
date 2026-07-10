import type { ProvedorLlm } from "../providers/tipos.js";

/**
 * P1 camada 3 — v2: crítico de rigor (autocrítica DEDICADA).
 *
 * A v1 (temperatura baixa + protocolo de rigor no briefing) não bastou: no
 * baseline do agrônomo a Luna puxava o "mofo branco" só ~1/4 das vezes, mesmo
 * com rigor. Esta v2 roda um 2º LLM (o modelo MENOR/flash) depois do rascunho,
 * só em turno técnico. Ele checa se a resposta considerou as implicações dos
 * fatos concretos que a pessoa deu, e devolve lacunas para uma revisão.
 *
 * Barato de propósito: usa o flash + temperatura 0 + JSON. Se ele não pegar o
 * furo na medição, escala-se para o modelo maior (decisão do Ethan).
 */

export type InputCriticoRigor = {
  mensagemUsuario: string;
  respostaRascunho: string;
};

export type ResultadoCriticoRigor = {
  /** true = a resposta está sólida, sem furos óbvios. */
  solido: boolean;
  /** Lacunas concretas que a revisão deve incorporar (vazio se sólido). */
  lacunas: string[];
};

type OpcoesCriticoRigor = {
  provedor: ProvedorLlm;
  modelo: string;
};

/** Kill-switch: `LUNA_CRITICO=0` desliga a passada de crítica dedicada. */
export function criticoRigorAtivo(): boolean {
  const raw = process.env.LUNA_CRITICO?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

const SYSTEM_CRITICO = `Você é um revisor rigoroso e especialista da área do assunto tratado.
Sua função é achar FUROS numa resposta que outra IA escreveu — não reescrevê-la.

O foco é UM tipo de furo: a pessoa deu fatos concretos (local, cultura, época,
clima, restrição, ferramenta, número, sintoma) e a resposta IGNOROU implicações
importantes desses fatos. Ex.: um local implica clima, e clima implica doenças/
riscos específicos que um especialista daquela região citaria sem ser pedido.

Puxe os fios você mesmo: para cada fato concreto que a pessoa deu, pergunte-se o
que ele EXIGE considerar e a resposta NÃO nomeou. Também marque recomendações com
furo óbvio que um especialista apontaria.

Responda SOMENTE com JSON válido:
{
  "solido": boolean,
  "lacunas": ["lacuna concreta e acionável — omita o campo se não houver"]
}

- solido = true: a resposta cobriu as implicações relevantes dos fatos dados.
- solido = false: faltou considerar implicação concreta OU há furo óbvio.
- lacunas: específicas o suficiente para a revisão incorporar (ex.: "não citou
  mofo branco / Sclerotinia, que o clima úmido daquele local favorece").
- Seja exigente, mas NÃO invente fato que a pessoa não deu. Se estiver sólida,
  devolva {"solido": true}.

Não adicione texto fora do JSON.`;

function montarMensagemCritico(input: InputCriticoRigor): string {
  return [
    "## Mensagem da pessoa (fatos concretos que ela deu)",
    input.mensagemUsuario,
    "",
    "## Resposta que a IA escreveu (rascunho a revisar)",
    input.respostaRascunho,
    "",
    "## Ache os furos de implicação. Devolva o JSON.",
  ].join("\n");
}

function validarResultado(obj: unknown): obj is { solido: boolean; lacunas?: unknown } {
  if (!obj || typeof obj !== "object") return false;
  return typeof (obj as Record<string, unknown>)["solido"] === "boolean";
}

function extrairLacunas(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Roda o crítico. Em qualquer falha (parse, rede), devolve `solido: true` para
 * NÃO bloquear a resposta — a crítica é um bônus, não um portão.
 */
export async function criticarRigor(
  input: InputCriticoRigor,
  opcoes: OpcoesCriticoRigor,
): Promise<ResultadoCriticoRigor> {
  try {
    const resposta = await opcoes.provedor.completar({
      modelo: opcoes.modelo,
      mensagens: [
        { papel: "system", conteudo: SYSTEM_CRITICO },
        { papel: "user", conteudo: montarMensagemCritico(input) },
      ],
      temperatura: 0,
      json: true,
      raciocinioAtivo: false,
    });

    const raw = resposta.conteudo.trim();
    const inicio = raw.indexOf("{");
    const fim = raw.lastIndexOf("}");
    if (inicio === -1 || fim === -1) return { solido: true, lacunas: [] };

    const parsed: unknown = JSON.parse(raw.slice(inicio, fim + 1));
    if (!validarResultado(parsed)) return { solido: true, lacunas: [] };

    const lacunas = extrairLacunas((parsed as Record<string, unknown>)["lacunas"]);
    return { solido: parsed.solido || lacunas.length === 0, lacunas };
  } catch {
    return { solido: true, lacunas: [] };
  }
}

/**
 * Bloco injetado no briefing na passada de REVISÃO, quando o crítico achou
 * lacunas. Não expõe que houve um crítico — a Luna só "pensa melhor" e responde.
 */
export function blocoRevisaoRigor(lacunas: string[]): string {
  return [
    "── Revisão de rigor (antes de responder, incorpore isto) ──",
    "Uma checagem apontou implicações dos fatos da pessoa que a primeira versão",
    "deixou passar. Trate cada ponto abaixo com naturalidade, como se você já",
    "tivesse pensado nisso — sem anunciar que houve revisão:",
    ...lacunas.map((l) => `• ${l}`),
  ].join("\n");
}
