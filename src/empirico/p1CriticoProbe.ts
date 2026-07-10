import "../carregarEnv.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { criticarRigor } from "../estado/criticoRigor.js";

/**
 * Testa o CRÍTICO isolado (v2 da camada 3) — barato: 1 chamada flash por run.
 * Dá um rascunho real que IGNORA o mofo branco + a mensagem com o local, e mede
 * em quantos runs o crítico pega a lacuna (solido=false citando mofo/Sclerotinia).
 */
const provedor = criarProvedorOpenAi({
  apiKey: process.env.OPENROUTER_API_KEY!.trim(),
  baseUrl: "https://openrouter.ai/api/v1",
});
const modelo = process.env.P0_MODEL_MENOR?.trim() || "deepseek/deepseek-v4-flash";

const MSG =
  "Me faça um plano de manejo com 4 aplicações de fungicidas para soja, focando nas moléculas mais recentes. Moro em São José dos Pinhais.";

// Rascunho realista que cobre ferrugem/DFC/rotação de SDHI mas IGNORA mofo branco.
const RASCUNHO = `Beleza! Plano de 4 aplicações focado em rotação de mecanismos e proteção do ciclo:

1ª (V6-V8): Trifloxistrobina + Protioconazol + Mancozebe — entrada preventiva, multissítio de base.
2ª (R1): Benzovindiflupir + Picoxistrobina + Clorotalonil — janela crítica de ferrugem, primeira carboxamida.
3ª (R3-R4): Bixafem + Protioconazol + Mancozebe — rotaciona o SDHI, protege as vagens.
4ª (R5.1-R5.3): Fluxapiroxade + Piraclostrobina + Oxicloreto de cobre — fecha o ciclo, cobre DFCs (cercospora, mancha-parda).

Pontos: intervalo 12-14 dias; multissítio em todas; rotação de 3 carboxamidas diferentes;
gota média a fina, evitar horário de inversão térmica.`;

const N = Number(process.env.P1_CRITICO_N ?? 5);
const V = "\x1b[32m", R = "\x1b[31m", B = "\x1b[1m", C = "\x1b[90m", X = "\x1b[0m";

let pegou = 0;
console.log(`${B}Crítico: ${modelo} · N=${N}${X}`);
for (let i = 1; i <= N; i++) {
  const r = await criticarRigor({ mensagemUsuario: MSG, respostaRascunho: RASCUNHO }, { provedor, modelo });
  const citaMofo = r.lacunas.some((l) => /mofo[ -]?branco|scleroti/i.test(l));
  if (!r.solido && citaMofo) pegou++;
  console.log(
    `  run ${i}: solido=${r.solido} ${citaMofo ? `${V}✓ pegou mofo${X}` : `${R}✗ não pegou${X}`}  ${C}lacunas: ${JSON.stringify(r.lacunas).slice(0, 160)}${X}`,
  );
}
console.log(`${B}→ Crítico pegou o mofo branco: ${pegou}/${N}${X}\n`);
