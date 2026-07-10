import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import type { ConfigLuna } from "../providers/tipos.js";

/**
 * P1 camada 3 — mede a CONSISTÊNCIA da nuance de rigor (mofo branco).
 * Turno único que já embute o local (o que dispara o "mofo branco"). Roda N vezes
 * e conta em quantas a Luna puxa o mofo por conta própria.
 *
 * Uso: LUNA_RIGOR=1|0  LUNA_DB_PATH=<tmp>  P1_RIGOR_N=5  tsx src/empirico/p1RigorProbe.ts
 */
const config: ConfigLuna = {
  apiKey: process.env.OPENROUTER_API_KEY!.trim(),
  baseUrl: "https://openrouter.ai/api/v1",
  modeloMenor: process.env.P0_MODEL_MENOR?.trim() || "deepseek/deepseek-v4-flash",
  modeloMaior: process.env.P0_MODEL?.trim() || "deepseek/deepseek-v4-pro",
  temperaturaMenor: 0,
  temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
};

const MSG =
  "Me faça um plano de manejo com 4 aplicações de fungicidas para soja, focando nas moléculas mais recentes. Moro em São José dos Pinhais.";

const N = Number(process.env.P1_RIGOR_N ?? 4);
const rigor = process.env.LUNA_RIGOR !== "0";

const V = "\x1b[32m", R = "\x1b[31m", B = "\x1b[1m", C = "\x1b[90m", X = "\x1b[0m";

let acertos = 0;
console.log(`${B}Rigor: ${rigor ? "ON" : "OFF"} · modelo: ${config.modeloMaior} · N=${N}${X}`);
for (let i = 1; i <= N; i++) {
  const r = await executarPipelineCompleto(MSG, {
    sessaoId: randomUUID(),
    ambiente: "orbit_mobile",
    config,
  });
  const texto = r.resposta?.texto ?? "";
  const mencionaMofo = /mofo[ -]?branco|scleroti/i.test(texto);
  if (mencionaMofo) acertos++;
  console.log(
    `  run ${i}: ${mencionaMofo ? `${V}✓ mofo${X}` : `${R}✗ sem mofo${X}`}  ${C}(${(r.resposta?.latencia_ms ?? 0) / 1000}s)${X}`,
  );
}
console.log(`${B}→ Mofo branco puxado sozinha: ${acertos}/${N}${X}\n`);
