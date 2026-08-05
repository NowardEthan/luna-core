import { describe, expect, it } from "vitest";
import {
  chaveLeituraSecao,
  criarGuardaLeituraSecao,
  ehEscritaArtefato,
  ehLeituraSecao,
} from "../src/agente/guardaLeituraSecao.js";
import { executorAgentico } from "../src/agente/executorAgentico.js";
import type { ConfigLuna } from "../src/providers/tipos.js";
import { vi } from "vitest";

describe("guardaLeituraSecao", () => {
  it("chave normaliza acento e caixa", () => {
    const a = chaveLeituraSecao({ id: "d1", secao: "Capítulo 1" });
    const b = chaveLeituraSecao({ id: "d1", secao: "capitulo 1" });
    expect(a?.chave).toBe(b?.chave);
  });

  it("bloqueia releitura da mesma seção", () => {
    const g = criarGuardaLeituraSecao();
    expect(g.tentarBloquear({ id: "d1", secao: "1" })).toBeNull();
    g.registrarLeituraOk({ id: "d1", secao: "1" });
    const bloqueio = g.tentarBloquear({ id: "d1", secao: "1" });
    expect(bloqueio).toMatch(/PARADA \(anti-loop\)/);
    expect(bloqueio).toMatch(/JÁ leu/);
  });

  it("bloqueia ping-pong 1↔2", () => {
    const g = criarGuardaLeituraSecao();
    g.registrarLeituraOk({ id: "d1", secao: "1" });
    g.registrarLeituraOk({ id: "d1", secao: "2" });
    const bloqueio = g.tentarBloquear({ id: "d1", secao: "1" });
    expect(bloqueio).toMatch(/alternando seções/);
  });

  it("bloqueia 3ª seção distinta sem escrita", () => {
    const g = criarGuardaLeituraSecao();
    g.registrarLeituraOk({ id: "d1", secao: "1" });
    g.registrarLeituraOk({ id: "d1", secao: "2" });
    const bloqueio = g.tentarBloquear({ id: "d1", secao: "3" });
    expect(bloqueio).toMatch(/já leu 2 seções/);
  });

  it("após escrita, permite releitura da mesma seção (auditoria)", () => {
    const g = criarGuardaLeituraSecao();
    g.registrarLeituraOk({ id: "d1", secao: "1" });
    expect(g.tentarBloquear({ id: "d1", secao: "1" })).toMatch(/PARADA/);
    g.aposEscrita({ id: "d1" });
    expect(g.tentarBloquear({ id: "d1", secao: "1" })).toBeNull();
  });

  it("helpers de nome", () => {
    expect(ehLeituraSecao("ler_secao")).toBe(true);
    expect(ehEscritaArtefato("inserir_blocos")).toBe(true);
    expect(ehEscritaArtefato("ler_secao")).toBe(false);
  });
});

describe("executorAgentico + anti-loop ler_secao", () => {
  const CONFIG: ConfigLuna = {
    apiKey: "test",
    baseUrl: "http://localhost:1234/v1",
    modeloMenor: "m",
    modeloMaior: "M",
    temperaturaMenor: 0,
    temperaturaMaior: 0.5,
  };

  it("não chama a mão de novo ao repetir a mesma seção", async () => {
    let rodada = 0;
    const toolExecutor = vi.fn().mockResolvedValue(
      "Artefato «X» (id: d1) — seção 1 «Um» (~10 palavras), só este pedaço:\n\ntexto",
    );
    const provedor = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockImplementation(async () => {
        rodada++;
        if (rodada === 1 || rodada === 2) {
          return {
            chamadas: [
              {
                id: `c${rodada}`,
                nome: "ler_secao",
                argumentos: { id: "d1", secao: "1" },
              },
            ],
            modelo: CONFIG.modeloMaior,
            latencia_ms: 1,
          };
        }
        return { conteudo: "Ok, paro.", modelo: CONFIG.modeloMaior, latencia_ms: 1 };
      }),
    };

    const resultado = await executorAgentico({
      mensagemUsuario: "continua o livro",
      systemPrompt: "sys",
      ferramentas: [],
      toolExecutor,
      provedor: provedor as never,
      config: CONFIG,
      maxRodadas: 5,
    });

    expect(toolExecutor).toHaveBeenCalledTimes(1);
    expect(resultado.passos[1]?.sucesso).toBe(false);
    expect(resultado.passos[1]?.resultado).toMatch(/PARADA \(anti-loop\)/);
  });
});
