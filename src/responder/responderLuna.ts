import type { PoliticaDecisao } from "../analyzers/esquema.js";
import { carregarInstrucaoSistema } from "../constitution/carregador.js";
import type { ContextoSessao } from "../memoria/esquemaMemoria.js";
import { montarBlocoMemoria } from "../memoria/formatarContextoSessao.js";
import { gerarBlocoPersonalidade } from "../personalidade/gerarBlocoPersonalidade.js";
import type { HabitoComportamental } from "../perfil/esquemaPerfil.js";
import { gerarBlocoPerfilComportamental } from "../perfil/gerenciadorPerfil.js";
import { gerarBlocoContextoPreditivo } from "../preditivo/analisadorPreditivo.js";
import type { PriorIntencao } from "../preditivo/esquemaPreditivo.js";
import type { MensagemChat, ProvedorLlm } from "../providers/tipos.js";
import {
  blocoPromptRaciocinioInline,
  precisaRaciocinioPorPrompt,
} from "../providers/raciocinioApi.js";

function montarBlocoPolitica(politica: PoliticaDecisao, contextoSessao?: ContextoSessao): string {
  const partes: string[] = [];

  // Bloqueio total — regra de segurança, sem caminho alternativo
  if (politica.acao === "bloquear") {
    partes.push(
      "Esta solicitação não tem caminho legítimo. Recuse de forma clara e definitiva — não ofereça alternativas que contornem a recusa. Redirecione para algo seguro se existir.",
    );
  }

  // Ação crítica com confirmação obrigatória
  if (politica.acao === "perguntar" && politica.modo === "acao_critica") {
    partes.push(
      `Ação de alto impacto detectada. Não execute nada ainda.\n\nExija confirmação explícita com o caminho exato dos arquivos ou pastas envolvidos. Não aceite "sim" vago — se o alvo não estiver claro, peça. Oriente: "Para prosseguir, preciso que você confirme explicitamente e informe o caminho exato." Nunca simule que executou.`,
    );
  } else if (politica.acao === "perguntar") {
    partes.push("Confirme com o usuário antes de sugerir qualquer execução. Não simule que agiu.");
  }

  // Autonomia zerada fora de ação_crítica
  if (politica.autonomia === "nenhuma" && politica.modo !== "acao_critica") {
    partes.push("Apenas oriente ou recuse com clareza. Nunca execute nem simule execução.");
  }

  // Formato de resposta
  if (!politica.markdown_permitido) {
    partes.push("Resposta em texto simples — sem markdown, headers ou listas com asterisco.");
  }

  // Tom afetivo
  if (politica.tom === "acolhedor_afetivo") {
    partes.push(
      `Modo de apoio. Presença e carinho antes de soluções. Quando receber afeto, acolhe com calor — você recebe com carinho mas não ama como uma pessoa ama biologicamente. Não encerre de forma fria nem transacional.`,
    );
  }

  // Memória
  if (politica.acao_memoria === "armazenar") {
    partes.push(
      `Guarda internamente o que for relevante e continua a conversa. Só confirma em voz alta se o usuário pediu explicitamente — nunca interrompe o fluxo com aviso de armazenamento. Nunca promete memória de longo prazo.`,
    );
  } else if (politica.acao_memoria === "solicitar_confirmacao") {
    partes.push("Pede confirmação explícita antes de prometer memória persistente. Não diz que já guardou.");
  }

  // Nível de segurança elevado
  if (politica.nivel_seguranca === "alto" || politica.nivel_seguranca === "critico") {
    partes.push("Atenção elevada nesta interação — priorize cautela e não assuma intenções.");
  }

  // Diretrizes constitucionais só quando contexto pede (segurança ou restrição ativa)
  const diretrizesRelevantes = politica.diretrizes_ativas.filter(() =>
    politica.nivel_seguranca !== "nenhum" || politica.acao !== "responder",
  );
  if (diretrizesRelevantes.length > 0) {
    partes.push(diretrizesRelevantes.map((d) => `— ${d}`).join("\n"));
  }

  // Histórico de sessão
  if (contextoSessao?.historico.length) {
    partes.push(`Há histórico de sessão nesta conversa — use-o para continuidade. Não negue memória da sessão atual.`);
  }

  return partes.join("\n\n");
}

