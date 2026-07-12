import {
  descreverImagemOpenRouter,
  visaoOpenRouterDisponivel,
} from "./descreverImagemOpenRouter.js";

export type AnexoImagemChat = {
  id: string;
  nome?: string;
  mimeType?: string;
  imageBase64: string;
};

export type EntradaVisaoGemma = {
  imagens: AnexoImagemChat[];
  pergunta?: string;
};

export type DependenciasVisaoGemma = {
  descreverImagem?: (entrada: { imagem: AnexoImagemChat; pergunta?: string }) => Promise<string>;
};

/**
 * Sem olhos, a resposta tem de ser HONESTA. O fallback antigo devolvia o nome do
 * ficheiro e um pedaço do base64 ("Assinatura base64: /9j/4AAQ…") — e a Luna, sem
 * saber que aquilo não era uma descrição, chutava o resto ("deve ser um salgadinho").
 * Agora ela recebe um "não consegui ver" claro e diz isso ao Ethan.
 */
function semVisaoDisponivel(imagem: AnexoImagemChat): string {
  const nome = imagem.nome?.trim() || "a imagem";
  return `NÃO consegui analisar ${nome}: o modelo de visão não está disponível agora. Diga isso claramente ao usuário e NÃO tente adivinhar o conteúdo da imagem.`;
}

/**
 * Especialista de visão.
 * - Produção: usa o modelo multimodal do OpenRouter (ou o `descreverImagem` injetado).
 * - Testes: injeta `descreverImagem` e nada sai para a rede.
 */
export async function visaoGemma(
  entrada: EntradaVisaoGemma,
  deps: DependenciasVisaoGemma = {},
): Promise<string> {
  if (!entrada.imagens.length) {
    return "Nenhuma imagem disponível para análise.";
  }

  const descrever =
    deps.descreverImagem ??
    (visaoOpenRouterDisponivel() ? descreverImagemOpenRouter : undefined);

  const descricoes: string[] = [];
  for (const imagem of entrada.imagens) {
    if (!descrever) {
      descricoes.push(semVisaoDisponivel(imagem));
      continue;
    }
    try {
      const texto = await descrever({ imagem, pergunta: entrada.pergunta });
      descricoes.push(texto.trim() || semVisaoDisponivel(imagem));
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      descricoes.push(
        `NÃO consegui analisar ${imagem.nome?.trim() || "a imagem"} (${motivo}). Diga isso ao usuário e NÃO adivinhe o conteúdo.`,
      );
    }
  }

  return descricoes.join("\n\n");
}
