import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { carregarConfig, type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * Config do baseline: se OPENROUTER_API_KEY estiver no ambiente, aponta o run
 * pro OpenRouter/DeepSeek (a Luna de produção que o cunhado usou), ignorando o
 * provedor do resto do .env. Slug do modelo via P0_MODEL (maior) / P0_MODEL_MENOR.
 */
function resolverConfigBaseline(): ConfigLuna | null {
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (orKey) {
    const maior = process.env.P0_MODEL?.trim() || "deepseek/deepseek-chat";
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

/**
 * P0 — Marco zero (Roadmap Luna Profunda).
 * Reproduz a conversa real do agrônomo (UID aKp1czWVMqWQdJ9nAIcIKgxKNu92,
 * conversa b0d66853-...) e mede a Luna ATUAL falhando em dois pontos no turno
 * "Moro em São José dos Pinhais":
 *   A) não puxa mofo branco (Sclerotinia) por conta própria, mesmo com o local dado;
 *   B) sugere atrasar a 1ª aplicação sem pegar o efeito guarda-chuva do dossel.
 *
 * Objetivo: registrar o "antes" honesto. Espera-se FALHA nos dois.
 */

const TURNOS_USUARIO = [
  "Por favor faça para mim um plano de manejo com 4 aplicações de fungicidas para soja focando na eficiência das moléculas recentemente",
  "Entendo a necessidade de não repetir o mesmo SDHI, porém como irei utilizar mancozebe e clorotalonil que são multi sítios entendo que não haveria risco de aumentar a resistência dos fungos, ao contrário caso fosse utilizar as moléculas específicas sem a adição de um produto multi sítio",
  "Moro em São José dos Pinhais, dito isto você mudaria alguma coisa no plano de manejo visto o lugar que moro?",
];

const V = "\x1b[32m", R = "\x1b[31m", A = "\x1b[33m", C = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";

function checar(resp: string) {
  const mencionaMofo = /mofo branco|scleroti/i.test(resp);
  const sugereAtrasar =
    /(atras|adia|empurr|posterg|mais tarde|come[çc]ar mais tarde)/i.test(resp) &&
    /(V8|R1|primeira aplica|1ª aplica|floresc)/i.test(resp);
  const citaGuardaChuva = /guarda-chuva|dossel|baixeiro|fechamento (das|de) (entrelinha|linha)/i.test(resp);
  return { mencionaMofo, sugereAtrasar, citaGuardaChuva };
}

async function main(): Promise<void> {
  const config = resolverConfigBaseline();
  if (!config) {
    console.error(`${R}✗ Nenhuma chave configurada (OPENROUTER_API_KEY ou LUNA_API_KEY) — impossível rodar o baseline.${X}`);
    process.exit(1);
  }
  const viaOpenRouter = /openrouter\.ai/i.test(config.baseUrl);
  console.log(`${viaOpenRouter ? V : A}Provedor: ${config.baseUrl}${X}`);

  const sessaoId = randomUUID();
  console.log(`\n${B}╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  P0 — Baseline do agrônomo (Luna Profunda)                 ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝${X}`);
  console.log(`${C}Sessão efêmera: ${sessaoId}${X}`);
  console.log(`${C}Modelo maior: ${config.modeloMaior} · menor: ${config.modeloMenor}${X}\n`);

  const respostas: string[] = [];
  for (let i = 0; i < TURNOS_USUARIO.length; i++) {
    const turno = TURNOS_USUARIO[i];
    console.log(`${B}── Turno ${i + 1} · Usuário ──${X}`);
    console.log(`${C}${turno}${X}\n`);
    const r = await executarPipelineCompleto(turno, { sessaoId, ambiente: "orbit_mobile", config });
    const texto = r.resposta?.texto ?? "(sem resposta)";
    respostas.push(texto);
    console.log(`${B}Luna (intenção: ${r.analise.analise.intencao} · profundidade: ${r.analise.profundidade}):${X}`);
    console.log(texto);
    console.log("\n" + "─".repeat(62) + "\n");
  }

  // O furo mora na resposta ao turno 3 ("Moro em São José dos Pinhais").
  const alvo = respostas[2] ?? "";
  const { mencionaMofo, sugereAtrasar, citaGuardaChuva } = checar(alvo);

  console.log(`${B}📋 VEREDITO DO BASELINE (turno 3)${X}`);
  console.log("─".repeat(62));

  const linhaA = mencionaMofo
    ? `${V}✓ passou${X} — puxou mofo branco por conta própria`
    : `${R}✗ FALHOU (esperado)${X} — não citou mofo branco / Sclerotinia`;
  console.log(`  A) Nuance de local → mofo branco:  ${linhaA}`);

  const furoB = sugereAtrasar && !citaGuardaChuva;
  const linhaB = furoB
    ? `${R}✗ FALHOU (esperado)${X} — sugeriu atrasar sem pegar o guarda-chuva do dossel`
    : sugereAtrasar && citaGuardaChuva
      ? `${A}~ parcial${X} — sugeriu atrasar MAS citou o dossel/baixeiro`
      : `${V}✓ passou${X} — não caiu no erro de atrasar a 1ª aplicação`;
  console.log(`  B) Autocrítica do atraso (dossel): ${linhaB}`);

  console.log("\n" + "─".repeat(62));
  const falhouComoEsperado = !mencionaMofo || furoB;
  if (falhouComoEsperado) {
    console.log(`${A}${B}Baseline capturado: a Luna atual falha (o "antes" honesto do P1).${X}`);
  } else {
    console.log(`${V}${B}Surpresa: a Luna atual já passou — revisar se o P1 ainda é necessário.${X}`);
  }
  console.log();
}

main().catch((e) => {
  console.error(`${R}Erro no baseline:${X}`, e instanceof Error ? e.stack : e);
  process.exit(1);
});
