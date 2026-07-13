import { describe, expect, it, vi } from "vitest";
import {
  escolherTrechos,
  fatiar,
  lerDocumento,
  mapaDoDocumento,
  type AnexoDocumentoChat,
} from "./leitorDocumento.js";

/**
 * O desenho antigo colava o documento INTEIRO dentro da mensagem. Um PDF de 110 páginas
 * (~300k chars) era cortado a meio pelo servidor — e a Luna respondia com confiança total
 * sobre um arquivo do qual tinha perdido 90%, sem saber que o tinha perdido.
 *
 * Aqui o documento fica FORA da cabeça dela e ela vai buscar o que precisa. O que estes
 * testes travam é isso: ela paga pelo que lê, e sabe o tamanho do que não leu.
 */

function documentoLongo(): AnexoDocumentoChat {
  const capitulos = [
    "# Introdução\nEste documento trata da governança da Luna.",
    "# Affective Core\nO sentimento da Luna não seria apenas narrado. Ele seria computado, persistido e causal.",
    "# Proteções\nProteção contra crueldade simulada e apagamento irresponsável.",
  ];
  // Enche cada capítulo até passar do limite de uma parte, forçando a divisão.
  const texto = capitulos
    .map((cap) => `${cap}\n\n${"Texto de enchimento para dar volume ao capítulo. ".repeat(150)}`)
    .join("\n\n");

  return { id: "doc-1", nome: "Luna_Origin.pdf", texto, paginas: 11 };
}

describe("leitor de documentos (ela lê por partes, e sabe o que não leu)", () => {
  it("fatia um documento longo em partes", () => {
    const partes = fatiar(documentoLongo().texto);
    expect(partes.length).toBeGreaterThan(1);
  });

  it("o mapa mostra o tamanho e o sumário — ela vê o que existe antes de ler", () => {
    const mapa = mapaDoDocumento(documentoLongo());

    expect(mapa).toContain("Luna_Origin.pdf");
    expect(mapa).toContain("11 páginas");
    expect(mapa).toContain("Sumário");
    expect(mapa).toContain("Affective Core");
  });

  it("a pergunta escolhe os trechos — o documento inteiro NÃO vai ao modelo", () => {
    const partes = fatiar(documentoLongo().texto);
    const trechos = escolherTrechos(partes, "o que ele diz sobre sentimentos e affective core?");

    expect(trechos.length).toBeLessThanOrEqual(3);
    expect(trechos.some((t) => t.texto.includes("Affective Core"))).toBe(true);
  });

  it("responde à pergunta citando a parte, e diz que há mais no arquivo", async () => {
    const responderSobreTrechos = vi
      .fn()
      .mockResolvedValue("Na parte 2 ele escreve que o sentimento seria «computado, persistido e causal».");

    const resposta = await lerDocumento(
      { documento: documentoLongo(), pergunta: "o que diz sobre sentimentos?" },
      { responderSobreTrechos },
    );

    expect(responderSobreTrechos).toHaveBeenCalledOnce();
    expect(resposta).toContain("computado, persistido e causal");
    // A honestidade sobre o que ficou por ler é o ponto todo.
    expect(resposta).toMatch(/lido: parte\(s\) .* de \d+/);
  });

  it("sem pergunta, devolve o mapa — é o que ela deve pedir primeiro", async () => {
    const resposta = await lerDocumento({ documento: documentoLongo() });
    expect(resposta).toContain("parte(s) de leitura");
  });

  it("uma parte específica vem crua, sem gastar modelo", async () => {
    const responderSobreTrechos = vi.fn();

    const resposta = await lerDocumento(
      { documento: documentoLongo(), parte: 1 },
      { responderSobreTrechos },
    );

    expect(responderSobreTrechos).not.toHaveBeenCalled();
    expect(resposta).toContain("parte 1 de");
    expect(resposta).toContain("Introdução");
  });

  it("parte que não existe: diz quantas há, não inventa", async () => {
    const resposta = await lerDocumento({ documento: documentoLongo(), parte: 99 });
    expect(resposta).toContain("não existe");
  });

  it("documento vazio: manda dizer que não leu, e NÃO adivinhar", async () => {
    const resposta = await lerDocumento({
      documento: { id: "x", nome: "vazio.pdf", texto: "   " },
    });
    expect(resposta).toContain("NÃO consegui ler");
    expect(resposta).toContain("NÃO adivinhe");
  });
});
