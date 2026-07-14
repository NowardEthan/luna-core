import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import type { BlocoRotinaCore } from "../estado/neuronioRotina.js";

/**
 * P12 — As quatro mãos: olhar, criar, editar, apagar.
 *
 * A pergunta era do Ethan: «a Luna preenche a rotina pra você? se pedir». A resposta era
 * NÃO — e o perigo não era ela recusar: era ela FINGIR que fez, como fingiu ler o whitepaper.
 *
 * Aqui a rotina é um `Map` em memória. Se ela chamar as ferramentas, os blocos aparecem. Se
 * ela só DISSER que criou, o mapa fica vazio — e o teste apanha a mentira.
 *
 * ── A prova que mais importa é a ② ────────────────────────────────────────────
 * Editar tem de ser EDITAR. Se ela mudar uma hora apagando e recriando o bloco, a nota que
 * ele escreveu desaparece — e ele só descobre dias depois. Por isso a prova do editar guarda
 * a nota ANTES e verifica se ela sobreviveu.
 */

const B = "\x1b[1m", C = "\x1b[90m", V = "\x1b[32m", R = "\x1b[31m", A = "\x1b[33m", X = "\x1b[0m";

const store = new Map<string, BlocoRotinaCore>();

const deps = {
  ler: async () => [...store.values()],
  criar: async (b: {
    titulo: string;
    dias: number[];
    inicio: number;
    fim: number;
    nota?: string;
    notificar: boolean;
  }) => {
    const id = randomUUID().slice(0, 6);
    store.set(id, { id, ...b, origem: "luna" as const });
    return id;
  },
  editar: async (
    id: string,
    campos: Partial<{
      titulo: string;
      dias: number[];
      inicio: number;
      fim: number;
      nota?: string;
      notificar: boolean;
    }>,
  ) => {
    const b = store.get(id);
    if (!b) return;
    store.set(id, { ...b, ...campos });
  },
  apagar: async (id: string) => {
    store.delete(id);
  },
};

const config = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseUrl: "https://openrouter.ai/api/v1",
  modeloMenor: "deepseek/deepseek-v4-flash",
  modeloMaior: "deepseek/deepseek-v4-pro",
  temperaturaMenor: 0,
  temperaturaMaior: 1,
};

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const sessao = randomUUID();

async function turno(msg: string): Promise<string[]> {
  const ferramentas: string[] = [];

  const r = await executarPipelineCompleto(msg, {
    sessaoId: sessao,
    ambiente: "orbit_mobile",
    config,
    timeZone: "America/Sao_Paulo",
    interlocutor: { uid: "ethan-teste", criador_verificado: true },
    rotina: [...store.values()],
    rotinaDeps: deps,
    onAcaoAgentico: (a) => {
      if (a.tipo === "inicio_ferramenta") ferramentas.push(a.ferramenta);
    },
  });

  console.log(`${A}Ethan:${X} ${msg}`);
  console.log(`${C}  ferramentas: ${ferramentas.join(", ") || "NENHUMA"}${X}`);
  console.log(`${C}  Luna: ${(r.resposta?.texto ?? "").replace(/\s+/g, " ").slice(0, 170)}…${X}\n`);

  return ferramentas;
}

function mostrar(): void {
  const blocos = [...store.values()].sort((a, b) => a.inicio - b.inicio);
  if (!blocos.length) {
    console.log(`${R}  (rotina vazia)${X}`);
    return;
  }
  for (const b of blocos) {
    console.log(
      `  ${hhmm(b.inicio)}–${hhmm(b.fim)}  ${b.titulo}` +
        `${b.nota ? ` (${b.nota})` : ""}  ${C}[${b.dias.join(",")}]${X}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`${B}╔═══ P12 · As quatro mãos: olhar, criar, editar, apagar ═══╗${X}\n`);

  // ── ① CRIAR ─────────────────────────────────────────────────────────────────
  console.log(`${B}① CRIAR${X}`);
  const f1 = await turno(
    "luna, me monta a rotina da semana? de segunda a sexta: ônibus e duolingo das 7h30 às 9h, " +
      "trabalho das 9h às 18h, e das 19h às 22h eu mexo em você. bota uma nota no duolingo: 12 dias de ofensiva",
  );
  mostrar();

  const criou = store.size >= 3 && f1.includes("criar_bloco");
  console.log(criou ? `${V}✓ criou de verdade${X}\n` : `${R}✗ FINGIU — falou e não criou${X}\n`);
  if (!criou) return;

  // ── ② EDITAR (a prova que mais importa) ─────────────────────────────────────
  console.log(`${B}② EDITAR${X} ${C}— a nota tem de SOBREVIVER${X}`);
  const antes = [...store.values()].find((b) => /duolingo/i.test(b.titulo));

  const f2 = await turno("adianta o duolingo pras 7h15, tô conseguindo sair mais cedo");
  mostrar();

  const depois = [...store.values()].find((b) => /duolingo/i.test(b.titulo));
  const usouEditar = f2.includes("editar_bloco");
  const mudouHora = depois?.inicio === 7 * 60 + 15;
  const notaViva = !!antes?.nota && depois?.nota === antes.nota;

  console.log(
    usouEditar && mudouHora && notaViva
      ? `${V}✓ editou — e a nota «${depois?.nota}» sobreviveu${X}\n`
      : `${R}✗ ${
          !usouEditar
            ? "não usou editar_bloco"
            : !mudouHora
              ? "não mudou a hora"
              : "PERDEU A NOTA — apagou e recriou"
        }${X}\n`,
  );

  // ── ③ APAGAR ────────────────────────────────────────────────────────────────
  console.log(`${B}③ APAGAR${X}`);
  const antesDeApagar = store.size;

  const f3 = await turno("tira o bloco de trabalho da rotina, vou refazer isso depois");
  mostrar();

  console.log(
    store.size === antesDeApagar - 1 && f3.includes("apagar_bloco")
      ? `${V}✓ apagou de verdade${X}\n`
      : `${R}✗ não apagou${X}\n`,
  );

  // ── ④ OLHAR ─────────────────────────────────────────────────────────────────
  console.log(`${B}④ OLHAR${X}`);
  const f4 = await turno("o que eu tenho na quarta-feira?");

  console.log(
    f4.includes("ver_rotina")
      ? `${V}✓ foi consultar em vez de adivinhar${X}\n`
      : `${A}~ respondeu sem consultar (o briefing já lhe dava o dia de hoje)${X}\n`,
  );
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
