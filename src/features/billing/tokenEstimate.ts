/** Estimativa de tokens — espelha mobile-api, calibrada com logs GLM (~12,5k/turno). */

export const TOKENS_POR_CARACTERE = 0.25;

export const CUSTO_PIPELINE = 8_000;
export const CUSTO_MINIMO_CHAT = 8_000;
export const MULTIPLICADOR_TEXTO_TURNO = 2.8;
export const CUSTO_POR_IMAGEM = 2_500;
export const CUSTO_POR_DOCUMENTO = 4_000;
export const CUSTO_BASE_TRANSCRICAO = 800;

export function estimarTokensDeTexto(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length * TOKENS_POR_CARACTERE));
}

export function estimarCustoMinimoChat(mensagemUsuario: string, anexosImagem = 0): number {
  return Math.max(
    CUSTO_MINIMO_CHAT,
    CUSTO_PIPELINE +
      Math.ceil(estimarTokensDeTexto(mensagemUsuario) * MULTIPLICADOR_TEXTO_TURNO) +
      anexosImagem * CUSTO_POR_IMAGEM,
  );
}

export function estimarTokensVisao(quantidade: number): number {
  return Math.max(1, quantidade) * CUSTO_POR_IMAGEM;
}

export function estimarTokensDocumentos(quantidade: number): number {
  return Math.max(1, quantidade) * CUSTO_POR_DOCUMENTO;
}

export function estimarTokensTranscricao(): number {
  return CUSTO_BASE_TRANSCRICAO;
}

/** Converte contadores legados (mensagens/tipos) para tokens. */
export function migrarContadoresLegados(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  if (typeof data.tokens === 'number') return data.tokens;
  const messages = typeof data.messages === 'number' ? data.messages : 0;
  const images = typeof data.images === 'number' ? data.images : 0;
  const documents = typeof data.documents === 'number' ? data.documents : 0;
  const voice = typeof data.voice === 'number' ? data.voice : 0;
  return (
    messages * 12_500 +
    images * CUSTO_POR_IMAGEM +
    documents * CUSTO_POR_DOCUMENTO +
    voice * CUSTO_BASE_TRANSCRICAO
  );
}
