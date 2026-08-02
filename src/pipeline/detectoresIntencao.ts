/**
 * Detectores leves de intenção na mensagem do usuário.
 * Vivem fora do pipeline completo pra o respondedor agêntico poder importar
 * sem ciclo (pipeline → agentico → pipeline).
 */

/** Pedidos que pedem busca na web — não todo papo casual. */
export function mensagemSugerePesquisaWeb(mensagem: string): boolean {
  return /\b(pesquisa|pesquisar|busca|buscar|procure|procura|google|bing|not[ií]cias?|pre[cç]o|cota[cç][aã]o|quem ganhou|resultado do|o que (?:rolou|aconteceu) (?:com|sobre)|atualiza[cç][aã]o sobre|últimas? not[ií]cias)\b/i.test(
    mensagem,
  );
}

export function mensagemContemUrl(mensagem: string): boolean {
  return /https?:\/\/\S+/i.test(mensagem);
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
  // «R$ 32» / «32 reais» perto de verbo de anotar/gastar já coberto acima; aqui o atalho
  // «registre 50 reais no almoço» sem o verbo na primeira cláusula.
  if (/\b\d+([.,]\d{1,2})?\s*(reais?|r\$)\b/i.test(mensagem)) return true;
  if (/\br\$\s*\d/i.test(mensagem)) return true;
  return false;
}
