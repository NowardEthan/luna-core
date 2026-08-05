import { describe, expect, it } from "vitest";
import {
  blocosToMd,
  editarBlocoNaLista,
  inserirBlocosApos,
  mdToBlocos,
  normalizarDocumentoBlocos,
  novoIdBloco,
} from "./artefatoBlocos.js";

describe("artefatoBlocos", () => {
  it("round-trip headings, listas, todo, quote, code, hr", () => {
    const md = [
      "# Título",
      "",
      "Parágrafo um.",
      "",
      "## Cap 1",
      "",
      "- item a",
      "- [ ] tarefa",
      "- [x] feita",
      "",
      "1. um",
      "2. dois",
      "",
      "> citação",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "---",
      "",
      "Fim.",
      "",
    ].join("\n");

    const blocos = mdToBlocos(md);
    expect(blocos.some((b) => b.type === "heading" && b.props?.level === 1)).toBe(true);
    expect(blocos.some((b) => b.type === "todo" && b.props?.checked === true)).toBe(true);
    expect(blocos.some((b) => b.type === "code")).toBe(true);
    expect(blocos.some((b) => b.type === "divider")).toBe(true);

    const deVolta = blocosToMd(blocos);
    const outra = mdToBlocos(deVolta);
    expect(outra.map((b) => b.type)).toEqual(blocos.map((b) => b.type));
  });

  it("callouts com sabor: marcador e emoji viram callout com props.callout", () => {
    const porMarcador = mdToBlocos("> [!dica] Guarda o comprovante.");
    expect(porMarcador[0].type).toBe("callout");
    expect(porMarcador[0].props?.callout).toBe("dica");
    expect(porMarcador[0].text).toBe("Guarda o comprovante.");

    const porEmoji = mdToBlocos("> ⚠️ Isto apaga tudo.");
    expect(porEmoji[0].type).toBe("callout");
    expect(porEmoji[0].props?.callout).toBe("atencao");
    expect(porEmoji[0].text).toBe("Isto apaga tudo.");

    // Apelido amistoso + quote sem marcador continua quote.
    expect(mdToBlocos("> [!aviso] cuidado")[0].props?.callout).toBe("atencao");
    expect(mdToBlocos("> só uma citação")[0].type).toBe("quote");

    // Round-trip do callout preserva sabor.
    const md = blocosToMd(porMarcador);
    expect(md).toContain("> [!dica] Guarda o comprovante.");
    expect(mdToBlocos(md)[0].props?.callout).toBe("dica");
  });

  it("divisor rotulado round-trip", () => {
    const blocos = mdToBlocos("--- Parte 2 ---");
    expect(blocos[0].type).toBe("divider");
    expect(blocos[0].props?.label).toBe("Parte 2");
    expect(blocosToMd(blocos)).toContain("--- Parte 2 ---");
    // Divisor nu continua nu.
    expect(mdToBlocos("---")[0].props?.label).toBeUndefined();
  });

  it("normaliza legado MD pra schema 2", () => {
    const n = normalizarDocumentoBlocos({ conteudo: "## Olá\n\nMundo\n", schemaVersion: 1 });
    expect(n.schemaVersion).toBe(2);
    expect(n.blocos.length).toBeGreaterThanOrEqual(2);
    expect(n.conteudo).toContain("## Olá");
  });

  it("inserir e editar por id", () => {
    const a = { id: novoIdBloco(), type: "paragraph" as const, text: "A" };
    const b = { id: novoIdBloco(), type: "paragraph" as const, text: "B" };
    const lista = [a, b];
    const novo = { id: novoIdBloco(), type: "heading" as const, props: { level: 2 as const }, text: "Meio" };
    const comInsert = inserirBlocosApos(lista, a.id, [novo]);
    expect(comInsert.map((x) => x.text)).toEqual(["A", "Meio", "B"]);
    const editado = editarBlocoNaLista(comInsert, novo.id, { text: "Capítulo" });
    expect(editado?.find((x) => x.id === novo.id)?.text).toBe("Capítulo");
  });
});
