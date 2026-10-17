import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { AnaliseContexto, PoliticaDecisao } from "../analyzers/esquema.js";
import type { PontuacaoDiretriz } from "../decision/motorDiretrizes.js";
import type { DecisaoMemoria } from "../memoria/esquemaMemoria.js";
import type { EstadoInterno } from "../estado/esquemaEstadoInterno.js";
import { DIRETORIOS_DADOS_PADRAO, obterDiretoriosDados } from "../config/diretoriosDados.js";

/** @deprecated Para operações, configure os diretórios pelo entry desktop. */
const PASTA_LOGS = DIRETORIOS_DADOS_PADRAO.logs;

export type RegistroInteracao = {
  id: string;
  timestamp: string;
  versao_core: string;
  mensagem_usuario: string;
  analise: AnaliseContexto;
  analise_fonte: "llm" | "regras";
  politica: PoliticaDecisao;
  pontuacoes: PontuacaoDiretriz[];
  resposta_luna?: string;
  modelo_menor?: string;
  modelo_maior?: string;
  latencia_analise_ms?: number;
  latencia_resposta_ms?: number;
  latencia_total_ms: number;
  sessao_id?: string;
  decisao_memoria?: DecisaoMemoria;
  estado_interno?: EstadoInterno;
  /** M3 — briefing da voz */
  tokens_briefing?: number;
  cortes_briefing?: string[];
  profundidade?: string;
  neuronios_ativos?: string[];
};

/** Registrador de decisões — log JSON auditável por interação (RNF03). */
export function registrarInteracao(registro: RegistroInteracao): string {
  const data = registro.timestamp.slice(0, 10);
  const pasta = join(obterDiretoriosDados().logs, data);
  mkdirSync(pasta, { recursive: true });

  const caminho = join(pasta, `${registro.id}.json`);
  writeFileSync(caminho, JSON.stringify(registro, null, 2), "utf-8");
  return caminho;
}

export function criarIdInteracao(): string {
  return randomUUID();
}

export { PASTA_LOGS };
