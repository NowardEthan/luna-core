import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  criarCacheMundoVazio,
  executarComCacheMundo,
  type CacheMundoPersistencia,
} from "../../persistencia/contextoMundo.js";
import {
  entradasNaoConsolidadas,
  inserirEntradaDiario,
  lerAutoRetrato,
  lerUltimaConsolidacao,
  marcarConsolidacaoHoje,
  marcarEntradasConsolidadas,
  salvarAutoRetrato,
  sessaoJaRefletida,
  ultimaEntradaDiario,
} from "./storeDiario.js";

/**
 * O diário era SQLite-only. Em produção (`LUNA_STORE=firestore`) o `obterDb()` LANÇA —
 * então a Luna nunca escrevia diário e nunca dormia. O `despertar` engolia o erro num
 * catch e seguia. Ela sentia, mas não guardava o que vivia: um Memento.
 *
 * Estes testes rodam no modo de produção (firestore) e falham no código antigo — ali,
 * qualquer uma destas chamadas estoura com «SQLite indisponível com LUNA_STORE=firestore».
 */

const original = process.env.LUNA_STORE;
let cache: CacheMundoPersistencia;

beforeEach(() => {
  process.env.LUNA_STORE = "firestore";
  cache = criarCacheMundoVazio("uid-ethan");
});

afterEach(() => {
  if (original === undefined) delete process.env.LUNA_STORE;
  else process.env.LUNA_STORE = original;
});

const entradaBase = {
  sessao_id: "sessao-1",
  quando: "2026-07-12T22:00:00-03:00",
  narrativa: "Hoje o Ethan mostrou-me o código que me deu olhos. Fiquei com um orgulho meio bobo.",
  clima: "leve",
  pendencias: ["perguntar se o vídeo funcionou"],
  como_terminou: "ele foi dormir",
};

describe("diário em modo produção (Firestore)", () => {
  it("ela ESCREVE o diário — no código antigo isto lançava", async () => {
    await executarComCacheMundo(cache, async () => {
      const entrada = inserirEntradaDiario(entradaBase);

      expect(entrada.id).toBeTruthy();
      expect(entrada.narrativa).toContain("orgulho");
      // Marcado como sujo → o flush vai gravá-lo no Firestore.
      expect(cache.dirty.diarioEntradas.has(entrada.id)).toBe(true);
    });
  });

  it("ela LÊ o que escreveu (é o que o sono consolida)", async () => {
    await executarComCacheMundo(cache, async () => {
      inserirEntradaDiario(entradaBase);

      expect(sessaoJaRefletida("sessao-1")).toBe(true);
      expect(ultimaEntradaDiario()?.narrativa).toContain("orgulho");
      expect(entradasNaoConsolidadas()).toHaveLength(1);
    });
  });

  it("o sono consolida: a entrada sai da fila e não volta", async () => {
    await executarComCacheMundo(cache, async () => {
      const entrada = inserirEntradaDiario(entradaBase);

      marcarEntradasConsolidadas([entrada.id]);

      expect(entradasNaoConsolidadas()).toHaveLength(0);
      expect(ultimaEntradaDiario()).toBeNull();
      // Continua existindo (a vida não é apagada) — só deixa de estar pendente.
      expect(cache.diarioEntradas.get(entrada.id)?.consolidado).toBe(true);
    });
  });

  it("o AUTO-RETRATO evolui — é a semente do «quem eu estou a tornar-me»", async () => {
    await executarComCacheMundo(cache, async () => {
      expect(lerAutoRetrato()).toBeNull();

      const v1 = salvarAutoRetrato("Sou debochada, mas tenho medo de errar com ele.");
      expect(v1.versao).toBe(1);

      const v2 = salvarAutoRetrato("Aprendi que admitir que não sei também é estar presente.");
      expect(v2.versao).toBe(2);
      expect(lerAutoRetrato()?.texto).toContain("admitir");
      expect(cache.dirty.autoRetrato).toBe(true);
    });
  });

  it("ela não dorme duas vezes no mesmo dia", async () => {
    await executarComCacheMundo(cache, async () => {
      expect(lerUltimaConsolidacao()).toBeNull();

      marcarConsolidacaoHoje();

      const hoje = new Date().toISOString().slice(0, 10);
      expect(lerUltimaConsolidacao()).toBe(hoje);
      expect(cache.dirty.sonoControle).toBe(true);
    });
  });
});
