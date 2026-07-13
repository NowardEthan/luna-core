import { describe, expect, it } from "vitest";
import {
  criarCacheMundoVazio,
  executarComCacheMundo,
  registrarTarefaMundo,
} from "./contextoMundo.js";

/**
 * O furo mais silencioso do sono.
 *
 * O despertar (que escreve o diário e roda o sono) corre em SEGUNDO PLANO de propósito —
 * para não atrasar a primeira mensagem. Mas a descarga para o Firestore acontece assim
 * que o turno termina. Sem registar essa tarefa, a sequência era:
 *
 *   turno acaba → descarrega (nada de diário ainda) → despertar escreve o diário no
 *   cache → o pedido morre → o que ela escreveu evapora.
 *
 * Ela escreveria o diário todos os dias e nunca guardaria nenhum. Este teste trava o
 * registo da tarefa: é ele que faz a persistência esperar antes da descarga final.
 */
describe("tarefas em segundo plano (o que o sono escreve tem de sobreviver)", () => {
  it("a tarefa de fundo é registada no cache do turno", async () => {
    const cache = criarCacheMundoVazio("uid-ethan");

    await executarComCacheMundo(cache, async () => {
      // O que o pipeline faz com o despertar: não espera, mas regista.
      registrarTarefaMundo(Promise.resolve("sono terminou"));
    });

    expect(cache.tarefasPendentes).toHaveLength(1);
    await expect(cache.tarefasPendentes[0]).resolves.toBe("sono terminou");
  });

  it("quem persiste consegue esperar a tarefa ANTES de descarregar", async () => {
    const cache = criarCacheMundoVazio("uid-ethan");
    let escreveuDiario = false;

    await executarComCacheMundo(cache, async () => {
      registrarTarefaMundo(
        (async () => {
          // Simula o despertar: demora, e só então escreve.
          await new Promise((r) => setTimeout(r, 10));
          cache.autoRetrato = { texto: "Aprendi a dizer que não sei.", versao: 1, atualizado_em: "x" };
          cache.dirty.autoRetrato = true;
          escreveuDiario = true;
        })(),
      );
    });

    // Assim que o turno acaba, o trabalho de fundo ainda NÃO terminou:
    expect(escreveuDiario).toBe(false);

    // É por isso que a persistência espera antes da descarga final.
    await Promise.allSettled(cache.tarefasPendentes);

    expect(escreveuDiario).toBe(true);
    expect(cache.dirty.autoRetrato).toBe(true);
    expect(cache.autoRetrato?.texto).toContain("não sei");
  });
});
