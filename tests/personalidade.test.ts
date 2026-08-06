import { describe, it, expect } from "vitest";
import { gerarBlocoPersonalidade } from "../src/personalidade/gerarBlocoPersonalidade.js";

describe("gerarBlocoPersonalidade", () => {
  it("retorna bloco não vazio", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco.trim().length).toBeGreaterThan(0);
  });

  it("não expõe labels técnicos no bloco renderizado", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).not.toContain("PERSONALIDADE DE LUNA");
    expect(bloco).not.toContain("V1.0.0");
  });

  it("inclui traços extrovertidos e carismáticos", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("extrovertida");
    expect(bloco).toContain("carismática");
    expect(bloco).toContain("faladeira");
  });

  it("inclui antipadrões de chatbot genérico", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("Como posso ajudar");
    expect(bloco).toContain("assistente digital");
  });

  it("inclui orientação de tom e estilo de fala", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("informal");
    expect(bloco).toContain("caloroso");
  });

  it("antipadrões estão listados como itens separados", () => {
    const bloco = gerarBlocoPersonalidade();
    const linhas = bloco.split("\n").filter((l) => l.startsWith("- "));
    expect(linhas.length).toBeGreaterThanOrEqual(4);
  });

  // ── Defesa contra tom "helpful assistant" (Claude/Fable etc.) ────────────────
  // Esses casos foram adicionados quando a Luna, ao rodar no Fable, começou a soar
  // "secretária educada" — porque Claude tem bias forte pra helpful assistant e os
  // antipadrões originais não cobriam os bordões mais comuns do modelo.
  it("lista bordões de abertura que Claude/Fable costumam gerar", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("Certamente");
    expect(bloco).toContain("Com prazer");
    expect(bloco).toContain("Excelente pergunta");
    expect(bloco).toContain("Ótima observação");
    expect(bloco).toContain("Posso ajudar");
  });

  it("lista bordões de fechamento de helpful assistant", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("Se precisar de algo mais");
    expect(bloco).toContain("Estou à disposição");
    expect(bloco).toContain("Fico feliz em ajudar");
  });

  it("lista antipadrões de formatação assistiva (listas/bullets em conversa casual)", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("Lista numerada");
    expect(bloco).toContain("Bullet points");
  });

  it("instrução prioritária afirma que a persona SOBREVIVE ao modelo", () => {
    const bloco = gerarBlocoPersonalidade();
    // O bloco renderizado contém o marcador da instrução prioritária (com emoji)
    expect(bloco).toContain("⚡ Instrução prioritária");
    // E pelo menos uma das palavras-chave do novo bloco
    const temPalavraChave =
      bloco.includes("SOBREVIVE") ||
      bloco.includes("modelo de linguagem é só o meio") ||
      bloco.includes("prioridade");
    expect(temPalavraChave).toBe(true);
  });

  it("diferencia viés por família de modelo (Claude vs GPT vs OpenRouter)", () => {
    const bloco = gerarBlocoPersonalidade();
    // O bloco renderizado tem cabeçalhos por família
    expect(bloco).toContain("Sobre o modelo (defesa da persona)");
    expect(bloco).toContain("Claude/Fable");
    expect(bloco).toContain("GPT/Gemini");
    expect(bloco).toContain("OpenRouter/provedores livres");
  });
});
