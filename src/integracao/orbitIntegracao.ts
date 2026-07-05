import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { refletirSessao } from "../analyzers/refletorSessao.js";
import { calcularSaliencia } from "../memoria/longa/calculadorSaliencia.js";
import { inferirCategoria } from "../memoria/longa/categorizador.js";
import { obterMotorEmbeddings } from "../memoria/longa/motorEmbeddings.js";
import { inserirFatoLongo, listarFatosAtivos } from "../memoria/longa/storeSqlite.js";
import {
  criarSessao,
  obterOuCriarSessao,
} from "../memoria/gerenciadorSessao.js";
import type { MemoriaSessao } from "../memoria/esquemaMemoria.js";
import { carregarSessao, PASTA_SESSOES, salvarSessao } from "../memoria/storeSessao.js";
import { carregarConfig } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";

const RECALL_RE =
  /lembra|lembr|antes|outra conversa|outro chat|disse antes|falamos|conversamos|conversa anterior|no outro|da outra vez/i;

/** Garante que a sessão Orbit existe no Core (1:1 com Conversation.id). */
export function prepararSessaoOrbit(sessaoId: string): MemoriaSessao {
  const existente = carregarSessao(sessaoId);
  if (existente) return existente;
  const nova = criarSessao();
  nova.id = sessaoId;
  salvarSessao(nova);
  return nova;
}

function tokenizar(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 2),
  );
}

const STOPWORDS = new Set([
  "voce", "você", "lembra", "lembr", "antes", "outra", "conversa", "disse",
  "falamos", "sobre", "isso", "sei", "ola", "oi", "boa", "noite", "dia",
  "tarde", "luna", "lunaaa", "the", "and", "que", "como", "para", "uma",
]);

function tokensRelevantes(mensagem: string): string[] {
  return [...tokenizar(mensagem)].filter((t) => !STOPWORDS.has(t) && t.length > 2);
}

function pontuarSessao(mensagem: string, sessao: MemoriaSessao): number {
  const textoSessao = sessao.mensagens.map((m) => m.conteudo).join(" ").toLowerCase();
  const tokens = tokensRelevantes(mensagem);
  let score = 0;

  for (const t of tokens) {
    if (textoSessao.includes(t)) score += 3;
  }

  const sTokens = tokenizar(textoSessao);
  for (const t of tokens) {
    if (sTokens.has(t)) score += 1;
  }

  const userMsgs = sessao.mensagens.filter((m) => m.papel === "user").length;
  score += Math.min(userMsgs, 6) * 0.15;

  // Preferir sessões mais recentes
  const ageMs = Date.now() - new Date(sessao.atualizada_em).getTime();
  if (ageMs < 86_400_000) score += 2;
  else if (ageMs < 604_800_000) score += 1;

  return score;
}

function resumirSessao(
  sessao: MemoriaSessao,
  tokensBusca: string[] = [],
  maxTurnos = 10,
): string {
  if (!sessao.mensagens.length) return "";

  const picked = new Set<number>();
  const add = (i: number) => {
    if (i >= 0 && i < sessao.mensagens.length) picked.add(i);
  };

  add(0);
  const firstUser = sessao.mensagens.findIndex((m) => m.papel === "user");
  if (firstUser >= 0) add(firstUser);

  for (let i = 0; i < sessao.mensagens.length; i++) {
    const lower = sessao.mensagens[i]!.conteudo.toLowerCase();
    if (tokensBusca.some((t) => lower.includes(t))) add(i);
  }

  for (let i = Math.max(0, sessao.mensagens.length - maxTurnos); i < sessao.mensagens.length; i++) {
    add(i);
  }

  const indices = [...picked].sort((a, b) => a - b);
  const linhas = indices.map((i) => {
    const m = sessao.mensagens[i]!;
    const quem = m.papel === "user" ? "Usuário" : "Luna";
    const txt = m.conteudo.replace(/\s+/g, " ").trim().slice(0, 320);
    return `${quem}: ${txt}`;
  });

  const titulo =
    sessao.mensagens.find((m) => m.papel === "user")?.conteudo.slice(0, 60) ??
    sessao.id;
  return `[Conversa "${titulo}" · ${sessao.atualizada_em.slice(0, 10)}]\n${linhas.join("\n")}`;
}

