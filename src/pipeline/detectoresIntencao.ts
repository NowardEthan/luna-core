/**
 * Detectores leves de intenção na mensagem do usuário.
 * Vivem fora do pipeline completo pra o respondedor agêntico poder importar
 * sem ciclo (pipeline → agentico → pipeline).
 *
 * A2 — soft router: preferir FN raro a FP caro (abrir agêntico no “oi” / metáfora).
 */

/** Pedidos que pedem busca na web — não todo papo casual. */
export function mensagemSugerePesquisaWeb(mensagem: string): boolean {
  // FP: «minha pesquisa da faculdade» — substantivo possessivo, não pedido de busca.
  const semPesquisaSubstantivo = mensagem.replace(
    /\b(minha|sua|nossa|essa|esta|uma|a)\s+pesquisa\b/gi,
    " ",
  );
  // Pedido explícito (A2). `\b` do JS é ASCII — âncoras acentuadas ficam no 2º bloco.
  if (
    /\b(pesquisar|pesquisa\s+(?:o|a|os|as|um|uma|isso|isto|sobre|pra|para|no|na|em)|busca|buscar|procure|procura\s+(?:o|a|os|as|um|uma|isso|isto|sobre|pra|para)|google|bing|not[ií]cias?|pre[cç]o|cota[cç][aã]o|quem ganhou|resultado do|o que (?:rolou|aconteceu) (?:com|sobre)|atualiza[cç][aã]o sobre)\b/i.test(
      semPesquisaSubstantivo,
    )
  ) {
    return true;
  }
  // Fato público/atualizável sem verbo «pesquisar» — abre agentico com web.
  // «como você está» fica de fora (exige artigo o/a/os/as depois de «está»).
  return /[uú]ltimas?\s+not[ií]cias|[uú]ltima\s+vers[aã]o|vers[aã]o\s+atual|\bquanto\s+custa|cota[cç][aã]o\s+do|d[oó]lar\s+hoje|como\s+est[aá]\s+(?:o|a|os|as)\b|\bstatus\s+(?:do|da|de)\b|lan[cç]amento\s+do|ainda\s+(?:existe|funciona|est[aá]|saiu)|\bem\s+20(?:2[4-9]|[3-9]\d)\b/i.test(
    semPesquisaSubstantivo,
  );
}

export function mensagemContemUrl(mensagem: string): boolean {
  return /https?:\/\/\S+/i.test(mensagem);
}

function mensagemTemValorMonetario(mensagem: string): boolean {
  return (
    /\b\d+([.,]\d{1,2})?\s*(reais?|r\$)\b/i.test(mensagem) ||
    /\br\$\s*\d/i.test(mensagem)
  );
}

/**
 * Valor em R$ que parece lançamento rápido («50 reais no almoço», «R$ 32»),
 * não metáfora («vale 50 reais de aprendizado»).
 */
export function mensagemPareceLancamentoRapido(mensagem: string): boolean {
  if (!mensagemTemValorMonetario(mensagem)) return false;
  if (
    /\b(no|na|em|pro|pra|para|com|ontem|hoje|semana|m[eê]s|almo[cç]o|jantar|caf[eé]|uber|ifood|mercado|padaria|farm[aá]cia|gasolina|netflix|spotify|aluguel|sal[aá]rio)\b/i.test(
      mensagem,
    )
  ) {
    return true;
  }
  // Só o valor (mensagem curtinha): «50 reais», «R$ 32».
  const limpa = mensagem.replace(/\s+/g, " ").trim();
  return limpa.length <= 40 && /^(r\$\s*)?\d/i.test(limpa);
}

/**
 * Pedido de ação/consulta financeira — abre o agêntico pra `registrar_lancamento`,
 * `resumo_financeiro`, `transferir`, etc. Deliberadamente ancorado em verbo de grana
 * ou substantivo do módulo Finanças (sem alargar pra qualquer «R$» solto em metáfora).
 */
