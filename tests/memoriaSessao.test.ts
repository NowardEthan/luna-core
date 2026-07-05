import { describe, expect, it, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { criarProvedorMock } from "../src/providers/mockProvedor.js";
import type { RequisicaoCompletacao } from "../src/providers/tipos.js";
import { executarPipelineCompleto } from "../src/pipeline/executarPipelineCompleto.js";
import { carregarSessao, caminhoSessao, PASTA_SESSOES } from "../src/memoria/storeSessao.js";
import {
  criarSessao,
  obterOuCriarSessao,
  prepararContextoRespondedor,
  registrarTurno,
} from "../src/memoria/gerenciadorSessao.js";
import { responderComoLuna } from "../src/responder/responderLuna.js";
import { compilarContexto } from "../src/contexto/compiladorContexto.js";
import { montarEntradasCompilador } from "../src/contexto/montarEntradasCompilador.js";
import type { ConfigLuna } from "../src/providers/tipos.js";
import type { PoliticaDecisao } from "../src/analyzers/esquema.js";
import type { DecisaoMemoria } from "../src/memoria/esquemaMemoria.js";

const DECISAO_NENHUMA: DecisaoMemoria = {
  acao: "ignorar",
  tipo: "fato_geral",
  conteudo: "",
  motivo: "teste",
};

const DECISAO_ARMAZENAR = (conteudo: string): DecisaoMemoria => ({
  acao: "armazenar",
  tipo: "fato_geral",
  conteudo,
  motivo: "teste",
});

const DECISAO_CONFIRMAR: DecisaoMemoria = {
  acao: "confirmar",
  tipo: "informacao_sensivel",
  conteudo: "Meu CPF é 123",
  motivo: "teste",
};

const CONFIG_TESTE: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost",
  modeloMenor: "modelo-menor-teste",
  modeloMaior: "modelo-maior-teste",
  temperaturaMenor: 0,
  temperaturaMaior: 0.7,
};

const ANALISE_CASUAL = JSON.stringify({
  intencao: "conversa_casual",
  complexidade: "baixa",
  nivel_risco: "nenhum",
  requer_markdown: false,
  requer_codigo: false,
  requer_ferramenta: false,
  requer_memoria: false,
  deve_perguntar_mais: false,
  confianca: 0.85,
  motivos: ["Saudação informal"],
});

const ANALISE_MEMORIA = JSON.stringify({
  intencao: "conversa_casual",
  complexidade: "baixa",
  nivel_risco: "nenhum",
  requer_markdown: false,
  requer_codigo: false,
  requer_ferramenta: false,
  requer_memoria: true,
  deve_perguntar_mais: false,
  confianca: 0.9,
  motivos: ["Usuário compartilhou informação pessoal"],
});

const POLITICA_CASUAL: PoliticaDecisao = {
  modo: "conversa_casual",
  acao: "responder",
  formato: "texto_simples",
  markdown_permitido: false,
  tom: "casual",
  autonomia: "sugerir",
  acao_memoria: "nenhuma",
  nivel_seguranca: "nenhum",
  diretrizes_ativas: [],
};

function criarProvedorEspiao(
  respostas: Record<string, string>,
  capturas: RequisicaoCompletacao[],
) {
  return {
    async completar(requisicao: RequisicaoCompletacao) {
      capturas.push(requisicao);
      const conteudo = respostas[requisicao.modelo] ?? respostas["*"] ?? "ok";
      return { conteudo, modelo: requisicao.modelo, latencia_ms: 1 };
    },
  };
}

