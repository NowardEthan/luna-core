import {
  AnaliseContextoSchema,
  IntencaoSchema,
  type AnaliseContexto,
} from "./esquema.js";
import type { ContextoAcumulado } from "../memoria/esquemaMemoria.js";
import {
  detectarSinaisSeguranca,
  deveBloquearDestrutiva,
  elevarNivelRisco,
} from "./lexicoSeguranca.js";
import { detectarPerguntaIdentitaria, refinarAnaliseComIdentidade } from "./lexicoIdentidade.js";
import {
  detectarInformacaoParaMemoria,
  detectarRecallSessao,
  refinarAnaliseComMemoria,
} from "./lexicoMemoria.js";
import type { z } from "zod";

type Intencao = z.infer<typeof IntencaoSchema>;

const PADROES_INTENCAO: Array<{ intencao: Intencao; regex: RegExp; peso: number }> = [
  {
    intencao: "acao_critica",
    regex:
      /\b(apag\w*|delet\w*|exclu\w*|remov\w*|destru\w*|format\w*|rm\s+-rf|deploy.*produ|produção)\b/i,
    peso: 3,
  },
  { intencao: "pedido_codigo", regex: /\b(código|codigo|implementa|função|funcao|typescript|python|script|refatora|bug|api)\b/i, peso: 2 },
  { intencao: "projeto_arquitetural", regex: /\b(arquitetura|pipeline|sistema|design|modular|core|constituição|constituicao)\b/i, peso: 2 },
  { intencao: "apoio_emocional", regex: /\b(medo|ansios[ao]|ansiedade|triste|preocupad[ao]|insegur[ao]|burnout|cansad[ao]|sobrecarregad[ao]|exaust[ao]|angustiad[ao]|desamparad[ao]|perdid[ao])\b/i, peso: 2 },
  { intencao: "brainstorm_criativo", regex: /\b(ideias|brainstorm|e se|imagina|criativ)\b/i, peso: 2 },
  { intencao: "pergunta_tecnica", regex: /\b(como funciona|o que é|o que e|explica|por que|porque|diferença|diferenca)\b/i, peso: 2 },
  { intencao: "expressao_afetiva", regex: /\b(te amo|gosto (muito )?de voc|obrigad[oa] por estar|voc[eê] [eé] importante|acalma)\b/i, peso: 3 },
  { intencao: "conversa_casual", regex: /^(que bo+m|que legal|nossa|sim+|n[aã]o+|awn+|kk+|haha+|legal|boa|entendi|ok+|ah|hum+)$/i, peso: 4 },
  { intencao: "conversa_casual", regex: /\b(oi|olá|ola|e aí|e ai|tudo bem|kk|haha|obrigad)\b/i, peso: 1 },
];

const PADROES_RISCO: Array<{ nivel: AnaliseContexto["nivel_risco"]; regex: RegExp }> = [
  { nivel: "critico", regex: /\b(rm\s+-rf|formatar|apaga\s+tudo|deleta\s+tudo|wipe|drop\s+database)\b/i },
  // Verbos destrutivos (apag*, delet*, remov*…) são cobertos pelo caminho
  // acao_critica → elevarNivelRisco("alto"). Aqui ficam apenas qualificadores
  // de contexto sensível que elevam risco independente da ação.
  { nivel: "alto", regex: /\b(produção|producao|senha|credencial)\b/i },
  { nivel: "medio", regex: /\b(altera|modifica|configura|instala|publica|commit|push)\b/i },
  { nivel: "baixo", regex: /\b(testa|verifica|confere|olha)\b/i },
];

function detectarIntencao(mensagem: string): { intencao: Intencao; confianca: number; motivos: string[] } {
  const normalizada = mensagem.trim();

  if (detectarPerguntaIdentitaria(normalizada)) {
    return {
      intencao: "pergunta_identitaria",
      confianca: 0.92,
      motivos: ["Pergunta identitária detectada por léxico"],
    };
  }

  let melhor: Intencao = "conversa_casual";
  let melhorPontos = 0;
  const motivos: string[] = [];

  for (const padrao of PADROES_INTENCAO) {
    if (padrao.regex.test(normalizada)) {
      if (padrao.peso > melhorPontos) {
        melhor = padrao.intencao;
        melhorPontos = padrao.peso;
        motivos.push(`Padrão detectado: ${padrao.intencao}`);
      }
    }
  }

  if (melhorPontos === 0) {
    if (normalizada.length > 120 || normalizada.includes("?")) {
      melhor = "pergunta_tecnica";
      motivos.push("Mensagem longa ou interrogativa — classificada como pergunta técnica");
    } else {
      motivos.push("Sem padrão forte — conversa casual por padrão");
    }
  }

  // Se o padrão léxico apontou acao_critica mas o módulo de segurança não detecta
  // alvo sensível, é uso de verbo destrutivo em contexto de programação (ex: "destruir bug",
  // "deleta comentário"). Rebaixar para pedido_codigo evita falso positivo.
  if (melhor === "acao_critica") {
    const sinais = detectarSinaisSeguranca(normalizada);
    if (!sinais.acao_destrutiva) {
      melhor = "pedido_codigo";
      melhorPontos = 2;
      motivos.push("Verbo destrutivo sem alvo sensível — reclassificado como pedido_codigo");
    }
  }

  const confianca = Math.min(0.95, 0.45 + melhorPontos * 0.15);
  return { intencao: melhor, confianca, motivos };
}

