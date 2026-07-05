import type { EntradasCompilador } from "../contexto/compiladorContexto.js";

export type ContextoColeta = {
  mensagem: string;
  intencao: string;
  contextoSessao?: import("../memoria/esquemaMemoria.js").ContextoSessao;
  prior?: import("../preditivo/esquemaPreditivo.js").PriorIntencao;
  habitos?: import("../perfil/esquemaPerfil.js").HabitoComportamental[];
};

export type NeuronioRegistrado = {
  nome: string;
  descricao: string;
  exemplos_ativacao: string[];
  sempre_ativo?: boolean;
  prioridade_compilador: keyof EntradasCompilador;
  coletar: (ctx: ContextoColeta) => string | null | Promise<string | null>;
};

const registro: NeuronioRegistrado[] = [];

export function registrarNeuronio(n: NeuronioRegistrado): void {
  const idx = registro.findIndex((r) => r.nome === n.nome);
  if (idx >= 0) registro[idx] = n;
  else registro.push(n);
}

export function neuroniosRegistrados(): NeuronioRegistrado[] {
  return [...registro];
}

export function limparRegistroNeuronios(): void {
  registro.length = 0;
}
