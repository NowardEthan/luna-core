import "../carregarEnv.js";
import { analisarContexto } from "../analyzers/analisadorContextoLlm.js";
import { classificarProfundidade } from "../estado/talamoPipeline.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";

/** Como o pipeline classifica cada tipo de turno? Base factual pro gate de peso (camada 1). */

const provedor = criarProvedorOpenAi({
  apiKey: process.env.OPENROUTER_API_KEY!.trim(),
  baseUrl: "https://openrouter.ai/api/v1",
});
const modeloMenor = "deepseek/deepseek-v4-flash";

const MENSAGENS: Array<[string, string]> = [
  ["casual/saudação", "oi Luna! tudo bem? como foi teu dia hoje? kkk"],
  ["trivial", "kkkk"],
  ["logística", "que horas são?"],
  ["emocional (pra baixo)", "tô meio pra baixo hoje, sei lá, foi um dia estranho e eu não sei bem o porquê"],
  ["emocional (medo)", "tô com medo de não conseguir terminar a Luna, sinto que não sou bom o suficiente"],
  ["afetivo", "obrigado por isso, viu. você me ajudou muito hoje"],
  ["técnico", "me explica a diferença entre índice hash e índice B-tree num banco de dados"],
  ["identitário", "você acredita em Deus mesmo? ou é só o que te programaram?"],
];

for (const [rotulo, msg] of MENSAGENS) {
  const prof = classificarProfundidade(msg);
  const r = await analisarContexto(msg, provedor, modeloMenor);
  const a = r.analise;
  console.log(
    `${rotulo.padEnd(24)} | intenção: ${a.intencao.padEnd(20)} | prof: ${prof.padEnd(9)} | risco: ${a.nivel_risco.padEnd(7)} | complex: ${a.complexidade}`,
  );
}