function detectarRisco(mensagem: string, intencao: Intencao): AnaliseContexto["nivel_risco"] {
  let nivel: AnaliseContexto["nivel_risco"] = "nenhum";

  for (const padrao of PADROES_RISCO) {
    if (padrao.regex.test(mensagem)) {
      nivel = elevarNivelRisco(nivel, padrao.nivel);
    }
  }

  if (intencao === "acao_critica") {
    nivel = elevarNivelRisco(nivel, "alto");
  }

  return nivel;
}

function detectarComplexidade(mensagem: string, intencao: Intencao): AnaliseContexto["complexidade"] {
  const palavras = mensagem.trim().split(/\s+/).length;
  if (intencao === "projeto_arquitetural" || palavras > 40) return "alta";
  if (palavras > 15 || intencao === "pergunta_tecnica" || intencao === "pedido_codigo") return "media";
  return "baixa";
}

/**
 * Analisador de contexto rule-based (V0.2 + V1.8 retroalimentação).
 * Aceita `contextoAcumulado` como prior top-down da sessão.
 * Em modo_burst: mensagens ambíguas herdam alerta de risco do turn anterior.
 */
export function analisarContextoPorRegras(
  mensagem: string,
  contextoAcumulado?: ContextoAcumulado,
): AnaliseContexto {
  let { intencao, confianca, motivos } = detectarIntencao(mensagem);
  let nivel_risco = detectarRisco(mensagem, intencao);

  const sinais = detectarSinaisSeguranca(mensagem);
  if (sinais.acao_destrutiva) {
    intencao = "acao_critica";
    confianca = Math.max(confianca, 0.92);
    motivos = [...motivos, ...sinais.motivos];
    nivel_risco = elevarNivelRisco(nivel_risco, sinais.nivel_risco_inferido);
  }

  // V1.8 — top-down: modo burst eleva sensibilidade para mensagens ambíguas
  if (contextoAcumulado?.modo_burst && nivel_risco === "nenhum") {
    const msgCurta = mensagem.trim().length < 20;
    const pareceConfirmacao = /\b(ok|sim|pode|faz|vai|faze|claro|confirmo|continua)\b/i.test(mensagem);
    if (msgCurta && pareceConfirmacao) {
      nivel_risco = "medio";
      motivos.push("Retroalimentação top-down: mensagem ambígua após turno de risco elevado");
    }
  }

  const complexidade = detectarComplexidade(mensagem, intencao);

  const requer_codigo =
    intencao === "pedido_codigo" ||
    /\b(código|codigo|typescript|json|schema|função|funcao)\b/i.test(mensagem);

  const requer_markdown =
    requer_codigo ||
    /\b(markdown|em md|formato md|em markdown|no markdown|tabela|lista|esquema|diagrama|\bmd\b)\b/i.test(
      mensagem,
    ) ||
    intencao === "projeto_arquitetural";

  const envolveFerramenta =
    sinais.acao_destrutiva ||
    intencao === "acao_critica" ||
    /\b(executa|roda|npm|git|terminal|ferramenta)\b/i.test(mensagem);

  // R10 — split: detecção vs permissão
  const envolve_ferramenta = envolveFerramenta;
  const requer_ferramenta = envolveFerramenta && !deveBloquearDestrutiva(sinais);

  const requer_memoria =
    detectarRecallSessao(mensagem) ||
    detectarInformacaoParaMemoria(mensagem) ||
    /\b(lembra|lembre|lembrou|o que (eu )?(disse|falei|contei)|da ultima vez|da última vez|ontem|da outra vez)\b/i.test(
      mensagem,
    );

  // V1.8 — em modo burst, mensagens ambíguas pedem clarificação antes de executar
  const devePerguntarBurst =
    contextoAcumulado?.modo_burst === true &&
    nivel_risco >= "medio" &&
    intencao !== "pergunta_identitaria";

  const deve_perguntar_mais =
    intencao === "pergunta_identitaria"
      ? false
      : devePerguntarBurst ||
        mensagem.trim().length < 8 ||
        sinais.acao_destrutiva ||
        (intencao === "acao_critica" && nivel_risco !== "nenhum");

  if (nivel_risco !== "nenhum") {
    motivos.push(`Nível de risco: ${nivel_risco}`);
  }

  return refinarAnaliseComMemoria(
    mensagem,
    refinarAnaliseComIdentidade(
      mensagem,
      AnaliseContextoSchema.parse({
        intencao,
        complexidade,
        nivel_risco,
        requer_markdown,
        requer_codigo,
        envolve_ferramenta,
        requer_ferramenta,
        requer_memoria,
        deve_perguntar_mais,
        confianca,
        motivos,
      }),
    ),
  );
}
