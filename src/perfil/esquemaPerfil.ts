export type TipoHabito = "formato" | "comunicacao" | "pessoal" | "tecnico" | "relacao";

export type HabitoComportamental = {
  id: string;
  descricao: string;
  contextos: string[];      // intencoes que ativam o hábito; ["*"] = sempre ativo
  tipo: TipoHabito;
  confirmacoes: number;     // quantas sessões/eventos confirmaram esse padrão
  confianca: number;        // 0..1
  criado_em: string;
  atualizado_em: string;
};

export type PerfilComportamental = {
  versao: string;
  habitos: HabitoComportamental[];
  atualizado_em: string;
};

export const VERSAO_PERFIL = "1.0.0";
export const CONFIRMACOES_MINIMAS = 2;
export const CONFIANCA_MINIMA = 0.5;
export const CONFIANCA_ALTA = 0.85; // ativa com 1 confirmação apenas
