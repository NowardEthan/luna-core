/**
 * M7 — Registro padrão dos neurônios de contexto.
 */

import {
  extrairDadosAmbiente,
  extrairDadosMemoria,
  extrairDadosPresenca,
  extrairDadosSense,
} from "../responder/extrairSecoesContexto.js";
import { gerarBlocoContextoPreditivo } from "../preditivo/analisadorPreditivo.js";
import { gerarBlocoPerfilComportamental } from "../perfil/gerenciadorPerfil.js";
import { registrarNeuronio } from "./registro.js";

let inicializado = false;

export function inicializarNeuroniosPadrao(): void {
  if (inicializado) return;
  inicializado = true;

  registrarNeuronio({
    nome: "presenca",
    descricao: "onde a Luna está agora e transições entre superfícies",
    exemplos_ativacao: ["onde você está?", "em que app estamos?"],
    sempre_ativo: true,
    prioridade_compilador: "presenca",
    coletar: (ctx) =>
      ctx.contextoSessao ? extrairDadosPresenca(ctx.contextoSessao) : null,
  });

  registrarNeuronio({
    nome: "memorias",
    descricao: "memórias de longo prazo e fatos da sessão",
    exemplos_ativacao: ["lembra do que eu disse?", "o que você sabe sobre mim?"],
    sempre_ativo: true,
    prioridade_compilador: "memorias_longas",
    coletar: (ctx) =>
      ctx.contextoSessao ? extrairDadosMemoria(ctx.contextoSessao) : null,
  });

  registrarNeuronio({
    nome: "ambiente",
    descricao: "workspace IDE Forge ou contexto operacional",
    exemplos_ativacao: ["qual arquivo está aberto?", "o que tem no terminal?"],
    sempre_ativo: true,
    prioridade_compilador: "ambiente",
    coletar: (ctx) =>
      ctx.contextoSessao ? extrairDadosAmbiente(ctx.contextoSessao) : null,
  });

  registrarNeuronio({
    nome: "sense",
    descricao: "atividade atual do computador: apps, música, foco",
    exemplos_ativacao: [
      "que música tá tocando?",
      "o que eu tava fazendo?",
      "qual app tá aberto?",
      "o que estou ouvindo?",
    ],
    sempre_ativo: false,
    prioridade_compilador: "sense",
    coletar: (ctx) =>
      ctx.contextoSessao ? extrairDadosSense(ctx.contextoSessao) : null,
  });

  registrarNeuronio({
    nome: "preditivo",
    descricao: "padrão de intenções recentes na sessão",
    exemplos_ativacao: ["continuamos?", "e agora?"],
    sempre_ativo: false,
    prioridade_compilador: "preditivo",
    coletar: (ctx) =>
      ctx.prior ? gerarBlocoContextoPreditivo(ctx.prior) : null,
  });

  registrarNeuronio({
    nome: "habitos",
    descricao: "hábitos comportamentais do usuário",
    exemplos_ativacao: ["como eu prefiro?", "meu jeito de trabalhar"],
    sempre_ativo: false,
    prioridade_compilador: "habitos",
    coletar: (ctx) =>
      ctx.habitos && ctx.habitos.length > 0
        ? gerarBlocoPerfilComportamental(ctx.habitos)
        : null,
  });
}
