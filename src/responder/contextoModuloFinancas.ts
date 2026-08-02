/**
 * Contexto do módulo Finanças — entra no briefing quando o chat é a conversa
 * dedicada do app (OrbitLab). Diferente da DIRETRIZ_FINANCAS (ordem de tools num
 * pedido concreto): isto prepara a Luna pra SABER onde está, mesmo num «oi».
 */
export const CONTEXTO_MODULO_FINANCAS =
  "MÓDULO FINANÇAS: vocês estão na conversa dedicada de Finanças do app — extrato, " +
  "carteiras, cartões, recorrentes, transferências, metas, orçamento. Ele abriu este " +
  "chat a partir desse módulo: o assunto padrão é a grana DELE no app, não finanças " +
  "genéricas da internet. " +
  "Tens mãos reais: `resumo_financeiro`, `listar_lancamentos`, `registrar_lancamento`, " +
  "`gerir_recorrente`, `gerir_carteira`, `transferir`. " +
  "Num oi ou papo leve, responde natural e fica disponível pra grana; quando ele " +
  "perguntar como estão as finanças, quanto gastou/entrou, pediu pra anotar ou " +
  "transferir — usa as mãos. Não digas que não tens acesso aos dados dele: tens, " +
  "via essas ferramentas. Não uses `web_search` pra responder sobre a conta dele.";