export type OpcoesBuscaContextoCross = {
  /** Quando true, inclui sessões recentes mesmo sem pedido explícito de recall (mobile/API). */
  sempreAtivo?: boolean;
  /** Filtra sessões pelo UID do dono — obrigatório em produção multi-user. */
  owner_uid?: string | null;
};

/**
 * Busca trechos de outras sessões quando o usuário pede recall entre conversas.
 * Com `sempreAtivo`, inclui até `maxSessoes` conversas recentes (memória global).
 */
export function buscarContextoOutrasSessoes(
  mensagem: string,
  sessaoAtualId: string,
  maxSessoes = 3,
  opcoes?: OpcoesBuscaContextoCross,
): string[] {
  const recallExplicito = RECALL_RE.test(mensagem);
  if (!recallExplicito && !opcoes?.sempreAtivo) return [];

  const tokensBusca = tokensRelevantes(mensagem);

  let arquivos: string[] = [];
  try {
    arquivos = readdirSync(PASTA_SESSOES).filter(
      (f) => f.endsWith(".json") && !f.startsWith("."),
    );
  } catch {
    return [];
  }

  const candidatas: Array<{ score: number; resumo: string }> = [];

  for (const arquivo of arquivos) {
    const id = arquivo.replace(/\.json$/, "");
    if (id === sessaoAtualId || id.startsWith("test-")) continue;

    const sessao = carregarSessao(id);
    if (!sessao || sessao.mensagens.length < 2) continue;

    if (opcoes?.owner_uid && sessao.owner_uid && sessao.owner_uid !== opcoes.owner_uid) {
      continue;
    }

    const userCount = sessao.mensagens.filter((m) => m.papel === "user").length;
    if (userCount < 1) continue;

    const score = pontuarSessao(mensagem, sessao);
    const resumo = resumirSessao(sessao, tokensBusca);
    if (!resumo) continue;

    candidatas.push({ score: score + userCount * 0.05, resumo });
  }

  candidatas.sort((a, b) => b.score - a.score);

  let selecionadas = recallExplicito
    ? candidatas.filter((c) => c.score > 0).slice(0, maxSessoes)
    : [];

  if (selecionadas.length < maxSessoes) {
    const recentes: MemoriaSessao[] = [];
    for (const arquivo of arquivos) {
      const id = arquivo.replace(/\.json$/, "");
      if (id === sessaoAtualId || id.startsWith("test-")) continue;
      const s = carregarSessao(id);
      if (s && s.mensagens.filter((m) => m.papel === "user").length >= 1) {
        if (opcoes?.owner_uid && s.owner_uid && s.owner_uid !== opcoes.owner_uid) continue;
        recentes.push(s);
      }
    }
    recentes.sort((a, b) => b.atualizada_em.localeCompare(a.atualizada_em));
    for (const s of recentes) {
      if (selecionadas.length >= maxSessoes) break;
      const resumo = resumirSessao(s, tokensBusca);
      if (!selecionadas.some((x) => x.resumo === resumo)) {
        selecionadas.push({ score: 0, resumo });
      }
    }
  }

  return selecionadas.map((c) => c.resumo);
}

export type FatoMemoriaLongaResumo = {
  id: string;
  conteudo: string;
  tipo: string;
  escopo: string;
  sessao_origem_id: string | null;
  confirmado_em: string;
  saliencia_score: number | null;
};

