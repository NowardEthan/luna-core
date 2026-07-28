import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * Bench — Provedor direto (OpenRouter) vs PAIA (pipeline Luna Core).
 *
 * Mede wall-clock da mesma mensagem nos dois caminhos, pra quantificar o
 * pedágio do agentico em cima do provedor.
 *
 * Uso:
 *   npx tsx src/empirico/pLatenciaDiretoVsPaia.ts
 *   BENCH_MSG="oi luna" npx tsx src/empirico/pLatenciaDiretoVsPaia.ts
 */

const B = "\x1b[1m", C = "\x1b[90m", A = "\x1b[33m", V = "\x1b[32m", X = "\x1b[0m";

const MODELO =
  process.env.P0_MODEL_MENOR?.trim() ||
  process.env.BENCH_MODEL?.trim() ||
  "deepseek/deepseek-v4-flash";

const MSGS = [
  process.env.BENCH_MSG?.trim() || "oi Luna! tudo bem? como foi teu dia hoje? kkk",
  "me explica em 3 frases o que é um índice B-tree",
];

function s(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

function configOpenRouter(): ConfigLuna {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("Falta OPENROUTER_API_KEY no .env");
  return {
    apiKey: key,
    baseUrl: "https://openrouter.ai/api/v1",
    modeloMenor: MODELO,
    modeloMaior: process.env.P0_MODEL?.trim() || MODELO,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
  };
}

async function medirDireto(mensagem: string): Promise<{ ms: number; chars: number; modelo: string }> {
  const key = process.env.OPENROUTER_API_KEY!.trim();
  const t0 = Date.now();
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/luna-orbit",
      "X-Title": "Luna Bench DiretoVsPaia",
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        {
          role: "system",
          content:
            "Você é a Luna. Fala como uma pessoa num chat: solta, com humor, sem parecer comunicado.",
        },
        { role: "user", content: mensagem },
      ],
      temperature: 0.85,
    }),
  });
  const j = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(`OpenRouter HTTP ${r.status}: ${j.error?.message ?? JSON.stringify(j).slice(0, 200)}`);
  const texto = j.choices?.[0]?.message?.content ?? "";
  return { ms: Date.now() - t0, chars: texto.length, modelo: MODELO };
}

async function medirPaia(mensagem: string, config: ConfigLuna): Promise<{
  ms: number;
  chars: number;
  modelo: string;
  analiseMs: number;
  respostaMs: number;
}> {
  const t0 = Date.now();
  const r = await executarPipelineCompleto(mensagem, {
    sessaoId: randomUUID(),
    ambiente: "orbit_mobile",
    config,
  });
  const ms = Date.now() - t0;
  const texto = r.resposta?.texto ?? "";
  return {
    ms,
    chars: texto.length,
    modelo: r.resposta?.modelo ?? "?",
    analiseMs: r.analise.latencia_ms ?? 0,
    respostaMs: r.resposta?.latencia_ms ?? 0,
  };
}

async function main(): Promise<void> {
  const config = configOpenRouter();
  console.log(`${B}╔═══ Bench · Provedor direto vs PAIA ═══╗${X}`);
  console.log(`${C}modelo direto: ${MODELO}${X}`);
  console.log(`${C}PAIA maior: ${config.modeloMaior} · menor: ${config.modeloMenor}${X}\n`);

  const linhas: Array<{
    msg: string;
    diretoMs: number;
    paiaMs: number;
    fator: number;
  }> = [];

  for (const msg of MSGS) {
    console.log(`${B}── mensagem ──${X}`);
    console.log(`${C}"${msg.slice(0, 80)}${msg.length > 80 ? "…" : ""}"${X}`);

    process.stdout.write(`  ${A}OpenRouter direto…${X} `);
    const direto = await medirDireto(msg);
    console.log(`${V}${s(direto.ms)}${X}  (${direto.chars} chars · ${direto.modelo})`);

    process.stdout.write(`  ${A}PAIA (pipeline)…${X}   `);
    const paia = await medirPaia(msg, config);
    const outros = Math.max(0, paia.ms - paia.analiseMs - paia.respostaMs);
    console.log(
      `${V}${s(paia.ms)}${X}  (${paia.chars} chars · ${paia.modelo})\n` +
        `      análise ${s(paia.analiseMs)} · pré ${s(outros)} · resposta ${s(paia.respostaMs)}`,
    );

    const fator = paia.ms / Math.max(1, direto.ms);
    console.log(`  ${B}overhead PAIA: ${fator.toFixed(1)}× mais lento${X}  (Δ ${s(paia.ms - direto.ms)})\n`);
    linhas.push({ msg, diretoMs: direto.ms, paiaMs: paia.ms, fator });
  }

  console.log(`${B}📋 RESUMO${X}`);
  console.log("─".repeat(58));
  for (const l of linhas) {
    console.log(
      `  direto ${s(l.diretoMs).padStart(6)}  |  PAIA ${s(l.paiaMs).padStart(6)}  |  ${l.fator.toFixed(1)}×  |  "${l.msg.slice(0, 36)}…"`,
    );
  }
  const mediaFator = linhas.reduce((a, l) => a + l.fator, 0) / linhas.length;
  console.log(`\n  ${A}média: PAIA ~${mediaFator.toFixed(1)}× o tempo do provedor direto${X}\n`);
}

main().catch((e) => {
  console.error("Erro no bench:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
