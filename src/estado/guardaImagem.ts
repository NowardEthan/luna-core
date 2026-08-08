/**
 * Guarda contra confabulação de imagem.
 *
 * O plano Grátis roda no cérebro leve (Flash): ele CHAMA `gerar_imagem` (o loading
 * aparece), às vezes a geração falha ou volta sem URL, e mesmo assim narra
 * «prontinho, mandei». Prompt não conserta — conferimos o facto objetivo:
 * alegou ter mandado/desenhado E nenhuma imagem com URL real nasceu neste turno.
 *
 * Kill-switch: `LUNA_GUARDA_IMAGEM=0`.
 */

/** A resposta afirma ter ENVIADO/DESENHADO uma imagem de verdade? */
const ALEGA_IMAGEM =
  /\b(desenhei|desenh[aá]mos|gerei|ger[aá]mos|criei (a |uma )?(imagem|arte|ilustra[cç][aã]o|desenho)|mande[ei]|enviei|aqui est[aá] (a |sua |tua )?(imagem|arte|ilustra[cç][aã]o|desenho)|prontinh[oa].{0,40}(imagem|arte|desenho|ilustra)|a imagem (j[aá] )?(est[aá]|saiu|ficou)|olha (a |essa |esta )?(imagem|arte|ilustra))\b/i;

/**
 * O pedido dele pedia desenho/imagem?
 * Cobre «desenha um gato» (sem a palavra imagem) e «gera uma imagem de…».
 * Evita disparar em «criei uma imagem mental» / papo sem verbo de desenhar.
 */
const PEDE_IMAGEM =
  /\b(desenha|desenhar|pinta|pintar|ilustra|ilustrar)\b|\b(gera|gerar|cria|criar|faz|fazer|manda|envia|mostra)\b.{0,40}\b(imagem|foto|arte|ilustra[cç][aã]o|desenho|quadro|retrato)\b|\b(imagem|arte|ilustra[cç][aã]o|desenho)\b.{0,24}\b(de|d[aeou]m?|com|pra|para)\b/i;

const PSEUDO_TOOL_IMAGEM =
  /\[Tool:\s*(gen_images|generate_image|image_generation|gerar_imagem|edit_image|image_edit|editar_imagem)\s*\]/i;

export function respostaAlegaImagemEnviada(resposta: string): boolean {
  return ALEGA_IMAGEM.test(resposta);
}

export function pediuImagem(mensagemUsuario: string): boolean {
  return PEDE_IMAGEM.test(mensagemUsuario);
}

export function vazouPseudoToolImagem(resposta: string): boolean {
  return PSEUDO_TOOL_IMAGEM.test(resposta);
}

/**
 * Confabulou imagem? Pediu desenho + alegou ter mandado + zero URLs reais no turno.
 */
export function confabulouImagem(
  resposta: string,
  imagensComUrl: number,
  mensagemUsuario: string,
): boolean {
  const raw = process.env.LUNA_GUARDA_IMAGEM?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;

  if (!resposta.trim()) return false;
  if (imagensComUrl > 0) return false;
  return (
    vazouPseudoToolImagem(resposta) ||
    (pediuImagem(mensagemUsuario) && respostaAlegaImagemEnviada(resposta))
  );
}

/** Texto honesto no lugar da mentira — sem segunda passagem cara. */
export function textoDesculpaImagem(): string {
  return "Tentei desenhar, mas a imagem não chegou a sair desta vez. Quer que eu tente de novo?";
}