export function listarMemoriaLongaResumo(limit = 80): FatoMemoriaLongaResumo[] {
  try {
    return listarFatosAtivos(limit).map((f) => ({
      id: f.id,
      conteudo: f.conteudo,
      tipo: f.tipo,
      escopo: f.escopo,
      sessao_origem_id: f.sessao_origem_id,
      confirmado_em: f.confirmado_em,
      saliencia_score: f.saliencia_score ?? null,
    }));
  } catch {
    return [];
  }
}

export type ResultadoReflexaoOrbit = {
  ok: boolean;
  candidatos: number;
  salvos: number;
  error?: string;
};

/** Consolida fatos da sessão no SQLite (pós-conversa / ao apagar no Orbit). */
export async function executarReflexaoSessao(
  sessaoId: string,
): Promise<ResultadoReflexaoOrbit> {
  const sessao = carregarSessao(sessaoId);
  if (!sessao) {
    return { ok: false, candidatos: 0, salvos: 0, error: "Sessão não encontrada" };
  }
  if (sessao.mensagens.length === 0) {
    return { ok: true, candidatos: 0, salvos: 0 };
  }

  const config = carregarConfig();
  if (!config) {
    return { ok: false, candidatos: 0, salvos: 0, error: "LUNA_API_KEY não configurada" };
  }

  const provedor = criarProvedorOpenAi({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  try {
    const resultado = await refletirSessao(sessao, provedor, config.modeloMenor);
    let salvos = 0;

    if (resultado.candidatos.length > 0) {
      const motor = obterMotorEmbeddings();
      for (const c of resultado.candidatos) {
        if (c.acao === "ignorar" || c.confianca < 0.6) continue;
        try {
          const vetor = await motor.gerarEmbedding(c.conteudo);
          const status = c.acao === "confirmar" ? "pendente_confirmacao" : "ativo";
          let escopo: "longo_prazo" | "perfil" = "longo_prazo";
          if (c.tipo === "informacao_sensivel" || c.tipo === "preferencia") {
            escopo = "perfil";
          }
          const sensibilidade =
            c.tipo === "informacao_sensivel" ? "sensivel" : "normal";
          const { score: salienciaScore } = calcularSaliencia({
            tipo: c.tipo,
            sensibilidade,
            visibilidade_uso: c.visibilidade_uso,
            fonte_confirmacao: "inferencia_reflexao",
            confianca: c.confianca,
            utilidade_futura: c.utilidade_futura,
          });

          inserirFatoLongo(
            sessao.id,
            c.conteudo,
            c.tipo,
            sensibilidade,
            c.visibilidade_uso,
            escopo,
            "inferencia_reflexao",
            undefined,
            JSON.stringify(vetor),
            {
              origem: "reflexao",
              status,
              confianca: c.confianca,
              saliencia_score: salienciaScore,
              utilidade_futura: c.utilidade_futura,
            },
          );
          salvos++;
        } catch {
          /* ignora fato individual */
        }
      }
    }

    return {
      ok: true,
      candidatos: resultado.candidatos.length,
      salvos,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, candidatos: 0, salvos: 0, error: msg };
  }
}

/** Sincroniza título/metadata Orbit na sessão (extensível). */
export function vincularSessaoOrbit(sessaoId: string, _titulo?: string): MemoriaSessao {
  return obterOuCriarSessao(sessaoId);
}

/** Hidrata histórico local quando a fonte remota tem mais turnos (ex.: Firestore mobile). */
export function hidratarSessaoOrbit(
  sessaoId: string,
  mensagens: MemoriaSessao["mensagens"],
): MemoriaSessao {
  const sessao = prepararSessaoOrbit(sessaoId);
  if (mensagens.length <= sessao.mensagens.length) return sessao;

  sessao.mensagens = mensagens;
  const ultima = mensagens[mensagens.length - 1];
  if (ultima?.timestamp) {
    sessao.atualizada_em = ultima.timestamp;
  }
  salvarSessao(sessao);
  return sessao;
}