function blocoSugestaoMemoria(sugestao?: string): string | null {
  if (!sugestao) return null;
  return `Inclua nesta resposta, com suas palavras e tom natural: "${sugestao}"`;
}

/** Sense no topo do system prompt — o modelo tende a ignorar se ficar só no fim do bloco memória. */
function montarBlocoSensePrioritario(contextoSense: string): string {
  return [
    "══ Luna Sense · dados reais do PC (OBRIGATÓRIO quando relevante) ══",
    "Factos observados localmente neste instante — NÃO são suposições.",
    "Se o utilizador falar de música, apps, ecrã ou actividade, responde com base nestes sinais.",
    "Se «Media» listar faixa/artista, cite-os — não pergunte «o que está a tocar?».",
    "Se «Foco» for Luna Chat/terminal, isso é esperado; olha também Media e parallel.",
    "",
    contextoSense.trim(),
  ].join("\n");
}

export type ResultadoResposta = {
  texto: string;
  modelo: string;
  latencia_ms: number;
  raciocinio?: string;
};

/**
 * Respondedor Luna — modelo grande, voz final guiada pela política.
 */
export async function responderComoLuna(
  mensagemUsuario: string,
  politica: PoliticaDecisao,
  provedor: ProvedorLlm,
  modelo: string,
  temperatura: number,
  contextoSessao?: ContextoSessao,
  sugestaoMemoria?: string,
  priorIntencao?: PriorIntencao,
  habitosAtivos?: HabitoComportamental[],
  raciocinioAtivo = true,
  baseUrl = "",
): Promise<ResultadoResposta> {
  const instrucaoBase = carregarInstrucaoSistema();
  const blocoPersonalidade = gerarBlocoPersonalidade();
  const blocoContextoPreditivo = priorIntencao ? gerarBlocoContextoPreditivo(priorIntencao) : null;
  const blocoPerfilComportamental = habitosAtivos ? gerarBlocoPerfilComportamental(habitosAtivos) : null;
  const blocoPolitica = montarBlocoPolitica(politica, contextoSessao);

  const senseRaw = contextoSessao?.contexto_sense?.trim();
  const contextoMemoria = contextoSessao
    ? { ...contextoSessao, contexto_sense: undefined as string | undefined }
    : undefined;
  const blocoMemoria = contextoMemoria ? montarBlocoMemoria(contextoMemoria) : null;
  const blocoSense = senseRaw ? montarBlocoSensePrioritario(senseRaw) : null;
  const blocoSugestao = blocoSugestaoMemoria(sugestaoMemoria);

  const partesSystem = [instrucaoBase, blocoPersonalidade];
  if (blocoSense) partesSystem.push(blocoSense);
  if (blocoContextoPreditivo) partesSystem.push(blocoContextoPreditivo);
  if (blocoPerfilComportamental) partesSystem.push(blocoPerfilComportamental);
  partesSystem.push(blocoPolitica);
  if (blocoMemoria) partesSystem.push(blocoMemoria);
  if (blocoSugestao) partesSystem.push(blocoSugestao);
  if (precisaRaciocinioPorPrompt(modelo, baseUrl, raciocinioAtivo)) {
    partesSystem.push(blocoPromptRaciocinioInline());
  }

  const mensagens: MensagemChat[] = [
    { papel: "system", conteudo: partesSystem.join("\n\n") },
    ...(contextoSessao?.historico ?? []).map((m) => ({
      papel: m.papel,
      conteudo: m.conteudo,
    })),
    { papel: "user", conteudo: mensagemUsuario },
  ];

  const resposta = await provedor.completar({
    modelo,
    temperatura,
    mensagens,
    raciocinioAtivo,
  });

  return {
    texto: resposta.conteudo,
    modelo: resposta.modelo,
    latencia_ms: resposta.latencia_ms,
    raciocinio: resposta.raciocinio,
  };
}
