import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import type { BlocoRotinaCore } from "../estado/neuronioRotina.js";

/**
 * P14 — Quando ele PEDE fundo, ela dá a receita inteira (não os 6 passinhos)?
 *
 * O limite de 6 passos protege contra tutela (doze passos para «tomar banho» é humilhante).
 * Mas quando ele PEDE — «me dá a receita» — o limite tem de sair do caminho. É o que este
 * teste verifica: o guia sai fundo, com ingredientes e quantidades.
 */

const V="\x1b[32m",R="\x1b[31m",C="\x1b[90m",B="\x1b[1m",X="\x1b[0m";
type Bloco = BlocoRotinaCore & { roteiro?: string; guia?: string; passos?: unknown[] };
const store = new Map<string, Bloco>();
store.set("almoco", { id: "almoco", titulo: "almoço", dias: [1,2,3,4,5], inicio: 720, fim: 780, origem: "luna" });

const deps = {
  ler: async () => [...store.values()],
  criar: async (b: any) => { const id = randomUUID().slice(0,6); store.set(id, {id,...b}); return id; },
  editar: async (id: string, c: any) => { const b = store.get(id); if (b) store.set(id, {...b,...c}); },
  apagar: async (id: string) => void store.delete(id),
};
const config = { apiKey: process.env.OPENROUTER_API_KEY!, baseUrl: "https://openrouter.ai/api/v1", modeloMenor: "deepseek/deepseek-v4-flash", modeloMaior: "deepseek/deepseek-v4-pro", temperaturaMenor: 0, temperaturaMaior: 1 };

async function main(): Promise<void> {
  console.log(`${B}╔═══ P14 · Ele pede fundo, ela dá a receita? ═══╗${X}\n`);

  const fs: string[] = [];
  const r = await executarPipelineCompleto(
    // Exatamente o que o botão «detalhar mais» envia:
    "[Ele está a olhar para um bloco da rotina.] Bloco: «almoço» 12:00–13:00 id=almoco.\nEle disse: detalha isso pra mim, o passo a passo completo — hoje quero fazer um frango grelhado com arroz, a receita inteira com ingredientes e quantidades.\nUsa `detalhar_bloco` para escrever o guia deste bloco (id=almoco).",
    { sessaoId: randomUUID(), ambiente: "orbit_mobile", config, timeZone: "America/Sao_Paulo",
      interlocutor: { uid: "e", criador_verificado: true }, rotina: [...store.values()], rotinaDeps: deps as never,
      onAcaoAgentico: (a) => { if (a.tipo === "inicio_ferramenta") fs.push(a.ferramenta); } },
  );

  console.log(`${C}ferramentas: ${fs.join(", ")}${X}`);
  console.log(`${C}Luna: ${(r.resposta?.texto ?? "").replace(/\s+/g," ").slice(0,120)}…${X}\n`);

  const b = store.get("almoco")!;
  console.log(`${B}O GUIA escrito no bloco:${X}`);
  console.log(b.guia ? `${C}${b.guia}${X}` : `${R}(nenhum)${X}`);

  const temIngredientes = b.guia ? /\d+\s*(g|gramas|ml|colher|xícara|dente|unidade|filé)/i.test(b.guia) : false;
  const fundo = b.guia && b.guia.length > 200;
  console.log(
    b.guia && fundo && temIngredientes
      ? `\n${V}${B}✓ deu a receita FUNDO — com quantidades, e sem o cap de 6 passos${X}\n`
      : `\n${R}${B}✗ ${!b.guia ? "não escreveu guia" : !fundo ? "guia raso" : "sem quantidades"}${X}\n`,
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
