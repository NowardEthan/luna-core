import type { MemoriaSessao } from "../../memoria/esquemaMemoria.js";
import { criarVontadeNarrativa, type VontadeNarrativa } from "./storeVontade.js";

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

  const vontade = assunto
    ? `Voltar a puxar com ele o assunto: "${assunto}" — ver no que deu, por conta própria.`
    : sessao.mensagens.length > 12
      ? "Retomar por iniciativa própria o fio principal desta conversa no próximo encontro."
      : "Chegar no próximo encontro trazendo algo, não só esperando ele começar.";

  return criarVontadeNarrativa({
    sessao_id: sessao.id,
    vontade,
    gatilho,
    prioridade: assunto ? 4 : sessao.mensagens.length > 12 ? 4 : 3,
  });
}
