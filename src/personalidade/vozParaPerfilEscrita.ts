import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { GateHumor } from "../mundo/humor/avaliarGateHumor.js";

type HumorBasePerfilEscrita = {
  clima: "leve" | "neutro" | "contido" | "pesado";
  energia: "baixa" | "media" | "alta";
  registro: "reservado" | "proximo" | "caloroso" | "intimo";
  gate: GateHumor;
};

export type PerfilEscrita = {
  reacao: "direta_objetiva" | "acolhimento_ativo" | "espelho_curto" | "provocacao_carinhosa";
  pergunta: "evitar" | "confirmacao_curta" | "aberta_curiosa" | "foco_execucao";
  cadencia: "curta" | "media" | "expansiva";
  assinatura: "tecnica_clara" | "calor_estavel" | "curiosidade_guiada";
};

type CtxVozEscrita = {
  intencao: AnaliseContexto["intencao"];
  criador_verificado?: boolean;
  humor: HumorBasePerfilEscrita;
};

function escolherReacao(ctx: CtxVozEscrita): PerfilEscrita["reacao"] {
  if (ctx.intencao === "pergunta_identitaria") return "acolhimento_ativo";
  if (ctx.intencao === "conversa_casual" && !ctx.criador_verificado) return "espelho_curto";
  if (ctx.intencao === "conversa_casual" && ctx.criador_verificado) return "acolhimento_ativo";
  if (ctx.intencao === "apoio_emocional") return "acolhimento_ativo";
  if (ctx.criador_verificado && ctx.humor.gate.familias_sugeridas.includes("implicancia_carinhosa")) {
    return "provocacao_carinhosa";
  }
  if (ctx.intencao === "pedido_codigo" || ctx.intencao === "projeto_arquitetural") {
    return "direta_objetiva";
  }
  if (ctx.humor.clima === "pesado" || ctx.humor.clima === "contido") {
    return "espelho_curto";
  }
  return "direta_objetiva";
}

function escolherPergunta(ctx: CtxVozEscrita): PerfilEscrita["pergunta"] {
  if (ctx.intencao === "pergunta_identitaria") return "confirmacao_curta";
  if (ctx.intencao === "conversa_casual") return "evitar";
  if (!ctx.humor.gate.permitir_piada && ctx.intencao === "acao_critica") return "evitar";
  if (ctx.intencao === "pedido_codigo" || ctx.intencao === "projeto_arquitetural") return "foco_execucao";
  if (ctx.intencao === "apoio_emocional") return "confirmacao_curta";
  if (ctx.humor.clima === "leve" || ctx.humor.registro === "caloroso" || ctx.humor.registro === "intimo") {
    return "aberta_curiosa";
  }
  return "confirmacao_curta";
}

function escolherCadencia(humor: HumorBasePerfilEscrita, intencao?: AnaliseContexto["intencao"], criador?: boolean): PerfilEscrita["cadencia"] {
  if (criador) return "media";
  if (intencao === "pergunta_identitaria") return "media";
  if (intencao === "conversa_casual" && (humor.registro === "caloroso" || humor.registro === "intimo")) {
    return "media";
  }
  if (intencao === "conversa_casual") return "curta";
  if (humor.energia === "alta") return "expansiva";
  if (humor.energia === "media") return "media";
  return "curta";
}

function escolherAssinatura(ctx: CtxVozEscrita): PerfilEscrita["assinatura"] {
  if (ctx.intencao === "pergunta_identitaria") return "calor_estavel";
  if (ctx.intencao === "pedido_codigo" || ctx.intencao === "pergunta_tecnica") {
    return "tecnica_clara";
  }
  if (ctx.humor.registro === "caloroso" || ctx.humor.registro === "intimo") {
    return "calor_estavel";
  }
  return "curiosidade_guiada";
}

export function vozParaPerfilEscrita(ctx: CtxVozEscrita): PerfilEscrita {
  return {
    reacao: escolherReacao(ctx),
    pergunta: escolherPergunta(ctx),
    cadencia: escolherCadencia(ctx.humor, ctx.intencao, ctx.criador_verificado),
    assinatura: escolherAssinatura(ctx),
  };
}

export function formatarPerfilEscrita(perfil: PerfilEscrita): string {
  return [
    "Perfil de escrita:",
    `- Reação: ${perfil.reacao}`,
    `- Pergunta: ${perfil.pergunta}`,
    `- Cadência: ${perfil.cadencia}`,
    `- Assinatura: ${perfil.assinatura}`,
  ].join("\n");
}
