import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { carregarConfig, type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * P1 — Teste da tese "a arquitetura sustenta a personalidade".
 * Mesma mensagem casual, MESMO pipeline (prompt de identidade, contexto, temperatura),
 * só troca o modelo da resposta: flash vs v4-pro. Se a alma vem do sistema e não da
 * potência do modelo, o flash segura o calor da Luna — e o casual pode ir pro flash (rápido).
 */

const B = "\x1b[1m", C = "\x1b[90m", A = "\x1b[33m", V = "\x1b[32m", M = "\x1b[35m", X = "\x1b[0m";

function configCom(modelo: string): ConfigLuna | null {
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (orKey) {
    return {
      apiKey: orKey,
      baseUrl: "https://openrouter.ai/api/v1",
      modeloMenor: process.env.P0_MODEL_MENOR?.trim() || "deepseek/deepseek-v4-flash",
      modeloMaior: modelo,
      temperaturaMenor: 0,
      temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
    };
  }
  const base = carregarConfig();
  return base ? { ...base, modeloMaior: modelo } : null;
}

async function responder(mensagem: string, modelo: string): Promise<{ texto: string; ms: number }> {
  const config = configCom(modelo);
  if (!config) throw new Error("Sem config");
  const t0 = Date.now();
  const r = await executarPipelineCompleto(mensagem, {
    sessaoId: randomUUID(),
    ambiente: "orbit_mobile",
    config,
  });
  return { texto: r.resposta?.texto ?? "(sem resposta)", ms: Date.now() - t0 };
}

const FLASH = "deepseek/deepseek-v4-flash";
const PRO = "deepseek/deepseek-v4-pro";

const MENSAGENS = [
  "oi Luna! tudo bem? como foi teu dia hoje? kkk",
  "tô meio pra baixo hoje, sei lá, foi um dia estranho e eu não sei bem o porquê",
];

async function main(): Promise<void> {
  console.log(`${B}╔═══ P1 · Flash vs Pro — a arquitetura sustenta a personalidade? ═══╗${X}`);

  for (const msg of MENSAGENS) {
    console.log(`\n${B}${"═".repeat(64)}${X}`);
    console.log(`${A}Usuário:${X} ${msg}\n`);

    const flash = await responder(msg, FLASH);
    console.log(`${M}${B}▶ FLASH${X} ${C}(${(flash.ms / 1000).toFixed(1)}s)${X}`);
    console.log(flash.texto);

    const pro = await responder(msg, PRO);
    console.log(`\n${V}${B}▶ V4-PRO${X} ${C}(${(pro.ms / 1000).toFixed(1)}s)${X}`);
    console.log(pro.texto);
  }
  console.log();
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
