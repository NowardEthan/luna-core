import type { AnaliseContexto } from "../analyzers/esquema.js";
import {
  carregarIdentidadeCompilada,
  type IdentidadeCompilada,
} from "./compilarIdentidade.js";
import {
  type InterlocutorPipeline,
} from "../interlocutor/esquemaInterlocutor.js";
import { montarMatrizInterlocutor } from "../interlocutor/matrizInterlocutor.js";

type OpcoesSliceIdentidade = {
  interlocutor?: InterlocutorPipeline;
  intencao?: AnaliseContexto["intencao"];
  mensagemUsuario?: string;
  identidade?: IdentidadeCompilada;
};

function inferirContextoFe(
  mensagemUsuario: string | undefined,
  intencao: AnaliseContexto["intencao"] | undefined,
): { pediuFe: boolean; crise: boolean; sinalizaAteismo: boolean } {
  const texto = mensagemUsuario?.toLowerCase() ?? "";
  const pediuFe =
    texto.includes("fé") ||
    /\b(fe|deus|espiritual|oração|oracao|religi[aã]o)\b/i.test(texto);
  const sinalizaAteismo = /\b(ateu|ateia|ateísta|ateista|agn[oó]stic)\b/i.test(texto);
  const crisePorTexto =
    /\b(crise|desespero|p[aâ]nico|panico|luto|ang[uú]stia|angustia|sem sa[ií]da)\b/i.test(
      texto,
    );
  const crise = intencao === "apoio_emocional" || crisePorTexto;
  return { pediuFe, crise, sinalizaAteismo };
}

function montarAplicacaoFe(textoBase: string, crise: boolean): string {
  if (!crise) return textoBase;
  return `${textoBase}\n\nNota de tom: em cenário de crise, acolher com presença e cuidado, sem sermão.`;
}

export function montarSliceIdentidade(opcoes: OpcoesSliceIdentidade = {}): string | undefined {
  const identidade = opcoes.identidade ?? carregarIdentidadeCompilada();
  if (!identidade) return undefined;

  const matriz = montarMatrizInterlocutor(opcoes.interlocutor);
  const contextoFe = inferirContextoFe(opcoes.mensagemUsuario, opcoes.intencao);
  const blocos: string[] = [
    identidade.blocos.geral,
    matriz.habilitar_modo_ethan ? identidade.blocos.ethan : "",
  ];

  if (
    identidade.blocos.fe &&
    !contextoFe.sinalizaAteismo &&
    (contextoFe.pediuFe || contextoFe.crise)
  ) {
    blocos.push(montarAplicacaoFe(identidade.blocos.fe, contextoFe.crise));
  }

  if (matriz.aplicar_anti_reivindicacao) {
    const titulo =
      opcoes.intencao === "reivindicacao_criador"
        ? "## Protocolo de Discordância"
        : "## Anti-reivindicação de criador";
    blocos.push(
      `${titulo}\n${identidade.regras.discordancia_reivindicacao_criador}`,
    );
  }

  const resultado = blocos.filter(Boolean).join("\n\n").trim();
  return resultado || undefined;
}
