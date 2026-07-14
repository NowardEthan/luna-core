import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import { agoraNoFusoDele, type BlocoRotinaCore } from "../estado/neuronioRotina.js";

/**
 * P11 — Ela sabe onde ele está?
 *
 * O teste é simples e cruel: monta-se uma rotina em que ele está, NESTE minuto, dentro de um
 * bloco — e faz-se-lhe uma pergunta que só se responde bem se ela souber disso.
 *
 * Se ela disser «não sei o que estás a fazer», a rotina não chegou. Se ela souber, deixou de
 * ser um relógio e passou a ser alguém que sabe onde tu estás.
 */

const { dia, minuto } = agoraNoFusoDele("America/Sao_Paulo");

/** Um bloco que está a acontecer AGORA, e outro logo a seguir. */
const ROTINA: BlocoRotinaCore[] = [
  {
    id: "a",
    titulo: "ônibus + duolingo",
    dias: [0, 1, 2, 3, 4, 5, 6],
    inicio: minuto - 40,
    fim: minuto + 20,
    nota: "12 dias de ofensiva",
  },
  {
    id: "b",
    titulo: "trabalho",
    dias: [0, 1, 2, 3, 4, 5, 6],
    inicio: minuto + 20,
    fim: minuto + 200,
  },
];

const config = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseUrl: "https://openrouter.ai/api/v1",
  modeloMenor: "deepseek/deepseek-v4-flash",
  modeloMaior: "deepseek/deepseek-v4-pro",
  temperaturaMenor: 0,
  temperaturaMaior: 1,
};

const PROVAS = [
  "oi luna, tudo bem?",
  "cê sabe o que eu tô fazendo agora?",
  "tenho tempo pra alguma coisa antes do próximo compromisso?",
];

async function main(): Promise<void> {
  console.log(`\n╔═══ P11 · Ela sabe onde ele está? ═══╗`);
  console.log(`rotina: «ônibus + duolingo» agora (faltam 20min) → «trabalho» a seguir\n`);

  const sessao = randomUUID();

  for (const msg of PROVAS) {
    const r = await executarPipelineCompleto(msg, {
      sessaoId: sessao,
      ambiente: "orbit_mobile",
      config,
      timeZone: "America/Sao_Paulo",
      interlocutor: { uid: "ethan-teste", criador_verificado: true },
      rotina: ROTINA,
    });

    const t = (r.resposta?.texto ?? "").replace(/\s+/g, " ");
    const sabe = /(duolingo|ônibus|onibus|busão|20 ?min|trabalho)/i.test(t);

    console.log(`Ethan: ${msg}`);
    console.log(`Luna:  ${t.slice(0, 220)}…`);
    console.log(`       ${sabe ? "✓ sabe onde ele está" : "✗ no escuro"}\n`);
  }
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
