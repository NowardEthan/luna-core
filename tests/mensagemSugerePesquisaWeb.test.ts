import { describe, expect, it } from "vitest";
import { mensagemSugerePesquisaWeb } from "../src/pipeline/executarPipelineCompleto.js";

describe("mensagemSugerePesquisaWeb", () => {
  it("não marca papo casual (evita forçar agêntico / TTFT)", () => {
    expect(mensagemSugerePesquisaWeb("oi")).toBe(false);
    expect(mensagemSugerePesquisaWeb("kk")).toBe(false);
    expect(mensagemSugerePesquisaWeb("tudo bem?")).toBe(false);
    expect(mensagemSugerePesquisaWeb("lembra do plano?")).toBe(false);
  });

  it("marca pedidos explícitos de busca / notícia", () => {
    expect(mensagemSugerePesquisaWeb("pesquisa o preço do dólar")).toBe(true);
    expect(mensagemSugerePesquisaWeb("busca notícias sobre o lançamento")).toBe(true);
    expect(mensagemSugerePesquisaWeb("quem ganhou o jogo ontem?")).toBe(true);
    expect(mensagemSugerePesquisaWeb("google isso pra mim")).toBe(true);
  });
});
