import { describe, test, expect, beforeEach } from "vitest";
import {
  enfileirar,
  obterFila,
  proximaSolicitacao,
  limparExpiradas,
  limparFila,
} from "../src/presenca/filaPresenca.js";

describe("Fila de Presença V2.4", () => {
  beforeEach(() => {
    limparFila();
  });

  test("deve enfileirar solicitações e ordenar por timestamp (mais antigo primeiro)", () => {
    enfileirar({
      id: "req-1",
      ambiente: "desktop",
      prioridade: "normal",
      timestamp: new Date(Date.now() - 1000).toISOString(),
    });
    enfileirar({
      id: "req-2",
      ambiente: "api",
      prioridade: "normal",
      timestamp: new Date(Date.now() - 5000).toISOString(),
    });

    const fila = obterFila();
    expect(fila.length).toBe(2);
    expect(fila[0].id).toBe("req-2"); // req-2 é mais antigo
    expect(fila[1].id).toBe("req-1");
  });

  test("prioridade urgente fura a fila de solicitações normais", () => {
    enfileirar({
      id: "req-1",
      ambiente: "desktop",
      prioridade: "normal",
      timestamp: new Date(Date.now() - 5000).toISOString(),
    });
    enfileirar({
      id: "req-2",
      ambiente: "api",
      prioridade: "urgente",
      timestamp: new Date(Date.now() - 1000).toISOString(),
    });

    const fila = obterFila();
    expect(fila[0].id).toBe("req-2"); // urgente fica na frente, mesmo sendo mais recente
    expect(fila[1].id).toBe("req-1");
  });

  test("deve descartar solicitações expiradas", () => {
    const agora = Date.now();
    enfileirar({
      id: "req-1",
      ambiente: "desktop",
      prioridade: "normal",
      timestamp: new Date(agora - 5000).toISOString(),
      expirar_em: new Date(agora - 1000).toISOString(), // expirou
    });
    enfileirar({
      id: "req-2",
      ambiente: "api",
      prioridade: "normal",
      timestamp: new Date(agora - 2000).toISOString(),
      expirar_em: new Date(agora + 10000).toISOString(), // válido
    });

    limparExpiradas();
    const fila = obterFila();
    expect(fila.length).toBe(1);
    expect(fila[0].id).toBe("req-2");
  });

  test("proximaSolicitacao deve retornar o topo e limpar as expiradas no processo", () => {
    const agora = Date.now();
    enfileirar({
      id: "req-1",
      ambiente: "desktop",
      prioridade: "urgente",
      timestamp: new Date(agora - 5000).toISOString(),
      expirar_em: new Date(agora - 1000).toISOString(), // expirou
    });
    enfileirar({
      id: "req-2",
      ambiente: "api",
      prioridade: "urgente",
      timestamp: new Date(agora - 2000).toISOString(),
      expirar_em: new Date(agora + 10000).toISOString(), // válido
    });

    const proxima = proximaSolicitacao();
    expect(proxima?.id).toBe("req-2"); // req-1 foi filtrada antes
    expect(obterFila().length).toBe(0);
  });
});
