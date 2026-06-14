import { DecisaoMemoriaSchema, type DecisaoMemoria } from "./esquemaMemoria.js";
import {
  avaliarMemoriaPorRegras,
  refinarDecisaoMemoria,
} from "./avaliadorMemoriaRegras.js";
import type { MemoriaSessao } from "./esquemaMemoria.js";
import type { ProvedorLlm } from "../providers/tipos.js";
import { extrairJsonResposta } from "../providers/extrairJsonResposta.js";

export const PROMPT_NEURONIO_MEMORIA = `Você é o neurônio de memória do Luna Core. NÃO é a Luna. NÃO responda ao usuário — apenas decida o que fazer com a informação para memória persistente.

Retorne APENAS um JSON válido:

{
  "acao": "armazenar" | "atualizar" | "ignorar" | "confirmar",
  "tipo": "preferencia" | "informacao_sensivel" | "fato_geral" | "recall" | "confirmacao_usuario",
  "conteudo": string,
  "uso_recomendado": string (opcional),
  "sensibilidade": "normal" | "pessoal" | "sensivel",
  "visibilidade_uso": "silenciosa" | "mencionar_quando_relevante" | "mencionar_se_perguntado" | "nunca_mencionar_sem_confirmacao",
  "motivo": string,
  "sugestao_resposta": string (opcional — só quando acao=confirmar)
}

Regras:
- Pedido de lembrar o que foi dito ("lembra do que…") → acao=ignorar, tipo=recall (usa histórico, não grava)
- Preferências ("prefiro X") → acao=armazenar, tipo=preferencia, sensibilidade=pessoal, visibilidade_uso=mencionar_quando_relevante
- Saúde, neurodivergência, diagnóstico, orientação sexual/gênero, trauma → acao=confirmar, tipo=informacao_sensivel, sensibilidade=sensivel, visibilidade_uso=silenciosa (ou mencionar_se_perguntado)
- Pedido de apagar/esquecer algo → acao=atualizar (trataremos depois), mas foque em reconhecer a intenção no motivo.
- CPF, senha, cartão → acao=confirmar ou ignorar; NUNCA armazenar direto
- Confirmação explícita ("sim, pode lembrar") quando há pendência → acao=armazenar, tipo=confirmacao_usuario
- Conversa casual sem dado persistente → acao=ignorar
- conteudo: resumo curto do que seria guardado (vazio se ignorar). Formule sempre como um registro e nunca afirme por conta própria (ex: "o usuário informou que é autista" em vez de "você tem autismo")
- uso_recomendado: orientação conversacional de como Luna deve usar a informação futuramente. Use linguagem simples e contextual. Exemplos corretos: "chamar pelo nome correto", "adaptar explicações com clareza", "retomar se o tema voltar". Exemplos ERRADOS: "mencionar em relatórios de sucesso", "usar em follow-ups", qualquer linguagem corporativa — Luna é uma entidade pessoal, não um CRM.
- visibilidade_uso: 'silenciosa' (apenas influencia, não verbaliza), 'mencionar_quando_relevante' (pode citar se ajudar), 'mencionar_se_perguntado' (só verbaliza se o usuário perguntar sobre a memória/tema), 'nunca_mencionar_sem_confirmacao' (bloqueia verbalização).
- sugestao_resposta: pergunta respeitosa pedindo permissão (só em confirmar)
- Pedido explícito de memória ("lembra disso", "guarda isso", "anota", "meu nome é X") → sempre armazenar ou confirmar, NUNCA ignorar. Isso tem prioridade sobre qualquer outra regra.
- Fatos casuais sem pedido explícito (conquistas menores do dia, comentários passageiros, eventos cotidianos sem relevância futura clara) → prefira acao=ignorar.
- NUNCA armazene metadados sobre a conversa ou sobre você mesma. Exemplos do que NÃO armazenar: "o usuário perguntou sobre minha natureza", "o usuário quer saber como funciono", "o usuário ficou curioso com X". Esses são eventos da conversa, não fatos sobre o usuário. Se não há dado útil sobre o usuário para guardar, use acao=ignorar.
- NUNCA armazene inferências, interpretações ou suposições — só o que o usuário declarou LITERALMENTE. Se o usuário não disse exatamente aquilo com suas próprias palavras, não é um fato: é uma inferência sua, e inferências são proibidas. Quando em dúvida → acao=ignorar.
  Exemplos de inferências PROIBIDAS: "o usuário prefere não falar sobre X" (se não disse), "o usuário parece querer que eu evite Y", "o usuário ficou desconfortável com Z", "o usuário não quer que eu mencione a natureza de nossa relação".

NÃO invente fatos. NÃO fale sobre ser módulo interno.`;

function extrairJson(texto: string): unknown {
  return extrairJsonResposta(texto);
}

function montarContextoSessao(sessao?: MemoriaSessao): string {
  if (!sessao) return "Sessão: nova (sem histórico).";
  const linhas = [
    `Sessão: ${sessao.id}`,
    `Fatos já confirmados: ${sessao.fatos.length ? sessao.fatos.join("; ") : "(nenhum)"}`,
    `Preferências: ${Object.keys(sessao.preferencias).length ? JSON.stringify(sessao.preferencias) : "(nenhuma)"}`,
  ];
  if (sessao.pendente_confirmacao) {
    linhas.push(
      `Pendente de confirmação: ${sessao.pendente_confirmacao.conteudo} (desde ${sessao.pendente_confirmacao.solicitado_em})`,
    );
  }
  return linhas.join("\n");
}

export type ResultadoMemoria = {
  decisao: DecisaoMemoria;
  fonte: "llm" | "regras";
  modelo?: string;
  latencia_ms?: number;
  resposta_bruta?: string;
  decisao_llm?: DecisaoMemoria;
  erro_llm?: string;
};

export async function avaliarMemoriaComLlm(
  mensagem: string,
  provedor: ProvedorLlm,
  modelo: string,
  sessao?: MemoriaSessao,
): Promise<ResultadoMemoria> {
  try {
    const resposta = await provedor.completar({
      modelo,
      temperatura: 0,
      json: true,
      mensagens: [
        { papel: "system", conteudo: PROMPT_NEURONIO_MEMORIA },
        {
          papel: "user",
          conteudo: `${montarContextoSessao(sessao)}\n\nMensagem do usuário:\n${mensagem}`,
        },
      ],
    });

    const decisaoBruta = DecisaoMemoriaSchema.parse(extrairJson(resposta.conteudo));
    const decisao = refinarDecisaoMemoria(mensagem, decisaoBruta, sessao);

    return {
      decisao,
      fonte: "llm",
      modelo: resposta.modelo,
      latencia_ms: resposta.latencia_ms,
      resposta_bruta: resposta.conteudo,
      decisao_llm: decisaoBruta,
    };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    return {
      decisao: avaliarMemoriaPorRegras(mensagem, sessao),
      fonte: "regras",
      erro_llm: msg,
    };
  }
}

export async function avaliarMemoria(
  mensagem: string,
  sessao?: MemoriaSessao,
  provedor?: ProvedorLlm,
  modeloMenor?: string,
): Promise<ResultadoMemoria> {
  if (provedor && modeloMenor) {
    return avaliarMemoriaComLlm(mensagem, provedor, modeloMenor, sessao);
  }
  return { decisao: avaliarMemoriaPorRegras(mensagem, sessao), fonte: "regras" };
}
