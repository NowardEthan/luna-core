import type { MemoriaSessao } from "../../memoria/esquemaMemoria.js";
import { criarVontadeNarrativa, type VontadeNarrativa } from "./storeVontade.js";

function inferirGatilho(sessao: MemoriaSessao): string {
  const ultimaUsuario = [...sessao.mensagens]
    .reverse()
    .find((m) => m.papel === "user");
  return ultimaUsuario?.conteudo.slice(0, 120) ?? "encerramento_de_sessao";
}

export function gerarVontadePosSessao(sessao: MemoriaSessao): VontadeNarrativa {
  const gatilho = inferirGatilho(sessao);
  const vontade =
    sessao.mensagens.length > 12
      ? "Retomar o fio principal da conversa no próximo encontro."
      : "Chegar no próximo encontro com continuidade leve e clara.";

  return criarVontadeNarrativa({
    sessao_id: sessao.id,
    vontade,
    gatilho,
    prioridade: sessao.mensagens.length > 12 ? 4 : 3,
  });
}
