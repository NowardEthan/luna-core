import { z } from "zod";
import type { ConfigLuna, ProvedorLlm } from "../providers/tipos.js";

/**
 * Cruzar fontes — o segundo par de olhos do modo pesquisa profunda.
 *
 * Depois de buscar/ler, a Luna pode chamar `verificar_fontes` com as afirmações que
 * pretende dizer. Aqui, um modelo BARATO (o menor) julga cada afirmação SÓ pelo dossiê
 * que ela leu neste turno — sem usar conhecimento próprio. É o que dá honestidade real ao
 * passo: não é um selo decorativo, é uma revisão cética que aponta o que a fonte não
 * sustenta, para ela escrever com ressalva (ou remover) em vez de afirmar com confiança.
 *
 * Só existe no modo opcional — fora dele, nem se registra a ferramenta, e a latência do
 * chat comum fica intacta.
 */

export type FonteDossie = {
  url?: string;
  title?: string;
  /** Trecho lido (snippet do web_search / excerpt do ler_url), já cortado. */
  trecho: string;
};

const VeredictoSchema = z.object({
  afirmacao: z.string(),
  veredicto: z.enum(["sustentada", "parcial", "nao_encontrada", "contradiz"]),
  nota: z.string(),
  fonte: z.string().optional(),
});

const ResultadoVerificacaoSchema = z.object({
  veredictos: z.array(VeredictoSchema),
});

export type VeredictoAfirmacao = z.infer<typeof VeredictoSchema>;

const PROMPT_VERIFICAR = `Você é o verificador de fontes da Luna — um segundo par de olhos, cético e honesto.
Recebe uma lista de AFIRMAÇÕES que ela pretende dizer e o DOSSIÊ das fontes que ela leu neste turno.

Julgue cada afirmação SÓ pelo que está no dossiê (NÃO use conhecimento próprio, NÃO invente):
- "sustentada": o dossiê apoia claramente.
- "parcial": apoia em parte, ou só com ressalva.
- "nao_encontrada": o dossiê não fala disso.
- "contradiz": o dossiê diz o contrário.

Seja rigoroso: na dúvida entre "sustentada" e "parcial", escolha "parcial". Aponte a fonte
(url ou título) quando houver. A nota é curta (uma frase), em pt-BR.

Responda APENAS JSON:
{ "veredictos": [ { "afirmacao": "...", "veredicto": "sustentada|parcial|nao_encontrada|contradiz", "nota": "curta", "fonte": "url ou título" } ] }`;

function extrairJson(texto: string): unknown {
  const bloco = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const bruto = bloco ? bloco[1]!.trim() : texto.trim();
  try {
    return JSON.parse(bruto) as unknown;
  } catch {
    return { veredictos: [] };
  }
}

function montarDossie(dossie: FonteDossie[]): string {
  return dossie
    .map((f, i) => {
      const cabec = [f.title, f.url].filter(Boolean).join(" — ") || `fonte ${i + 1}`;
      return `[${i + 1}] ${cabec}\n${f.trecho}`;
    })
    .join("\n\n");
}

/**
 * Cruza as afirmações contra o dossiê. Devolve os veredictos estruturados. Em qualquer
 * falha (parse/modelo), devolve lista vazia — o loop segue e ela escreve como escreveria
 * sem o passo; o modo nunca deve DERRUBAR a resposta, só enriquecê-la.
 */
export async function verificarFontes(
  provedor: ProvedorLlm,
  config: ConfigLuna,
  afirmacoes: string[],
  dossie: FonteDossie[],
  foco?: string,
): Promise<VeredictoAfirmacao[]> {
  if (afirmacoes.length === 0 || dossie.length === 0) return [];

  const partes = [
    PROMPT_VERIFICAR,
    foco ? `## Pergunta em foco\n${foco}` : "",
    `## Afirmações a verificar\n${afirmacoes.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
    `## Dossiê das fontes lidas neste turno\n${montarDossie(dossie)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const resposta = await provedor.completar({
      modelo: config.modeloMenor,
      temperatura: 0,
      json: true,
      mensagens: [{ papel: "system", conteudo: partes }],
    });
    const json = ResultadoVerificacaoSchema.parse(extrairJson(resposta.conteudo));
    return json.veredictos;
  } catch {
    return [];
  }
}

const ROTULO_VEREDICTO: Record<VeredictoAfirmacao["veredicto"], string> = {
  sustentada: "✓ sustentada",
  parcial: "~ parcial",
  nao_encontrada: "? não encontrada nas fontes",
  contradiz: "✗ contradiz as fontes",
};

/**
 * Formata os veredictos como a tool message que volta pro modelo — a instrução do que
 * fazer com cada um está embutida, para ela escrever a resposta final já reconciliada.
 */
export function formatarVerificacao(veredictos: VeredictoAfirmacao[]): string {
  if (veredictos.length === 0) {
    return "Nenhuma fonte para cruzar ainda (pesquise/leia antes) ou nada a verificar. Segue com honestidade: não afirmes números, datas ou versões que não estejam nas fontes lidas.";
  }
  const linhas = veredictos.map((v) => {
    const fonte = v.fonte ? ` [${v.fonte}]` : "";
    return `- "${v.afirmacao}" → ${ROTULO_VEREDICTO[v.veredicto]}: ${v.nota}${fonte}`;
  });
  return [
    "Cruzei as tuas afirmações com o dossiê das fontes lidas:",
    ...linhas,
    "",
    "Ao escrever a resposta final: mantém só o que ficou «sustentada»; para «parcial» diz com ressalva; " +
      "«não encontrada» e «contradiz» — corrige ou tira, e NÃO apresentes como facto verificado.",
  ].join("\n");
}
