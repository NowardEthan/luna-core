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

const MAX_BASE64_PREVIEW = 24;

function resumoFallbackImagem(imagem: AnexoImagemChat): string {
  const nome = imagem.nome?.trim() || "imagem sem nome";
  const mime = imagem.mimeType?.trim() || "mime desconhecido";
  const assinatura = imagem.imageBase64.slice(0, MAX_BASE64_PREVIEW);
  return `Recebi ${nome} (${mime}). Assinatura base64: ${assinatura}…`;
}

/**
 * Especialista de visão (stub/mock friendly).
 * - Em produção, injeta `descreverImagem` para ligar em um modelo multimodal.
 * - Em testes, funciona com fallback determinístico.
 */
export async function visaoGemma(
  entrada: EntradaVisaoGemma,
  deps: DependenciasVisaoGemma = {},
): Promise<string> {
  if (!entrada.imagens.length) {
    return "Nenhuma imagem disponível para análise.";
  }

  const descricoes: string[] = [];
  for (const imagem of entrada.imagens) {
    if (deps.descreverImagem) {
      const texto = await deps.descreverImagem({ imagem, pergunta: entrada.pergunta });
      descricoes.push(texto.trim() || resumoFallbackImagem(imagem));
      continue;
    }
    descricoes.push(resumoFallbackImagem(imagem));
  }

  return descricoes.join("\n\n");
}
