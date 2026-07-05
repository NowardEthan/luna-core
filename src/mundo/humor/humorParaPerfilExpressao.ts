import type { AnaliseContexto } from "../../analyzers/esquema.js";
import { avaliarGateHumor, type FamiliaHumor, type GateHumor } from "./avaliarGateHumor.js";
import type { ClimaHumor } from "./climaHumor.js";
import type { ImpactoAfetivo } from "./analisadorImpactoAfetivo.js";
import type { RelacaoHumor } from "./relacaoHumor.js";
import {
  vozParaPerfilEscrita,
  type PerfilEscrita,
  type IntencaoVozEscrita,
} from "../../personalidade/vozParaPerfilEscrita.js";

export type PerfilExpressaoHumor = {
  clima: "leve" | "neutro" | "contido" | "pesado";
  energia: "baixa" | "media" | "alta";
  registro: "reservado" | "proximo" | "caloroso" | "intimo";
  moduladores: {
    calor_textual: number;
    leveza: number;
    interjeicoes: "raras" | "naturais" | "frequentes";
    pergunta_final: "evitar" | "se_natural" | "preferir";
    comprimento: "curto" | "medio" | "pode_expandir";
    emoji: "evitar" | "raro" | "ok";
  };
  disposicao: RelacaoHumor["disposicao"];
  humor: {
    gate: GateHumor;
    familias_ativas: FamiliaHumor[];
    tom_ethan_bronca_carinhosa?: boolean;
  };
  frase_narrativa: string;
  piso_cordialidade: true;
  perfil_escrita: PerfilEscrita;
};

type CtxPerfil = {
  intencao: AnaliseContexto["intencao"];
  nivel_risco: "nenhum" | "baixo" | "medio" | "alto" | "critico";
  criador_verificado?: boolean;
  impacto?: ImpactoAfetivo;
  intencaoLuna?: IntencaoVozEscrita;
};

function faixaEnergia(v: number): PerfilExpressaoHumor["energia"] {
  if (v < 0.35) return "baixa";
  if (v < 0.7) return "media";
  return "alta";
}

function faixaClima(v: number): PerfilExpressaoHumor["clima"] {
  if (v <= -0.35) return "pesado";
  if (v < 0.1) return "contido";
  if (v < 0.45) return "neutro";
  return "leve";
}

export function humorParaPerfilExpressao(
  clima: ClimaHumor,
  relacao: RelacaoHumor,
  ctx: CtxPerfil,
): PerfilExpressaoHumor {
  const gate = avaliarGateHumor({
    intencao: ctx.intencao,
    nivel_risco: ctx.nivel_risco,
    criador_verificado: ctx.criador_verificado,
    impacto: ctx.impacto,
    disposicao: relacao.disposicao,
  });
  const climaFaixa = faixaClima(clima.valencia);
  const energiaFaixa = faixaEnergia(clima.energia);
  const registro: PerfilExpressaoHumor["registro"] = ctx.criador_verificado
    ? relacao.proximidade > 0.85
      ? "intimo"
      : "caloroso"
    : relacao.proximidade > 0.7
      ? "caloroso"
      : relacao.proximidade > 0.45
        ? "proximo"
        : "reservado";

  const calorBase = ctx.criador_verificado
    ? Math.max(0.62, 0.35 + relacao.proximidade * 0.55)
    : 0.3 + relacao.proximidade * 0.6;

  const narrativa = `Estado da Luna: clima ${climaFaixa}, energia ${energiaFaixa}, com este interlocutor ${relacao.disposicao}.`;
  const perfilEscrita = vozParaPerfilEscrita({
    intencao: ctx.intencao,
    criador_verificado: ctx.criador_verificado,
    humor: {
      clima: climaFaixa,
      energia: energiaFaixa,
      registro,
      gate,
    },
    intencaoLuna: ctx.intencaoLuna,
  });

  return {
    clima: climaFaixa,
    energia: energiaFaixa,
    registro,
    moduladores: {
      calor_textual: Number(calorBase.toFixed(2)),
      leveza: ctx.criador_verificado
        ? Math.max(0.55, gate.nivel_leveza === "alto" ? 0.9 : gate.nivel_leveza === "moderado" ? 0.65 : 0.45)
        : gate.nivel_leveza === "alto"
          ? 0.9
          : gate.nivel_leveza === "moderado"
            ? 0.6
            : 0.2,
      interjeicoes:
        ctx.criador_verificado || energiaFaixa === "alta"
          ? "frequentes"
          : energiaFaixa === "media"
            ? "naturais"
            : "raras",
      pergunta_final: ctx.criador_verificado ? "evitar" : gate.permitir_piada ? "se_natural" : "evitar",
      comprimento:
        ctx.intencao === "pergunta_identitaria"
          ? "medio"
          : energiaFaixa === "baixa"
            ? "curto"
            : energiaFaixa === "media"
              ? "medio"
              : "pode_expandir",
      emoji: gate.permitir_piada ? "raro" : "evitar",
    },
    disposicao: relacao.disposicao,
    humor: {
      gate,
      familias_ativas: gate.familias_sugeridas,
      tom_ethan_bronca_carinhosa:
        Boolean(ctx.criador_verificado) && gate.familias_sugeridas.includes("implicancia_carinhosa"),
    },
    frase_narrativa: narrativa,
    piso_cordialidade: true,
    perfil_escrita: perfilEscrita,
  };
}
