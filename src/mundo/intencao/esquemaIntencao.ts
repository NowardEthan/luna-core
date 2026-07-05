import { z } from "zod";
import type { AnaliseContexto } from "../../analyzers/esquema.js";

/**
 * Tipos de movimento próprio da Luna num turno — o que *ela* quer fazer,
 * independente de o usuário ter perguntado algo.
 */
export const TIPOS_INTENCAO_LUNA = [
  "retomar_fio", // puxar de volta um assunto/fio que ficou em aberto
  "partilhar", // trazer algo do mundo interior/gostos dela
  "provocar", // implicar com carinho, brincar
  "cuidar", // checar emocionalmente (evento afetivo recente / apoio)
  "aprofundar", // dar o ângulo próprio dela sobre o que ele trouxe
  "so_presenca", // baixa energia / recuo — ficar junto sem empurrar
] as const;

export type TipoIntencaoLuna = (typeof TIPOS_INTENCAO_LUNA)[number];

export const IntencaoLunaSchema = z.object({
  tipo: z.enum(TIPOS_INTENCAO_LUNA),
  /** Tópico concreto que ela quer trazer/puxar. Curto. Pode ser vazio em recuo. */
  foco: z.string().max(160).default(""),
  /** Quanto ela empurra a própria vontade (0 = só acompanha, 1 = toma a frente). */
  impulso: z.number().min(0).max(1).default(0.5),
  /** Leitura de clima: se o usuário está mal/objetivo/crítico, ela recua e fica junto. */
  recuar: z.boolean().default(false),
  /** Justificativa interna curta (não vai para a voz literalmente). */
  motivo: z.string().max(200).default(""),
});

export type IntencaoLunaBruta = z.infer<typeof IntencaoLunaSchema>;

export type IntencaoLuna = IntencaoLunaBruta & {
  fonte: "llm" | "regras";
};

/** Entrada compacta para o motor de intenção. */
export type EntradaIntencao = {
  mensagem: string;
  intencao_usuario: AnaliseContexto["intencao"];
  nivel_risco: AnaliseContexto["nivel_risco"];
  criador_verificado?: boolean;
  clima: { valencia: number; energia: number };
  relacao: { proximidade: number; disposicao: string };
  /** Último fio/assunto da conversa (resumo curto do que a Luna disse por último). */
  ultimoFio?: string;
};
