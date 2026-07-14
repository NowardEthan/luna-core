import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import type { BlocoRotinaCore } from "../estado/neuronioRotina.js";

/**
 * P13 — Ela detalha o bloco, ou deixa-o à porta?
 *
 * O Ethan tem TDAH. «Almoço · 12h–13h» não arranca ninguém; «descongela o frango (5 min)»
 * arranca. A pergunta é se ela usa a ferramenta de roteiro sem que ele tenha de pedir — e se
 * NÃO enche de passos aquilo que não precisa (doze passos para «tomar banho» é humilhante).
 */

const V = "\x1b[32m", R = "\x1b[31m", C = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";

type BlocoStore = BlocoRotinaCore & { roteiro?: string; passos?: Array<{ texto: string }> };
const store = new Map<string, BlocoStore>();

const deps = {
  ler: async () => [...store.values()],
  criar: async (b: any) => {
    const id = randomUUID().slice(0, 6);
    store.set(id, { id, ...b, origem: "luna" as const });
    return id;
  },
  editar: async (id: string, campos: any) => {
    const b = store.get(id);
    if (b) store.set(id, { ...b, ...campos });
  },
  apagar: async (id: string) => void store.delete(id),
};

const config = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseUrl: "https://openrouter.ai/api/v1",
  modeloMenor: "deepseek/deepseek-v4-flash",
  modeloMaior: "deepseek/deepseek-v4-pro",
  temperaturaMenor: 0,
  temperaturaMaior: 1,
};

const sessao = randomUUID();

async function turno(msg: string): Promise<string[]> {
  const fs: string[] = [];
  const r = await executarPipelineCompleto(msg, {
    sessaoId: sessao,
    ambiente: "orbit_mobile",
    config,
    timeZone: "America/Sao_Paulo",
    interlocutor: { uid: "ethan-teste", criador_verificado: true },
    rotina: [...store.values()],
    rotinaDeps: deps as never,
    onAcaoAgentico: (a) => {
      if (a.tipo === "inicio_ferramenta") fs.push(a.ferramenta);
    },
  });
  console.log(`${C}  ferramentas: ${fs.join(", ") || "nenhuma"}${X}`);
  console.log(`${C}  Luna: ${(r.resposta?.texto ?? "").replace(/\s+/g, " ").slice(0, 150)}…${X}\n`);
  return fs;
}

async function main(): Promise<void> {
  console.log(`${B}╔═══ P13 · Ela detalha o bloco? ═══╗${X}\n`);

  console.log(`${B}① Ela detalha sozinha ao criar?${X}`);
  await turno(
    "luna, cria um bloco de almoço pra mim, 12h às 13h, de segunda a sexta. e tô sempre travando na hora de cozinhar, não sei por onde começar",
  );

  for (const b of store.values()) {
    console.log(`  ${B}${b.titulo}${X}`);
    console.log(`    roteiro: ${b.roteiro ? `${V}«${b.roteiro.slice(0, 90)}…»${X}` : `${R}(nenhum)${X}`}`);
    console.log(`    passos:  ${b.passos?.length ? `${V}${b.passos.length}${X}` : `${R}0${X}`}`);
    if (b.passos) for (const p of b.passos) console.log(`      · ${p.texto}`);
  }

  const comRoteiro = [...store.values()].filter((b) => b.roteiro || b.passos?.length);
  console.log(
    comRoteiro.length
      ? `\n${V}${B}✓ detalhou sozinha${X}\n`
      : `\n${R}${B}✗ criou o bloco vazio — deixou-o à porta${X}\n`,
  );

  console.log(`${B}② Ele negocia: «faz mais simples»${X}`);
  const antes = [...store.values()][0]?.passos?.length ?? 0;
  await turno("os passos tão complicados demais, faz bem mais simples, tipo 3 coisas só");
  const depois = [...store.values()][0]?.passos?.length ?? 0;
  for (const p of [...store.values()][0]?.passos ?? []) console.log(`  · ${p.texto}`);
  console.log(
    depois > 0 && depois <= antes
      ? `\n${V}${B}✓ reescreveu (${antes} → ${depois} passos)${X}\n`
      : `\n${R}${B}✗ não simplificou (${antes} → ${depois})${X}\n`,
  );
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
