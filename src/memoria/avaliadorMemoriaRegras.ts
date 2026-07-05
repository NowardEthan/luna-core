import {
  DecisaoMemoriaSchema,
  type DecisaoMemoria,
  type MemoriaSessao,
} from "./esquemaMemoria.js";
import {
  detectarConfirmacaoMemoria,
  detectarInformacaoSensivel,
  detectarInformacaoParaMemoria,
  detectarPreferencia,
  detectarRecallSessao,
  detectarVocativoParaLuna,
} from "../analyzers/lexicoMemoria.js";

const SUGESTAO_SENSIVEL =
  "Posso lembrar disso para adaptar melhor minhas respostas no futuro? É uma informação pessoal, então só vou guardar se você confirmar.";

const SUGESTAO_IDENTIFICADOR =
  "Esse tipo de informação é sensível. Posso lembrar apenas se você confirmar explicitamente — ou prefere que eu não guarde?";

function normalizarTexto(mensagem: string): string {
  return mensagem
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resumirConteudo(mensagem: string): string {
  const limpo = mensagem.trim();
  return limpo.length > 120 ? `${limpo.slice(0, 117)}…` : limpo;
}

/** Neurônio de memória rule-based (V1.2) — fallback determinístico. */
export function avaliarMemoriaPorRegras(
  mensagem: string,
  sessao?: Pick<MemoriaSessao, "pendente_confirmacao" | "fatos">,
): DecisaoMemoria {
  const texto = normalizarTexto(mensagem);

  if (detectarVocativoParaLuna(mensagem)) {
    return DecisaoMemoriaSchema.parse({
      acao: "ignorar",
      tipo: "fato_geral",
      conteudo: "",
      motivo: "Vocativo à Luna (apelido da assistente) — não é nome nem fato do usuário",
    });
  }

  if (detectarRecallSessao(mensagem)) {
    return DecisaoMemoriaSchema.parse({
      acao: "ignorar",
      tipo: "recall",
      conteudo: "",
      motivo: "Pedido de recall — usar histórico da sessão, não gravar fato",
    });
  }

  if (sessao?.pendente_confirmacao && detectarConfirmacaoMemoria(mensagem)) {
    return DecisaoMemoriaSchema.parse({
      acao: "armazenar",
      tipo: "confirmacao_usuario",
      conteudo: sessao.pendente_confirmacao.conteudo,
      motivo: "Usuário confirmou explicitamente o armazenamento pendente",
    });
  }

  if (/\b(cpf|rg|senha|cartao de credito|numero do cartao)\b/.test(texto)) {
    return DecisaoMemoriaSchema.parse({
      acao: "confirmar",
      tipo: "informacao_sensivel",
      conteudo: "dado identificador sensível mencionado",
      motivo: "Dado identificador requer confirmação explícita antes de memória persistente",
      sugestao_resposta: SUGESTAO_IDENTIFICADOR,
    });
  }

  if (detectarInformacaoSensivel(mensagem)) {
    return DecisaoMemoriaSchema.parse({
      acao: "confirmar",
      tipo: "informacao_sensivel",
      conteudo: resumirConteudo(mensagem),
      motivo: "Informação de saúde/neurodivergência ou dado pessoal sensível",
      sugestao_resposta: SUGESTAO_SENSIVEL,
    });
  }

  if (detectarPreferencia(mensagem)) {
    return DecisaoMemoriaSchema.parse({
      acao: "armazenar",
      tipo: "preferencia",
      conteudo: resumirConteudo(mensagem),
      motivo: "Preferência explícita do usuário",
    });
  }

  if (detectarInformacaoParaMemoria(mensagem)) {
    return DecisaoMemoriaSchema.parse({
      acao: "armazenar",
      tipo: "fato_geral",
      conteudo: resumirConteudo(mensagem),
      motivo: "Informação relevante para continuidade da sessão",
    });
  }

  return DecisaoMemoriaSchema.parse({
    acao: "ignorar",
    tipo: "fato_geral",
    conteudo: "",
    motivo: "Nada relevante para memória persistente",
  });
}

/** Refino determinístico pós-LLM — recall e sensível prevalecem. */
export function refinarDecisaoMemoria(
  mensagem: string,
  decisao: DecisaoMemoria,
  sessao?: Pick<MemoriaSessao, "pendente_confirmacao" | "fatos">,
): DecisaoMemoria {
  const regras = avaliarMemoriaPorRegras(mensagem, sessao);

  if (detectarRecallSessao(mensagem)) return regras;
  if (sessao?.pendente_confirmacao && detectarConfirmacaoMemoria(mensagem)) return regras;
  if (detectarInformacaoSensivel(mensagem) && decisao.acao === "armazenar") return regras;
  if (/\b(cpf|rg|senha)\b/.test(normalizarTexto(mensagem)) && decisao.acao === "armazenar") {
    return regras;
  }

  return decisao;
}
