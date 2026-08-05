import { describe, expect, it, vi } from "vitest";

import { anotarCanone } from "../src/ferramentas/maosDosDocumentos.js";

describe("anotar_canone CRUD", () => {
  it("adiciona um fato sem reescrever a lista", async () => {
    const editarDocumento = vi.fn(async ({ canone }: { canone?: string }) => ({
      id: "d1",
      titulo: "Livro",
      canone: canone ?? "",
    }));
    const lerDocumento = vi.fn(async () => ({
      id: "d1",
      titulo: "Livro",
      conteudo: "",
      canone: "Marina: 30 anos",
    }));

    const out = await anotarCanone(
      { editarDocumento, lerDocumento },
      { id: "d1", acao: "adicionar", fato: "Pedro: irmão dela" },
    );

    expect(editarDocumento).toHaveBeenCalledWith({
      id: "d1",
      canone: "Marina: 30 anos\nPedro: irmão dela",
    });
    expect(out).toMatch(/Fato adicionado/);
    expect(out).toMatch(/1\. Marina/);
    expect(out).toMatch(/2\. Pedro/);
  });

  it("edita por número", async () => {
    const editarDocumento = vi.fn(async ({ canone }: { canone?: string }) => ({
      id: "d1",
      titulo: "Livro",
      canone: canone ?? "",
    }));
    const lerDocumento = vi.fn(async () => ({
      id: "d1",
      titulo: "Livro",
      conteudo: "",
      canone: "Marina: 30\nPedro: irmão",
    }));

    const out = await anotarCanone(
      { editarDocumento, lerDocumento },
      { id: "d1", acao: "editar", numero: 1, fato_novo: "Marina: 31 anos" },
    );

    expect(editarDocumento).toHaveBeenCalledWith({
      id: "d1",
      canone: "Marina: 31 anos\nPedro: irmão",
    });
    expect(out).toMatch(/editado/);
  });

  it("apaga por fato parcial", async () => {
    const editarDocumento = vi.fn(async ({ canone }: { canone?: string }) => ({
      id: "d1",
      titulo: "Livro",
      canone: canone ?? "",
    }));
    const lerDocumento = vi.fn(async () => ({
      id: "d1",
      titulo: "Livro",
      conteudo: "",
      canone: "Marina: 30\nPedro: irmão",
    }));

    const out = await anotarCanone(
      { editarDocumento, lerDocumento },
      { id: "d1", acao: "apagar", fato: "Pedro" },
    );

    expect(editarDocumento).toHaveBeenCalledWith({
      id: "d1",
      canone: "Marina: 30",
    });
    expect(out).toMatch(/removido/);
  });

  it("legado: só notas = substituir", async () => {
    const editarDocumento = vi.fn(async ({ canone }: { canone?: string }) => ({
      id: "d1",
      titulo: "Livro",
      canone: canone ?? "",
    }));
    const lerDocumento = vi.fn(async () => ({
      id: "d1",
      titulo: "Livro",
      conteudo: "",
      canone: "velho",
    }));

    await anotarCanone(
      { editarDocumento, lerDocumento },
      { id: "d1", notas: "A\nB" },
    );

    expect(editarDocumento).toHaveBeenCalledWith({ id: "d1", canone: "A\nB" });
  });
});
