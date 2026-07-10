import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { carregarConfig, type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * P1 — Sonda de latência (Roadmap Luna Profunda).
 * Mede onde os segundos vão embora num turno casual vs um técnico:
 * quanto é "pensar antes de pensar" (análise + intenção + memória + neurônios)
 * e quanto é o v4-pro escrevendo. Objetivo: confirmar com número que o
 * pipeline paga o pedágio profundo em TODA mensagem, e achar o que gatear por modo.
 */

function resolverConfig(): ConfigLuna | null {
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (orKey) {
    const maior = process.env.P0_MODEL?.trim() || "deepseek/deepseek-v4-pro";
    return {
      apiKey: orKey,
      baseUrl: "https://openrouter.ai/api/v1",
      modeloMenor: process.env.P0_MODEL_MENOR?.trim() || maior,
      modeloMaior: maior,
      temperaturaMenor: 0,
      temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
    };
  }
  return carregarConfig();
}

const V = "\x1b[32m", A = "\x1b[33m", C = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";

function s(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

async function medir(rotulo: string, mensagem: string, config: ConfigLuna) {
  const sessaoId = randomUUID();
  const t0 = Date.now();
  const r = await executarPipelineCompleto(mensagem, { sessaoId, ambiente: "orbit_mobile", config });
  const totalWall = Date.now() - t0;
  const analise = r.analise.latencia_ms ?? 0;
  const resposta = r.resposta?.latencia_ms ?? 0;
  const outros = Math.max(0, totalWall - analise - resposta);

  console.log(`\n${B}── ${rotulo} ──${X}`);
  console.log(`${C}"${mensagem}"${X}`);
  console.log(`  intenção: ${r.analise.analise.intencao} · profundidade: ${r.analise.profundidade}`);
  console.log(`  ${B}total: ${s(totalWall)}${X}`);
  console.log(`    análise (menor):                 ${s(analise)}`);
  console.log(`    outros (intenção+memória+neur.): ${s(outros)}  ${C}← pré-pensamento sequencial${X}`);
  console.log(`    resposta [modelo REAL usado: ${r.resposta?.modelo ?? "?"}]: ${s(resposta)}`);
  const pedagioAntesDeEscrever = analise + outros;
  console.log(`  ${A}pedágio antes de escrever 1 palavra: ${s(pedagioAntesDeEscrever)}${X}`);
  return { totalWall, analise, resposta, outros, profundidade: r.analise.profundidade };
}

async function main(): Promise<void> {
  const config = resolverConfig();
  if (!config) {
    console.error("Sem config (OPENROUTER_API_KEY ou LUNA_API_KEY).");
    process.exit(1);
  }
  console.log(`${B}╔═══ P1 · Sonda de latência ═══╗${X}`);
  console.log(`${C}maior: ${config.modeloMaior} · menor: ${config.modeloMenor} · ${config.baseUrl}${X}`);

  const casual = await medir("CASUAL", "oi Luna! tudo bem? como foi teu dia hoje? kkk", config);
  const tecnico = await medir(
    "TÉCNICO",
    "me explica a diferença entre índice hash e índice B-tree num banco de dados, e quando usar cada um",
    config,
  );

  console.log(`\n${B}📋 LEITURA${X}`);
  console.log("─".repeat(58));
  console.log(`  Casual gastou ${s(casual.analise + casual.outros)} de pré-pensamento + ${s(casual.resposta)} no modelo grande.`);
  console.log(`  Técnico gastou ${s(tecnico.analise + tecnico.outros)} de pré-pensamento + ${s(tecnico.resposta)} no modelo grande.`);
  if (casual.resposta > 8000) {
    console.log(`  ${A}→ Confirmado: até o turno casual usa o modelo grande e lento. Modo casual deveria usar o flash.${X}`);
  }
  console.log();
}

main().catch((e) => {
  console.error("Erro na sonda:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