export function mensagemPedeFinancas(mensagem: string): boolean {
  if (
    /\b(gastei|gastamos|gaste|paguei|pagamos|recebi|recebemos|transferi|transfere|transferir|transferiu)\b/i.test(
      mensagem,
    )
  ) {
    return true;
  }
  if (/\bquanto\s+(gastei|gastamos|saiu|entrou|paguei|recebi)\b/i.test(mensagem)) {
    return true;
  }
  if (
    /\b(lan[cç]amento|lan[cç]amentos|extrato|fatura|carteira|carteiras|cart[aã]o|cart[oõ]es|recorrente|recorrentes|or[cç]amento|finan[cç]as|meta|metas|conta\s+a\s+pagar|contas\s+a\s+pagar)\b/i.test(
      mensagem,
    )
  ) {
    return true;
  }
  // «cria/adiciona o Nubank», «novo cartão Inter» — criar carteira sem citar «carteira».
  if (
    /\b(cria\w*|crie|adicion\w+|cadastr\w+)\b[^.?!\n]{0,40}\b(nubank|inter|c6|ita[uú]|bradesco|santander|picpay|mercado\s*pago)\b/i.test(
      mensagem,
    )
  ) {
    return true;
  }
  if (
    /\b(registr\w+|anot\w+|salva\w+|cria\w*|crie|lista\w*|mostra\w*|quanto\s+(gastei|saiu|entrou))\b[^.?!\n]{0,40}\b(r\$|reais?|centavos|aluguel|sal[aá]rio|netflix|nubank)\b/i.test(
      mensagem,
    )
  ) {
    return true;
  }
  if (mensagemPareceLancamentoRapido(mensagem)) return true;
  return false;
}

/**
 * A3 — pedido de profundidade/rigor neste turno (sem chip «Técnico»).
 * Small talk e pedidos rasos ficam de fora de propósito.
 */
export function mensagemPedeProfundidade(mensagem: string): boolean {
  const m = mensagem.trim();
  if (m.length < 12) return false;
  // Small talk curto — nunca profundidade.
  if (
    /^(oi|ol[áa]|e a[ií]|tudo bem|td bem|obrigad[oa]|valeu|kk+|haha|bom dia|boa tarde|boa noite)\b/i.test(
      m,
    ) &&
    m.length < 40
  ) {
    return false;
  }
  if (
    /\b(explica|explique|explica[cç][aã]o|detalha|detalhe|a fundo|em detalhe|em profundidade|passo a passo|como funciona|por que|porque|analisa|analise|compara|compare|diferen[cç]a entre|trade-?off|arquitetura|implementa[cç][aã]o|algoritmo|complexidade|rigor|parecer t[eé]cnico|a fundo)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  if (/\b(t[eé]cnico|t[eé]cnica|did[aá]tico|did[aá]tica)\b/i.test(m) && m.length > 20) {
    return true;
  }
  // Pedido longo analítico sem verbo explícito — heurística fraca: mensagem longa + interrogação.
  if (m.length >= 160 && /\?/.test(m) && !/\b(kk+|haha|rsrs)\b/i.test(m)) {
    return true;
  }
  return false;
}

/** Motivo opaco do gate agêntico (telemetria / testes — sem texto de chat). */
export type MotivoGateAgentico =
  | "forcado"
  | "vision"
  | "documento_anexo"
  | "web"
  | "pede_documento"
  | "edita_documento"
  | "financas"
  | "gerar_imagem";

export type SinaisGateAgentico = {
  forcar: boolean;
  vision: boolean;
  documentoAnexo: boolean;
  web: boolean;
  pedeDocumento: boolean;
  editaDocumento: boolean;
  financas: boolean;
  gerarImagem: boolean;
};

/** Decide se abre o caminho agêntico e por quê (ordem = prioridade de telemetria). */
export function decidirGateAgentico(
  sinais: SinaisGateAgentico,
): { usar: boolean; motivo: MotivoGateAgentico | null } {
  if (sinais.forcar) return { usar: true, motivo: "forcado" };
  if (sinais.documentoAnexo) return { usar: true, motivo: "documento_anexo" };
  if (sinais.financas) return { usar: true, motivo: "financas" };
  if (sinais.pedeDocumento) return { usar: true, motivo: "pede_documento" };
  if (sinais.editaDocumento) return { usar: true, motivo: "edita_documento" };
  if (sinais.gerarImagem) return { usar: true, motivo: "gerar_imagem" };
  if (sinais.vision) return { usar: true, motivo: "vision" };
  if (sinais.web) return { usar: true, motivo: "web" };
  return { usar: false, motivo: null };
}
