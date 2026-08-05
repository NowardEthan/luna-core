import { describe, expect, it, vi } from "vitest";
import { inserirBlocosDocumento } from "../src/ferramentas/maosDosDocumentos.js";
import { mdToBlocos, blocosToMd } from "../src/ferramentas/artefatoBlocos.js";

describe("inserir_blocos com after_secao", () => {
  it("insere no fim da seção pedida (não logo após o heading)", async () => {
    const md =
      "## Cap 1\n\nTexto do um.\n\n## Cap 2\n\nTexto do dois.\n\n## Cap 3\n\nTexto do tres.\n";
    const blocos = mdToBlocos(md);
    const editarDocumento = vi.fn(async (dados: { conteudo?: string; blocos?: unknown }) => {
      return { id: "doc1", titulo: "Livro" };
    });
    const lerDocumento = vi.fn(async () => ({
      id: "doc1",
      titulo: "Livro",
      conteudo: md,
      blocos,
      schemaVersion: 2,
    }));

    const resultado = await inserirBlocosDocumento(
      { lerDocumento, editarDocumento },
      {
        id: "doc1",
        after_secao: "2",
        markdown: "### Novo\n\nParágrafo novo no cap 2.",
      },
    );

    expect(resultado).not.toMatch(/^ERRO/);
    expect(resultado).toMatch(/seção 2/i);
    expect(editarDocumento).toHaveBeenCalled();
    const salvo = editarDocumento.mock.calls[0]![0] as { conteudo: string };
    const corpo = salvo.conteudo;
    // Cap 2, depois o novo, depois Cap 3
    const i2 = corpo.indexOf("## Cap 2");
    const iNovo = corpo.indexOf("### Novo");
    const i3 = corpo.indexOf("## Cap 3");
    expect(i2).toBeGreaterThan(-1);
    expect(iNovo).toBeGreaterThan(i2);
    expect(i3).toBeGreaterThan(iNovo);
    // O texto antigo do cap 2 continua ANTES do novo
    expect(corpo.indexOf("Texto do dois")).toBeLessThan(iNovo);
  });

  it("aceita título da seção em after_secao", async () => {
    const md = "## Intro\n\nOi.\n\n## Epílogo\n\nFim parcial.\n";
    const blocos = mdToBlocos(md);
    const editarDocumento = vi.fn(async () => ({ id: "d", titulo: "T" }));
    const lerDocumento = vi.fn(async () => ({
      id: "d",
      titulo: "T",
      conteudo: md,
      blocos,
      schemaVersion: 2,
    }));

    const r = await inserirBlocosDocumento(
      { lerDocumento, editarDocumento },
      { id: "d", after_secao: "Epílogo", markdown: "Mais uma linha." },
    );
    expect(r).not.toMatch(/^ERRO/);
    const salvo = editarDocumento.mock.calls[0]![0] as { conteudo: string };
    expect(salvo.conteudo).toContain("Fim parcial");
    expect(salvo.conteudo).toContain("Mais uma linha");
    expect(blocosToMd(mdToBlocos(salvo.conteudo))).toContain("Epílogo");
  });
});
