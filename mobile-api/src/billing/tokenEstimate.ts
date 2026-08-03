/**
 * Estimativa de tokens — a "carteira" da Luna. Reprecificada 2026-08 pro OpenRouter,
 * onde a conversa ficou MUITO mais barata que a calibração GLM antiga (~12,5k/turno).
 * Filosofia: chat = barato e generoso (o gancho grátis); as duas "lagostas" caras —
 * pesquisa profunda e geração de imagem — é que são medidas e pesam na carteira.
 */

export const TOKENS_POR_CARACTERE = 0.25;

/** Overhead fixo do pipeline Luna (roteamento + humor + contexto). A conversa é a "unidade" (~3k). */
export const CUSTO_PIPELINE = 3_000;
export const CUSTO_MINIMO_CHAT = 3_000;
export const MULTIPLICADOR_TEXTO_TURNO = 2.8;
/** Custo de ANALISAR uma imagem anexada (visão), NÃO de gerar — ver CUSTO_IMAGEM_GERADA. */
export const CUSTO_POR_IMAGEM = 2_500;
export const CUSTO_POR_DOCUMENTO = 4_000;
export const CUSTO_BASE_TRANSCRICAO = 800;

/** Lagosta 1 — cada imagem GERADA pela Luna (Seedream/Riverflow) custa ~10 conversas. */
export const CUSTO_IMAGEM_GERADA = 30_000;
/** Lagosta 2 — uma pesquisa profunda (dossiê web) custa ~5 conversas. */
export const CUSTO_PESQUISA_PROFUNDA = 15_000;

/** @deprecated Usar CUSTO_PIPELINE */
export const CUSTO_BASE_CHAT = CUSTO_PIPELINE;

export function estimarTokensDeTexto(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length * TOKENS_POR_CARACTERE));
}

export function estimarTokensChat(
  mensagemUsuario: string,
  respostaLuna: string,
  anexosImagem = 0,
): number {
  const texto =
    estimarTokensDeTexto(mensagemUsuario) + estimarTokensDeTexto(respostaLuna);
  return (
    CUSTO_PIPELINE +
    Math.ceil(texto * MULTIPLICADOR_TEXTO_TURNO) +
    anexosImagem * CUSTO_POR_IMAGEM
  );
}

export function estimarCustoMinimoChat(mensagemUsuario: string, anexosImagem = 0): number {
  return Math.max(
    CUSTO_MINIMO_CHAT,
    CUSTO_PIPELINE +
      Math.ceil(estimarTokensDeTexto(mensagemUsuario) * MULTIPLICADOR_TEXTO_TURNO) +
      anexosImagem * CUSTO_POR_IMAGEM,
  );
}

/** Tokens de entrada estimados (rate limit input/min do tier free Cerebras). */
export function estimarInputTokensChat(mensagemUsuario: string, anexosImagem = 0): number {
  return estimarTokensDeTexto(mensagemUsuario) + anexosImagem * 500;
}

/** Tokens API brutos (input + output) para contador diário do modo reduzido. */
export function estimarApiTokensChat(
  mensagemUsuario: string,
  respostaLuna: string,
  anexosImagem = 0,
): number {
  return estimarInputTokensChat(mensagemUsuario, anexosImagem) + estimarTokensDeTexto(respostaLuna);
}

export function estimarTokensVisao(quantidade: number): number {
  return Math.max(1, quantidade) * CUSTO_POR_IMAGEM;
}

export function estimarTokensDocumentos(quantidade: number): number {
  return Math.max(1, quantidade) * CUSTO_POR_DOCUMENTO;
}

export function estimarTokensTranscricao(texto: string): number {
  return CUSTO_BASE_TRANSCRICAO + estimarTokensDeTexto(texto);
}

/** Custo total das imagens geradas num turno (0 se nenhuma). */
export function estimarTokensImagensGeradas(quantidade: number): number {
  return Math.max(0, quantidade) * CUSTO_IMAGEM_GERADA;
}

/** Custo extra de uma pesquisa profunda que rodou de fato no turno. */
export function estimarTokensPesquisaProfunda(rodou: boolean): number {
  return rodou ? CUSTO_PESQUISA_PROFUNDA : 0;
}

/**
 * Pedido parece ser de DESENHAR (não «ver» anexo)? Reserva a lagosta no pré-cheque
 * pra não gastar Seedream/Riverflow e só descobrir depois que a carteira não aguentava.
 */
export function mensagemSugereGerarImagem(mensagem: string): boolean {
  const t = mensagem.trim();
  if (!t) return false;
  if (/\b(desenh\w+|ilustr\w+)\b/i.test(t)) return true;
  return /\b(cria\w*|crie|faz|fa[cç]a|gera\w*|gere|manda\w*|mande|quero)\b[^.?!\n]{0,40}\b(imagem|arte|ilustra|desenho|foto|logo|capa|wallpaper|pintura|poster|avatar|cena)\b/i.test(
    t,
  );
}

/** Tokens a reservar no pré-cheque quando o pedido cheira a geração de imagem. */
export function reservaTokensImagemSePedido(mensagem: string): number {
  return mensagemSugereGerarImagem(mensagem) ? CUSTO_IMAGEM_GERADA : 0;
}

/** Converte contadores legados (mensagens/tipos) para tokens. */
export function migrarContadoresLegados(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  if (typeof data.tokens === "number") return data.tokens;
  const messages = typeof data.messages === "number" ? data.messages : 0;
  const images = typeof data.images === "number" ? data.images : 0;
  const documents = typeof data.documents === "number" ? data.documents : 0;
  const voice = typeof data.voice === "number" ? data.voice : 0;
  return (
    messages * 12_500 +
    images * CUSTO_POR_IMAGEM +
    documents * CUSTO_POR_DOCUMENTO +
    voice * CUSTO_BASE_TRANSCRICAO
  );
}
