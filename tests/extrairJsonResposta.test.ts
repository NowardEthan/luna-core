import { describe, expect, it } from "vitest";
import {
  extrairJsonResposta,
  isProvedorLocal,
  usarJsonEstritoOpenAi,
} from "../src/providers/extrairJsonResposta.js";

describe("extrairJsonResposta", () => {
  it("parseia JSON puro", () => {
    expect(extrairJsonResposta('{"acao":"ignorar"}')).toEqual({ acao: "ignorar" });
  });

  it("extrai JSON de bloco markdown", () => {
    const raw = 'Aqui vai:\n```json\n{"intencao":"pedido_codigo"}\n```';
    expect(extrairJsonResposta(raw)).toEqual({ intencao: "pedido_codigo" });
  });

  it("extrai JSON embebido em texto", () => {
    const raw = 'Claro! {"intencao":"conversa_casual","complexidade":"baixa"} — pronto.';
    expect(extrairJsonResposta(raw)).toMatchObject({ intencao: "conversa_casual" });
  });
});

describe("usarJsonEstritoOpenAi", () => {
  it("desliga json_object em LM Studio local", () => {
    expect(isProvedorLocal("http://localhost:1234/v1")).toBe(true);
    expect(usarJsonEstritoOpenAi("http://localhost:1234/v1")).toBe(false);
  });

  it("mantém json_object na Groq", () => {
    expect(usarJsonEstritoOpenAi("https://api.groq.com/openai/v1")).toBe(true);
  });
});
