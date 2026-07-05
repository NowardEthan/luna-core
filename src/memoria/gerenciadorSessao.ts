import { randomUUID } from "node:crypto";

import type { DecisaoMemoria, ContextoSessao, MemoriaSessao, TurnoMensagem, ContextoAcumulado } from "./esquemaMemoria.js";
import type { PoliticaDecisao, NivelRisco, AnaliseContexto } from "../analyzers/esquema.js";
import { elevarNivelRisco } from "../analyzers/lexicoSeguranca.js";
import { calcularEstadoInterno } from "../estado/calculadorEstadoInterno.js";
import { carregarSessao, salvarSessao } from "./storeSessao.js";
import { inserirFatoLongo } from "./longa/storeSqlite.js";

const LIMITE_HISTORICO = 20;

export function criarSessao(): MemoriaSessao {
  const agora = new Date().toISOString();
  return {
    id: randomUUID(),
    criada_em: agora,
    atualizada_em: agora,
    mensagens: [],
    fatos: [],
    preferencias: {},
  };
}

export function obterOuCriarSessao(id?: string): MemoriaSessao {
  if (id) {
    const existente = carregarSessao(id);
    if (existente) return existente;
    // Cria nova sessão com o id fornecido para que chamadas subsequentes encontrem o arquivo
    const nova = criarSessao();
    nova.id = id;
    return nova;
  }
  return criarSessao();
}

export function prepararContextoRespondedor(sessao: MemoriaSessao): ContextoSessao {
  const recentes = sessao.mensagens.slice(-LIMITE_HISTORICO);
  return {
    historico: recentes.map(({ papel, conteudo }) => ({ papel, conteudo })),
    fatos: [...sessao.fatos],
    preferencias: { ...sessao.preferencias },
    pendente_confirmacao: sessao.pendente_confirmacao,
  };
}

function registrarPreferencia(sessao: MemoriaSessao, conteudo: string): void {
  const match = conteudo.match(/\bprefiro\s+(.+)/i);
  if (match) {
    sessao.preferencias.preferencia_usuario = match[1]!.trim();
  }
}

/** Aplica decisão do neurônio V1.2 na sessão (fatos confirmados, pendências). */
export function aplicarDecisaoMemoria(sessao: MemoriaSessao, decisao: DecisaoMemoria): void {
  switch (decisao.acao) {
    case "armazenar": {
      let conteudo = decisao.conteudo.trim();
      let uso = decisao.uso_recomendado;
      let sensibilidade = decisao.sensibilidade;

      if (sessao.pendente_confirmacao && decisao.tipo === "confirmacao_usuario") {
         conteudo = sessao.pendente_confirmacao.conteudo;
         uso = sessao.pendente_confirmacao.uso_recomendado ?? uso;
         sensibilidade = sessao.pendente_confirmacao.sensibilidade;
         decisao.visibilidade_uso = sessao.pendente_confirmacao.visibilidade_uso ?? decisao.visibilidade_uso;
         decisao.tipo = sessao.pendente_confirmacao.tipo; // Herda o tipo original (ex: informacao_sensivel)
      }

      const fatoContexto = uso ? `Fato: ${conteudo} - Orientação: ${uso}` : conteudo;
      if (fatoContexto && !sessao.fatos.includes(fatoContexto)) {
        sessao.fatos.push(fatoContexto);
      }

      if (decisao.tipo === "preferencia") {
        registrarPreferencia(sessao, conteudo);
      }

      // SQLite Memoria Longa (V1.4)
      let escopo: "sessao" | "longo_prazo" | "perfil" = "longo_prazo";
      if (decisao.tipo === "preferencia" || decisao.tipo === "informacao_sensivel") {
        escopo = "perfil";
      }

      // Roda a geração de embedding em background para não bloquear o fluxo da sessão
      Promise.resolve().then(async () => {
        try {
          const { obterMotorEmbeddings } = await import("./longa/motorEmbeddings.js");
          const motor = obterMotorEmbeddings();
          const vetor = await motor.gerarEmbedding(conteudo);
          const embeddingJson = JSON.stringify(vetor);

          inserirFatoLongo(
            sessao.id,
            conteudo,
            decisao.tipo,
            sensibilidade ?? "normal",
            decisao.visibilidade_uso ?? "mencionar_se_perguntado",
            escopo,
            decisao.tipo === "confirmacao_usuario" ? "confirmacao_usuario" : "inferencia_confirmada",
            uso,
            embeddingJson
          );
        } catch (e) {
          console.error("Aviso: falha ao gerar embedding ou salvar fato na memória longa", e);
          // Fallback sem embedding
          try {
            inserirFatoLongo(
              sessao.id,
              conteudo,
              decisao.tipo,
              sensibilidade ?? "normal",
              decisao.visibilidade_uso ?? "mencionar_se_perguntado",
              escopo,
              decisao.tipo === "confirmacao_usuario" ? "confirmacao_usuario" : "inferencia_confirmada",
              uso
            );
          } catch(e2) {}
        }
      });

      delete sessao.pendente_confirmacao;
      break;
    }
    case "confirmar": {
      sessao.pendente_confirmacao = {
        conteudo: decisao.conteudo.trim(),
        tipo: decisao.tipo,
        uso_recomendado: decisao.uso_recomendado,
        sensibilidade: decisao.sensibilidade ?? "normal",
        visibilidade_uso: decisao.visibilidade_uso ?? "mencionar_se_perguntado",
        solicitado_em: new Date().toISOString(),
      };
      break;
    }
    case "atualizar": {
      const fato = decisao.conteudo.trim();
      if (fato && sessao.fatos.length > 0) {
        sessao.fatos[sessao.fatos.length - 1] = fato;
      } else if (fato) {
        sessao.fatos.push(fato);
      }
      break;
    }
    case "ignorar":
      break;
  }
}

