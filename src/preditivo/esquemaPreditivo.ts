export type TomEsperado = "casual" | "tecnico" | "apoio" | "exploratorio";
export type PadraoPrior = "consistente" | "transicao" | "novo";

export type PriorIntencao = {
  topico_recente: string;
  padrao: PadraoPrior;
  tom_esperado: TomEsperado;
  dica_respondedor: string;
};
