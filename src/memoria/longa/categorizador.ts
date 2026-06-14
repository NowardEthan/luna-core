/**
 * Categorizador de memórias — V1.7 (retrieval semântico, revisado)
 *
 * Categorias ajustadas com base em análise de cobertura:
 * - `episodio` removido: difícil inferir por regras, deve ser atribuído pelo LLM na reflexão
 * - `fato_pessoal` dividido em `perfil` (estável) e `estado` (temporário)
 * - `objetivo` adicionado: metas e intenções com temporalidade — muito frequentes em projetos
 */

export type CategoriaMemoria =
  | "preferencia"      // preferências de estilo, formato, comportamento — persistentes
  | "perfil"           // fatos estáveis: nome, saúde, profissão, identidade
  | "estado"           // contexto temporário: emocional, situacional, em andamento
  | "contexto_tecnico" // ferramentas, linguagens, projetos, arquitetura
  | "objetivo"         // metas e intenções com temporalidade
  | "limite";          // restrições ou limites definidos pelo usuário

// ─── Padrões por categoria ────────────────────────────────────────────────────

const PADROES_LIMITE: RegExp[] = [
  /\bnao (quero|gostaria|preciso|me pergunte)\b/i,
  /\bevite\b/i,
  /\bnunca (mencione|fale|diga|pergunte)\b/i,
  /\bnao mencione\b/i,
  /\bmantenha (isso |este |essa )?(privado|entre nos)\b/i,
];

const PADROES_OBJETIVO: RegExp[] = [
  /\bquero (lançar|lancar|terminar|concluir|implementar|criar|construir|desenvolver|finalizar|publicar|entregar)\b/i,
  /\bminha (meta|missao|missão|visao|visão)\b/i,
  /\bmeu objetivo\b/i,
  /\bpretendo\b/i,
  /\bplanejo\b/i,
  /\bvou (lançar|lancar|terminar|implementar|criar|construir|publicar|entregar)\b/i,
  /\baté (janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i,
  /\baté (essa|esta|proxima|próxima|próximo|proximo) (semana|versao|versão|release|sprint|mes|mês)\b/i,
  /\b(lançar|lancar|publicar|entregar) (o|a) (luna|projeto|sistema|versao|versão|v\d)\b/i,
];

const PADROES_PREFERENCIA: RegExp[] = [
  /\bprefiro\b/i,
  /\bgosto de\b/i,
  /\bnao gosto\b/i,
  /\bsempre (use|utilize|escreva|responda|fale|prefira|coloque|comunique)\b/i,
  /\bquando.*sempre\b/i,
  /\bpor favor (use|escreva|responda)\b/i,
];

const PADROES_ESTADO: RegExp[] = [
  /\b(estou|to|tô) (me sentindo|cansad\w*|ansios\w*|estressad\w*|animad\w*|motivad\w*|sobrecarregad\w*|frustrad\w*|empolad\w*|bloqueado)\b/i,
  /\bme sinto\b/i,
  /\bhoje (estou|tô|to|me sinto)\b/i,
  /\bessas? (semana|dias|semanas)\b/i,
  /\bestou no meio de\b/i,
  /\bestou tentando\b/i,
  /\bpouca energia\b/i,
  /\bburnout\b/i,
  /\bno momento\b/i,
  /\batualmente (estou|to|tô)\b/i,
];

const PADROES_TECNICO: RegExp[] = [
  /\b(typescript|javascript|python|rust|go|java|c\+\+|kotlin|swift)\b/i,
  /\b(codigo|código|função|funcao|api|rest|graphql|sql|banco de dados|database)\b/i,
  /\b(sistema|arquitetura|pipeline|framework|biblioteca|library|dependencia)\b/i,
  /\b(npm|git|docker|linux|windows|terminal|cli|deploy|servidor|server)\b/i,
  /\b(frontend|backend|fullstack|devops|cloud|aws|azure|gcp)\b/i,
  /\b(bug|erro|error|debug|refatora|refactor|teste|test)\b/i,
  /\bprojeto\b/i,
];

const PADROES_PERFIL: RegExp[] = [
  /\bme chamo\b/i,
  /\bmeu nome\b/i,
  /\bsou (arquiteto|dev|desenvolvedor|engenheiro|designer|estudante|pesquisador)\b/i,
  /\btrabalho com\b/i,
  /\bmoro\b/i,
  /\btenho (diabetes|hipertensao|depressao|ansiedade|tdah|cancer|autismo|epilepsia|sindrome)\b/i,
  /\bsou (autista|neurodivergente|gay|trans|lesbic|bissexual)\b/i,
  /\b(sou|tenho) (transtorno|diagnostico|condicao)\b/i,
];

// ─── Normalização ─────────────────────────────────────────────────────────────

function normalizarTexto(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ─── Inferência ───────────────────────────────────────────────────────────────

/**
 * Infere a categoria semântica de um conteúdo de memória ou query.
 *
 * Ordem de precedência (mais específico → mais genérico):
 * limite → objetivo → preferencia → estado → contexto_tecnico → perfil
 */
export function inferirCategoria(
  conteudo: string,
  tipoHint?: string,
): CategoriaMemoria {
  // Hints de tipo têm precedência — evitam custo de regex
  if (tipoHint === "preferencia") return "preferencia";
  if (tipoHint === "informacao_sensivel") return "perfil";
  if (tipoHint === "confirmacao_usuario") return "perfil";

  const texto = normalizarTexto(conteudo);

  if (PADROES_LIMITE.some((r) => r.test(texto))) return "limite";
  if (PADROES_OBJETIVO.some((r) => r.test(texto))) return "objetivo";
  if (PADROES_PREFERENCIA.some((r) => r.test(texto))) return "preferencia";
  if (PADROES_ESTADO.some((r) => r.test(texto))) return "estado";
  if (PADROES_TECNICO.some((r) => r.test(texto))) return "contexto_tecnico";
  if (PADROES_PERFIL.some((r) => r.test(texto))) return "perfil";

  return "perfil";
}

// ─── Fallback de retrieval ────────────────────────────────────────────────────

/**
 * Categorias relacionadas para fallback inteligente no retrieval.
 * Ao buscar categoria A e não encontrar suficiente, procura nestas também.
 */
export const CATEGORIAS_RELACIONADAS: Record<CategoriaMemoria, CategoriaMemoria[]> = {
  preferencia:      ["perfil", "contexto_tecnico"],
  perfil:           ["objetivo", "estado"],
  estado:           ["perfil", "objetivo"],
  contexto_tecnico: ["preferencia", "objetivo"],
  objetivo:         ["perfil", "contexto_tecnico"],
  limite:           ["perfil"],
};
