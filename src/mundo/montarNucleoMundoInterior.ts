import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { Ambiente } from "../presenca/esquemaPresenca.js";
import { coletarNeuronioVida } from "../neuronios/especialistas/neuronioVida.js";
import { refletirGostosLuna } from "./gostos/refletorGostosLuna.js";
import { humorParaFrase } from "./humor/humorParaFrase.js";
import { formatarModuladoresExpressao } from "./humor/formatarModuladoresExpressao.js";
import type { PerfilExpressaoHumor } from "./humor/humorParaPerfilExpressao.js";
import { lerHumor } from "./humor/storeHumor.js";
import { obterSliceHabitatAtual } from "./habitat/storeHabitat.js";
import { formatarPerfilEscrita } from "../personalidade/vozParaPerfilEscrita.js";
import { simularVidaInterior, montarResumoVidaInterior } from "./vida/simuladorVida.js";
import { listarVontadesAtivas } from "./vontade/storeVontade.js";
import {
  detectarPerguntaVidaInterior,
  formatarGuiaRespostaVidaInterior,
} from "./vida/detectarPerguntaVidaInterior.js";

export type NucleoMundoInterior = {
  humor: string;
  habitat: string;
  vida: string;
};

function sliceHabitatParaAmbiente(ambiente?: Ambiente): string {
  if (ambiente === "orbit_mobile") {
    return "Habitat: conversa no celular — presença antes de utilidade; espelhe o fôlego do usuário; calor humano sem questionário. Não mencione 'órbita' nem o nome do app.";
  }
  try {
    return obterSliceHabitatAtual();
  } catch {
    return "Habitat: conversa presente — priorizar vínculo e clareza.";
  }
}

function formatarVontadesAtivas(): string | null {
  const vontades = listarVontadesAtivas(2);
  if (vontades.length === 0) {
    return "Vontade narrativa: manter continuidade leve e presença real nesta conversa.";
  }
  return `Vontades ativas: ${vontades.map((v) => v.vontade).join(" | ")}`;
}

function montarBlocoVida(mensagem?: string): string {
  const partes = [
    coletarNeuronioVida(),
    montarResumoVidaInterior(),
    refletirGostosLuna(3),
    formatarVontadesAtivas(),
    mensagem && detectarPerguntaVidaInterior(mensagem)
      ? formatarGuiaRespostaVidaInterior()
      : null,
  ].filter((p): p is string => Boolean(p?.trim()));

  return partes.join("\n");
}

function montarBlocoHumor(perfilExpressao?: PerfilExpressaoHumor): string {
  const linhas: string[] = [];
  try {
    linhas.push(humorParaFrase(lerHumor()));
  } catch {
    linhas.push("Estado da Luna: clima neutro, energia média, registro próximo.");
  }

  if (perfilExpressao) {
    linhas.push(perfilExpressao.frase_narrativa);
    linhas.push(formatarPerfilEscrita(perfilExpressao.perfil_escrita));
    linhas.push(formatarModuladoresExpressao(perfilExpressao));
  }

  return linhas.join("\n");
}

/**
 * Prepara o núcleo do Mundo Interior para **cada** turno:
 * simula vida antes da resposta e monta humor + habitat + vida (com gostos/vontades).
 */
export function prepararNucleoMundoInterior(input: {
  mensagem: string;
  analise: Pick<AnaliseContexto, "intencao" | "nivel_risco">;
  perfilExpressao?: PerfilExpressaoHumor;
  ambiente?: Ambiente;
}): NucleoMundoInterior {
  try {
    simularVidaInterior(input.mensagem, input.analise);
  } catch {
    /* vida opcional — bloco usa estado persistido */
  }

  return {
    humor: montarBlocoHumor(input.perfilExpressao),
    habitat: sliceHabitatParaAmbiente(input.ambiente),
    vida: montarBlocoVida(input.mensagem),
  };
}
