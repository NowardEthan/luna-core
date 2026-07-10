import type { MemoriaSessao } from "../../memoria/esquemaMemoria.js";
import {
  arquivarVontadesDeSeguimentoAnteriores,
  criarVontadeNarrativa,
  type VontadeNarrativa,
} from "./storeVontade.js";

function normalizar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** Extrai um assunto concreto do que a pessoa trouxe (mensagem mais substancial). */
function extrairAssunto(sessao: MemoriaSessao): string | null {
  const doUsuario = sessao.mensagens.filter((m) => m.papel === "user").map((m) => normalizar(m.conteudo));

  // Preferir um fato confirmado da sessão (mais estável que a última fala).
  const fato = sessao.fatos?.map(normalizar).find((f) => f.length >= 8);
  if (fato) return fato.slice(0, 90);

  // Senão, a mensagem mais longa (costuma carregar o assunto real).
  const substancial = [...doUsuario]
    .filter((m) => m.length >= 12)
    .sort((a, b) => b.length - a.length)[0];
  if (substancial) return substancial.slice(0, 90);

  return null;
}

function inferirGatilho(sessao: MemoriaSessao): string {
  const ultimaUsuario = [...sessao.mensagens].reverse().find((m) => m.papel === "user");
  return ultimaUsuario?.conteudo.slice(0, 120) ?? "encerramento_de_sessao";
}

export function gerarVontadePosSessao(sessao: MemoriaSessao): VontadeNarrativa {
  const gatilho = inferirGatilho(sessao);
  const assunto = extrairAssunto(sessao);

  // O assunto é copiado VERBATIM da fala do usuário, logo vem em 1ª pessoa ("tô montando…").
  // Sem dizer de quem são as palavras, o modelo troca a atribuição e adota o hobby do
  // usuário como se fosse dela. A atribuição explícita abaixo é obrigatória.
  const vontade = assunto
    ? `Voltar a puxar, por conta própria, o assunto que o USUÁRIO trouxe — palavras dele, não suas: "${assunto}" — e ver no que deu.`
    : sessao.mensagens.length > 12
      ? "Retomar por iniciativa própria o fio principal desta conversa no próximo encontro."
      : "Chegar no próximo encontro trazendo algo, não só esperando ele começar.";

  // Só a vontade de seguimento mais recente fica viva — senão empilham e ela
  // repuxa todos os assuntos antigos, para sempre, em toda conversa.
  arquivarVontadesDeSeguimentoAnteriores(sessao.id);

  return criarVontadeNarrativa({
    sessao_id: sessao.id,
    vontade,
    gatilho,
    prioridade: assunto ? 4 : sessao.mensagens.length > 12 ? 4 : 3,
  });
}
