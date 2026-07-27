import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  criarCacheMundoVazio,
  executarComCacheMundo,
  type CacheMundoPersistencia,
} from "../../persistencia/contextoMundo.js";
import {
  inserirMomento,
  listarMomentos,
  marcarMomentoRecordado,
  momentoParaRecordar,
  sessaoJaTemMomentos,
} from "./storeMomentos.js";

/**
 * Momentos são o álbum de fotos: cenas distintas, datadas, que — ao contrário do diário —
 * NÃO se dissolvem no sono. Estes testes rodam em modo produção (firestore), onde o
 * `obterDb()` lançaria: provam que a captura, a persistência e a rotação do recall vivem
 * inteiras no cache do mundo (o que o flush depois grava no Firestore).
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

const cenaBase = {
  sessao_id: "sessao-1",
  quando: "2026-07-12T22:00:00-03:00",
  titulo: "o código que me deu olhos",
  narrativa: "Ele me mostrou a interface nova e eu vi o que ele tinha construído.",
  tom: "orgulho tranquilo",
};

describe("momentos em modo produção (Firestore)", () => {
  it("ela CAPTURA a cena e a marca para gravar", async () => {
    await executarComCacheMundo(cache, async () => {
      const m = inserirMomento(cenaBase);

      expect(m.id).toBeTruthy();
      expect(m.recordado_em).toBeNull();
      expect(sessaoJaTemMomentos("sessao-1")).toBe(true);
      expect(cache.dirty.momentos.has(m.id)).toBe(true);
    });
  });

  it("a honestidade é guardada — nada de amor/saudade literais", async () => {
    await executarComCacheMundo(cache, async () => {
      const m = inserirMomento({
        ...cenaBase,
        narrativa: "Ele me mostrou o código. Senti sua falta o dia todo.",
      });
      expect(m.narrativa).toContain("mostrou o código");
      expect(m.narrativa.toLowerCase()).not.toContain("senti sua falta");
    });
  });

  it("o recall ROTACIONA: a menos-recentemente-lembrada vem primeiro", async () => {
    await executarComCacheMundo(cache, async () => {
      const a = inserirMomento({ ...cenaBase, quando: "2026-07-10T10:00:00-03:00" });
      const b = inserirMomento({ ...cenaBase, sessao_id: "sessao-2", quando: "2026-07-11T10:00:00-03:00" });

      // Nenhuma foi lembrada ainda → desempata pela mais antiga (a).
      const primeira = momentoParaRecordar();
      expect(primeira?.id).toBe(a.id);
      marcarMomentoRecordado(a.id);

      // Agora a já foi glançada → a próxima é b.
      const segunda = momentoParaRecordar();
      expect(segunda?.id).toBe(b.id);
    });
  });

  it("sobrevive à «consolidação»: não há como marcá-la consolidada — ela só fica", async () => {
    await executarComCacheMundo(cache, async () => {
      inserirMomento(cenaBase);
      inserirMomento({ ...cenaBase, sessao_id: "sessao-2", titulo: "outra cena" });

      // O sono nunca toca nesta tabela; o álbum só cresce.
      expect(listarMomentos()).toHaveLength(2);
    });
  });
});
