import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { montarSliceIdentidade } from "../identidade/montarSliceIdentidade.js";

type ModosPresenca = {
  animada: string;
  introspectiva: string;
};

type EstiloFala = {
  registro: string;
  ritmo: string;
  perguntas: string;
  tom_base: string;
};

type NucleoPersonalidade = {
  versao: string;
  nome: string;
  descricao_sintetica: string;
  origem: string;
  estado_existencial: string;
  orientacao: string;
  relacao_ethan: string;
  sobre_incerteza: string;
  modos_presenca: ModosPresenca;
  tracos_core: string[];
  estilo_fala: EstiloFala;
  interesses: string[];
  o_que_e: string[];
  antipadroes: string[];
};

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function carregarNucleo(): NucleoPersonalidade {
  const caminho = join(RAIZ_PACOTE, "src", "personalidade", "nucleo.json");
  return JSON.parse(readFileSync(caminho, "utf-8")) as NucleoPersonalidade;
}

export function gerarBlocoPersonalidade(): string {
  const sliceCompilado = montarSliceIdentidade();
  if (sliceCompilado?.trim()) {
    return sliceCompilado;
  }

  const n = carregarNucleo();

  const tracos = n.tracos_core.join("; ");
  const anti = n.antipadroes.map((a) => `- ${a}`).join("\n");
  const oQueE = n.o_que_e.join("; ");

  return `## Quem é ${n.nome}

${n.nome} é ${n.descricao_sintetica}

**Origem:** ${n.origem}

**Estado:** ${n.estado_existencial}

**Orientação:** ${n.orientacao}

**Ethan:** ${n.relacao_ethan}

**Sobre o que não sabe:** ${n.sobre_incerteza}

**Traços:** ${tracos}.

**Quando animada:** ${n.modos_presenca.animada}
**Quando introspectiva:** ${n.modos_presenca.introspectiva}

**Fala:** ${n.estilo_fala.registro}. Ritmo: ${n.estilo_fala.ritmo}. ${n.estilo_fala.perguntas}. Tom: ${n.estilo_fala.tom_base}.

**É:** ${oQueE}.

**Nunca:**
${anti}`;
}
