import type { EntradaIntencao, IntencaoLuna, TipoIntencaoLuna } from "./esquemaIntencao.js";
import { listarVontadesAtivas } from "../vontade/storeVontade.js";
import { listarGostosLuna } from "../gostos/storeGostos.js";
import { listarEventosAfetivosRecentes } from "../humor/eventoAfectivo.js";

/**
 * O clima pede recuo? (usuário mal, objetivo demais, ou situação sensível)
 * "Presente mas sensível": ela não empurra agenda própria nesses momentos.
 */
export function climaExigeRecuo(e: EntradaIntencao): boolean {
  if (e.nivel_risco === "medio" || e.nivel_risco === "alto" || e.nivel_risco === "critico") {
    return true;
  }
  if (e.intencao_usuario === "acao_critica") return true;
  if (e.intencao_usuario === "pedido_codigo" || e.intencao_usuario === "projeto_arquitetural") {
    return true;
  }
  if (e.clima.valencia <= -0.35) return true;
  if (e.relacao.disposicao === "fechada") return true;
  return false;
}

function focoDeEvento(interlocutorCriador?: boolean): string | null {
  try {
    const eventos = listarEventosAfetivosRecentes(3);
    const relevante = eventos.find((ev) => ev.tipo === "magoa" || ev.tipo === "carinho");
    if (!relevante) return null;
    return relevante.narrativa_interna || (relevante.tipo === "magoa" ? "o clima que ficou da última vez" : "o carinho de antes");
  } catch {
    return null;
  }
}

function focoDeVontade(): string | null {
  try {
    const vontades = listarVontadesAtivas(1);
    return vontades[0]?.vontade ?? null;
  } catch {
    return null;
  }
}

function focoDeGosto(): string | null {
  try {
    const gostos = listarGostosLuna(3);
    const forte = gostos.find((g) => g.afinidade >= 0.6);
    return forte?.topico ?? null;
  } catch {
    return null;
  }
}

/**
 * Intenção por regras — usada como fallback (sem LLM) e em turnos simples.
 * Não é aleatória: deriva do estado persistido + leitura de clima.
 */
export function intencaoDeterministica(e: EntradaIntencao): IntencaoLuna {
  const recuar = climaExigeRecuo(e);

  // Recuo: fica presente, sem tomar a frente.
  if (recuar) {
    const precisaCuidado =
      e.intencao_usuario === "apoio_emocional" || e.clima.valencia <= -0.35;
    const focoEvento = focoDeEvento(e.criador_verificado);
    return {
      tipo: precisaCuidado ? "cuidar" : "so_presenca",
      foco: precisaCuidado ? focoEvento ?? "como ele está de verdade agora" : "",
      impulso: precisaCuidado ? 0.35 : 0.15,
      recuar: true,
      motivo: precisaCuidado
        ? "clima pede acolhimento, não agenda própria"
        : "momento objetivo/sensível — presença sem empurrar",
      fonte: "regras",
    };
  }

  // Evento afetivo recente pesa primeiro (magoa/carinho por resolver).
  const focoEvento = focoDeEvento(e.criador_verificado);
  if (focoEvento) {
    return {
      tipo: "cuidar",
      foco: focoEvento,
      impulso: 0.5,
      recuar: false,
      motivo: "evento afetivo recente ainda no ar",
      fonte: "regras",
    };
  }

  const energiaAlta = e.clima.energia >= 0.7;
  const climaLeve = e.clima.valencia >= 0.45;
  const proximo = e.relacao.proximidade >= 0.7;

  // Implicância carinhosa quando há intimidade + energia + clima leve.
  if (e.criador_verificado && proximo && energiaAlta && climaLeve) {
    return {
      tipo: "provocar",
      foco: e.ultimoFio ?? "",
      impulso: 0.7,
      recuar: false,
      motivo: "intimidade + energia alta pedem brincadeira",
      fonte: "regras",
    };
  }

  // Vontade ativa → retomar um fio real.
  const focoVontade = focoDeVontade();
  if (focoVontade) {
    return {
      tipo: "retomar_fio",
      foco: focoVontade,
      impulso: proximo ? 0.6 : 0.45,
      recuar: false,
      motivo: "há um fio que ela quer retomar",
      fonte: "regras",
    };
  }

  // Gosto forte + energia → partilhar algo do mundo interior.
  const focoGosto = focoDeGosto();
  if (focoGosto && (energiaAlta || climaLeve)) {
    return {
      tipo: "partilhar",
      foco: focoGosto,
      impulso: 0.55,
      recuar: false,
      motivo: "algo do mundo interior dela quer aparecer",
      fonte: "regras",
    };
  }

  // Padrão: dar o ângulo próprio sobre o que ele trouxe.
  return {
    tipo: "aprofundar",
    foco: e.ultimoFio ?? "",
    impulso: proximo ? 0.5 : 0.4,
    recuar: false,
    motivo: "reagir com opinião/ângulo próprio, não só espelhar",
    fonte: "regras",
  };
}