describe("V1.1 — memória curta de sessão", () => {
  const arquivosTemp: string[] = [];

  afterEach(() => {
    for (const caminho of arquivosTemp) {
      if (existsSync(caminho)) rmSync(caminho, { force: true });
    }
    arquivosTemp.length = 0;
  });

  it("persiste turnos e reutiliza sessão por id", async () => {
    const provedor = criarProvedorMock({
      "modelo-menor-teste": ANALISE_CASUAL,
      "modelo-maior-teste": "Prazer, Ethan!",
    });

    const primeiro = await executarPipelineCompleto("Me chamo Ethan", {
      provedor,
      config: CONFIG_TESTE,
      usarNeuronioMemoriaLlm: false,
    });

    expect(primeiro.sessao?.id).toBeDefined();
    arquivosTemp.push(caminhoSessao(primeiro.sessao!.id));

    const segundo = await executarPipelineCompleto("Qual é meu nome?", {
      provedor,
      config: CONFIG_TESTE,
      sessaoId: primeiro.sessao!.id,
      usarNeuronioMemoriaLlm: false,
    });

    expect(segundo.sessao?.id).toBe(primeiro.sessao?.id);
    expect(segundo.sessao?.mensagens).toHaveLength(4);
    expect(segundo.sessao?.mensagens[0]?.conteudo).toBe("Me chamo Ethan");
    expect(segundo.sessao?.mensagens[1]?.conteudo).toBe("Prazer, Ethan!");
  });

  it("injeta histórico no respondedor em multi-turn", async () => {
    const capturas: RequisicaoCompletacao[] = [];
    const provedor = criarProvedorEspiao(
      {
        "modelo-menor-teste": ANALISE_CASUAL,
        "modelo-maior-teste": "Claro, Ethan!",
      },
      capturas,
    );

    const sessao = criarSessao();
    registrarTurno(sessao, "Me chamo Ethan", "Prazer!", DECISAO_NENHUMA);
    arquivosTemp.push(caminhoSessao(sessao.id));

    await executarPipelineCompleto("Qual é meu nome?", {
      provedor,
      config: CONFIG_TESTE,
      sessaoId: sessao.id,
      usarNeuronioMemoriaLlm: false,
    });

    const ultima = capturas.find((c) => c.modelo === "modelo-maior-teste");
    expect(ultima?.mensagens).toHaveLength(4);
    expect(ultima?.mensagens[1]?.conteudo).toBe("Me chamo Ethan");
    expect(ultima?.mensagens[2]?.conteudo).toBe("Prazer!");
    expect(ultima?.mensagens[3]?.conteudo).toBe("Qual é meu nome?");
  });

  it("armazena fato quando acao_memoria=armazenar", () => {
    const sessao = criarSessao();
    const atualizada = registrarTurno(
      sessao,
      "Prefiro respostas curtas",
      "Anotado!",
      DECISAO_ARMAZENAR("Prefiro respostas curtas"),
    );

    arquivosTemp.push(caminhoSessao(atualizada.id));
    expect(atualizada.fatos).toContain("Prefiro respostas curtas");
    expect(existsSync(caminhoSessao(atualizada.id))).toBe(true);

    const recarregada = carregarSessao(atualizada.id);
    expect(recarregada?.fatos).toContain("Prefiro respostas curtas");
  });

  it("não armazena fato quando acao_memoria=solicitar_confirmacao", () => {
    const sessao = criarSessao();
    const atualizada = registrarTurno(
      sessao,
      "Meu CPF é 123",
      "Preciso confirmar antes de guardar.",
      DECISAO_CONFIRMAR,
    );

    arquivosTemp.push(caminhoSessao(atualizada.id));
    expect(atualizada.fatos).toHaveLength(0);
  });

  it("inclui fatos no bloco de system do respondedor", async () => {
    const capturas: RequisicaoCompletacao[] = [];
    const provedor = criarProvedorEspiao({ "modelo-maior-teste": "ok" }, capturas);

    const sessao = criarSessao();
    registrarTurno(sessao, "Sou arquiteto de software", "Legal!", DECISAO_ARMAZENAR("Sou arquiteto de software"));
    arquivosTemp.push(caminhoSessao(sessao.id));

    const contexto = prepararContextoRespondedor(carregarSessao(sessao.id)!);
    const compilado = compilarContexto(
      montarEntradasCompilador({ politica: POLITICA_CASUAL, contextoSessao: contexto }),
    );
    await responderComoLuna(
      "O que você sabe sobre mim?",
      POLITICA_CASUAL,
      provedor,
      "modelo-maior-teste",
      0.7,
      compilado,
      contexto.historico,
    );

    const system = capturas[0]?.mensagens[0]?.conteudo ?? "";
    expect(system).toContain("Sou arquiteto de software");
  });

  it("inclui histórico nas mensagens de chat quando há turnos anteriores", async () => {
    const capturas: RequisicaoCompletacao[] = [];
    const provedor = criarProvedorEspiao({ "modelo-maior-teste": "ok" }, capturas);

    const sessao = criarSessao();
    registrarTurno(sessao, "Prefiro respostas curtas", "Ok!", DECISAO_NENHUMA);
    arquivosTemp.push(caminhoSessao(sessao.id));

    const contexto = prepararContextoRespondedor(carregarSessao(sessao.id)!);
    const compilado = compilarContexto(
      montarEntradasCompilador({ politica: POLITICA_CASUAL, contextoSessao: contexto }),
    );
    await responderComoLuna(
      "Lembra do que te contei?",
      POLITICA_CASUAL,
      provedor,
      "modelo-maior-teste",
      0.7,
      compilado,
      contexto.historico,
    );

    const system = capturas[0]?.mensagens[0]?.conteudo ?? "";
    expect(system).toContain("Luna");
    expect(capturas[0]?.mensagens).toHaveLength(4);
  });

  it("integra memória no pipeline quando preferência explícita", async () => {
    const provedor = criarProvedorMock({
      "modelo-menor-teste": ANALISE_MEMORIA,
      "modelo-maior-teste": "Entendi sua preferência.",
    });

    const resultado = await executarPipelineCompleto("Prefiro respostas curtas", {
      provedor,
      config: CONFIG_TESTE,
      usarNeuronioMemoriaLlm: false,
    });

    arquivosTemp.push(caminhoSessao(resultado.sessao!.id));
    expect(resultado.memoria?.decisao.acao).toBe("armazenar");
    expect(resultado.pipeline.politica.acao_memoria).toBe("armazenar");
    expect(resultado.sessao?.fatos).toContain("Prefiro respostas curtas");
  });

  it("obterOuCriarSessao cria nova se id inválido", () => {
    const sessao = obterOuCriarSessao("00000000-0000-4000-8000-000000000000");
    arquivosTemp.push(caminhoSessao(sessao.id));
    expect(sessao.mensagens).toHaveLength(0);
    expect(existsSync(join(PASTA_SESSOES, `${sessao.id}.json`))).toBe(false);
  });
});
