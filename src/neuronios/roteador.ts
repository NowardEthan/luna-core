import { obterMotorEmbeddings } from "../memoria/longa/motorEmbeddings.js";
import { calcularCosineSimilarity } from "../memoria/longa/cosineSimilarity.js";
import {
  neuroniosRegistrados,
  type ContextoColeta,
  type NeuronioRegistrado,
} from "./registro.js";

const THRESHOLD_PADRAO = 0.35;
const cacheEmbeddings = new Map<string, number[]>();

async function embeddingNeuronio(n: NeuronioRegistrado): Promise<number[]> {
  const chave = `${n.nome}:${n.descricao}:${n.exemplos_ativacao.join("|")}`;
  const cached = cacheEmbeddings.get(chave);
  if (cached) return cached;

  const motor = obterMotorEmbeddings();
  const texto = [n.descricao, ...n.exemplos_ativacao].join(". ");
  const vec = await motor.gerarEmbedding(texto);
  cacheEmbeddings.set(chave, vec);
  return vec;
}

export type ResultadoRoteamento = {
  ativos: NeuronioRegistrado[];
  scores: Record<string, number>;
};

export async function rotear(
  mensagem: string,
  intencao: string,
  maxAtivos = 3,
  threshold = THRESHOLD_PADRAO,
): Promise<ResultadoRoteamento> {
  const todos = neuroniosRegistrados();
  const scores: Record<string, number> = {};
  const ativos: NeuronioRegistrado[] = [];

  const sempre = todos.filter((n) => n.sempre_ativo);
  ativos.push(...sempre);

  const candidatos = todos.filter((n) => !n.sempre_ativo);
  if (candidatos.length === 0) {
    return { ativos, scores };
  }

  const motor = obterMotorEmbeddings();
  const textoConsulta =
    intencao === "conversa_casual" ? mensagem : `${mensagem} [${intencao}]`;
  const embMsg = await motor.gerarEmbedding(textoConsulta);

  const pontuados: Array<{ n: NeuronioRegistrado; score: number }> = [];
  for (const n of candidatos) {
    const embN = await embeddingNeuronio(n);
    let score = calcularCosineSimilarity(embMsg, embN);
    if (intencao === "conversa_casual" && n.nome !== "sense") {
      score *= 0.85;
    }
    scores[n.nome] = score;
    if (score >= threshold) pontuados.push({ n, score });
  }

  pontuados.sort((a, b) => b.score - a.score);
  for (const p of pontuados.slice(0, maxAtivos)) {
    if (!ativos.some((a) => a.nome === p.n.nome)) ativos.push(p.n);
  }

  return { ativos, scores };
}

export async function coletarNeuroniosAtivos(
  ctx: ContextoColeta,
): Promise<{
  dados: Partial<Record<keyof import("../contexto/compiladorContexto.js").EntradasCompilador, string>>;
  ativos: string[];
  scores: Record<string, number>;
}> {
  const { ativos, scores } = await rotear(ctx.mensagem, ctx.intencao);
  const dados: Partial<Record<string, string>> = {};

  for (const n of ativos) {
    const valor = await n.coletar(ctx);
    if (valor?.trim()) {
      dados[n.prioridade_compilador] = valor.trim();
    }
  }

  return { dados, ativos: ativos.map((n) => n.nome), scores };
}
