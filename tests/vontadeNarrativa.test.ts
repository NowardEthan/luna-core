import { describe, expect, it } from "vitest";
import { gerarVontadePosSessao } from "../src/mundo/vontade/geradorVontadePosSessao.js";
import {
  atualizarStatusVontade,
  listarVontadesAtivas,
  resetarVontadesParaTeste,
} from "../src/mundo/vontade/storeVontade.js";
import type { MemoriaSessao } from "../src/memoria/esquemaMemoria.js";

describe("pkg-v — vontade narrativa", () => {
  it("gera vontade pós-sessão e permite concluir", () => {
    resetarVontadesParaTeste();
    const sessaoFake: MemoriaSessao = {
      id: "sessao-teste",
      criada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
      mensagens: [
        { papel: "user", conteudo: "Quero retomar isso depois", timestamp: new Date().toISOString() },
      ],
      fatos: [],
      preferencias: {},
    };
    const vontade = gerarVontadePosSessao(sessaoFake);
    expect(vontade.status).toBe("ativa");
    expect(vontade.sessao_id).toBe("sessao-teste");
    const ativas = listarVontadesAtivas();
    expect(ativas.some((v) => v.id === vontade.id)).toBe(true);
    atualizarStatusVontade(vontade.id, "concluida");
    const restantes = listarVontadesAtivas();
    expect(restantes.some((v) => v.id === vontade.id)).toBe(false);
  });
});