/**
 * V1.8 — Atualiza o contexto acumulado da sessão após cada turn.
 * O contexto acumula nível de risco e intenções para modular análises futuras (top-down feedback).
 */
export function atualizarContextoAcumulado(
  sessao: MemoriaSessao,
  politica: PoliticaDecisao,
  intencaoDetectada: string,
): void {
  const anterior = sessao.contexto_acumulado;
  const nivelAnterior: NivelRisco = anterior?.nivel_risco_acumulado ?? "nenhum";
  const novoNivel = elevarNivelRisco(nivelAnterior, politica.nivel_seguranca as NivelRisco);
  const modoBurst = novoNivel === "alto" || novoNivel === "critico";

  const intencoesRecentes = [
    ...(anterior?.intencoes_recentes ?? []),
    intencaoDetectada,
  ].slice(-3);

  sessao.contexto_acumulado = {
    nivel_risco_acumulado: novoNivel,
    modo_burst: modoBurst,
    intencoes_recentes: intencoesRecentes,
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * V2.1 — Atualiza o vetor de estado interno da sessão após análise.
 * Chamado antes da geração de política, após análise de contexto.
 */
export function atualizarEstadoInterno(
  sessao: MemoriaSessao,
  analise: AnaliseContexto,
): void {
  sessao.estado_interno = calcularEstadoInterno(
    analise,
    sessao,
    sessao.contexto_acumulado,
  );
}

export function registrarTurno(
  sessao: MemoriaSessao,
  mensagemUsuario: string,
  respostaLuna: string | undefined,
  decisaoMemoria: DecisaoMemoria,
): MemoriaSessao {
  const agora = new Date().toISOString();
  const novosTurnos: TurnoMensagem[] = [
    { papel: "user", conteudo: mensagemUsuario, timestamp: agora },
  ];

  if (respostaLuna) {
    novosTurnos.push({ papel: "assistant", conteudo: respostaLuna, timestamp: agora });
  }

  aplicarDecisaoMemoria(sessao, decisaoMemoria);

  const todasMensagens = [...sessao.mensagens, ...novosTurnos];
  let resumoRolante = sessao.resumo_rolante;

  if (todasMensagens.length > LIMITE_HISTORICO) {
    const descartados = todasMensagens.slice(0, todasMensagens.length - LIMITE_HISTORICO);
    const trecho = descartados
      .map((m) => `${m.papel === "user" ? "Usuário" : "Luna"}: ${m.conteudo.replace(/\s+/g, " ").trim().slice(0, 100)}`)
      .join(" | ");
    resumoRolante = [resumoRolante, trecho].filter(Boolean).join(" ").slice(-800);
  }

  const atualizada: MemoriaSessao = {
    ...sessao,
    atualizada_em: agora,
    mensagens: todasMensagens.slice(-LIMITE_HISTORICO),
    resumo_rolante: resumoRolante,
  };

  salvarSessao(atualizada);
  return atualizada;
}
