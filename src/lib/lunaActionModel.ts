export type LunaActionStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export type LunaReasoningStatus = 'done';

export type LunaReasoning = {
  id: string;
  text: string;
  status: LunaReasoningStatus;
};

export type LunaWebSourceStatus =
  | 'found'
  | 'reading'
  | 'read'
  | 'verified'
  | 'rejected'
  | 'cited';

export type LunaWebSource = {
  id: string;
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
  status?: LunaWebSourceStatus;
  publishedAt?: string;
};

export type LunaResearchCitation = {
  id: string;
  index: number;
  sourceId: string;
  title: string;
  url: string;
  excerpt?: string;
};

export type LunaActionStepKind =
  | 'reason'
  | 'plan'
  | 'read'
  | 'search'
  | 'write'
  | 'run'
  | 'verify'
  | 'iterate'
  | 'summarize';

export type LunaActionStep = {
  id: string;
  label: string;
  detail?: string;
  status: LunaActionStepStatus;
  kind?: LunaActionStepKind;
  iteration?: { current: number; total: number };
  reasoning?: LunaReasoning;
  queries?: string[];
  sources?: LunaWebSource[];
  citations?: LunaResearchCitation[];
};

export type LunaActionRunStatus = 'running' | 'done' | 'error';

export type LunaActionRunProfile = 'task' | 'deep-research';

export type LunaActionRun = {
  id: string;
  title?: string;
  status: LunaActionRunStatus;
  steps: LunaActionStep[];
  profile?: LunaActionRunProfile;
};

export const LUNA_ACTION_COPY = {
  running: 'A executar',
  done: 'Concluído',
  error: 'Falhou',
  steps: '{count} passos',
  expand: 'Mostrar passos',
  collapse: 'Ocultar passos',
  iteration: 'Iteração {current}/{total}',
  reasoning: 'Raciocínio',
  orientTask: 'Analisar pedido',
  planningNext: 'A definir próximos passos…',
  planningResearch: 'A explorar mais fontes na web…',
  profileTask: 'Execução',
  profileDeepResearch: 'Pesquisa profunda',
  runningResearch: 'A pesquisar',
  doneResearch: 'Relatório pronto',
  sources: 'Fontes',
  queries: 'Consultas',
  citations: 'Referências',
  sourceReading: 'A ler',
  sourceRead: 'Lida',
  sourceVerified: 'Confirmada',
  sourceRejected: 'Descartada',
  sourceCited: 'Citada',
  sourceFound: 'Encontrada',
  sourceDiscovering: 'A encontrar fontes…',
  runningSearch: 'A pesquisar na web',
  runningRead: 'A ler fontes',
  runningVerify: 'A verificar',
  researchPhases: '{done}/{total} fases',
  researchMetricSources: '{count} fonte',
  researchMetricQueries: '{count} consulta',
  researchMetricCitations: '{count} referência',
} as const;

export const LUNA_WEB_SOURCE_STATUS_LABEL: Record<LunaWebSourceStatus, string> = {
  found: LUNA_ACTION_COPY.sourceFound,
  reading: LUNA_ACTION_COPY.sourceReading,
  read: LUNA_ACTION_COPY.sourceRead,
  verified: LUNA_ACTION_COPY.sourceVerified,
  rejected: LUNA_ACTION_COPY.sourceRejected,
  cited: LUNA_ACTION_COPY.sourceCited,
};

export const LUNA_STEP_STATUS_LABEL: Record<LunaActionStepStatus, string> = {
  pending: 'Pendente',
  running: 'A executar',
  done: 'Concluído',
  error: 'Falhou',
  skipped: 'Ignorado',
};

export const LUNA_STEP_KIND_LABEL: Record<LunaActionStepKind, string> = {
  reason: 'Análise',
  plan: 'Plano',
  read: 'Leitura',
  search: 'Pesquisa',
  write: 'Escrita',
  run: 'Execução',
  verify: 'Verificação',
  iterate: 'Iteração',
  summarize: 'Resumo',
};

export function countActionSteps(steps: LunaActionStep[], status: LunaActionStepStatus): number {
  return steps.filter((step) => step.status === status).length;
}

export function activeActionStep(steps: LunaActionStep[]): LunaActionStep | undefined {
  return steps.find((step) => step.status === 'running');
}

export function isDeepResearchRun(run: LunaActionRun): boolean {
  return run.profile === 'deep-research';
}

export type LunaResearchRunMetrics = {
  sourceCount: number;
  queryCount: number;
  citationCount: number;
  doneSteps: number;
  totalSteps: number;
};

export function researchRunMetrics(steps: LunaActionStep[]): LunaResearchRunMetrics {
  const sourceIds = new Set<string>();
  let queryCount = 0;
  let citationCount = 0;

  for (const step of steps) {
    queryCount += step.queries?.length ?? 0;
    citationCount += step.citations?.length ?? 0;
    for (const source of step.sources ?? []) {
      sourceIds.add(source.id);
    }
  }

  return {
    sourceCount: sourceIds.size,
    queryCount,
    citationCount,
    doneSteps: countActionSteps(steps, 'done'),
    totalSteps: steps.length,
  };
}

export function formatResearchPhases(done: number, total: number): string {
  return LUNA_ACTION_COPY.researchPhases
    .replace('{done}', String(done))
    .replace('{total}', String(total));
}

export function formatResearchMetricSources(count: number): string {
  return `${count} ${LUNA_ACTION_COPY.researchMetricSources}${count === 1 ? '' : 's'}`;
}

export function formatResearchMetricQueries(count: number): string {
  return `${count} ${LUNA_ACTION_COPY.researchMetricQueries}${count === 1 ? '' : 's'}`;
}

export function formatResearchMetricCitations(count: number): string {
  return `${count} ${LUNA_ACTION_COPY.researchMetricCitations}${count === 1 ? '' : 's'}`;
}

export function buildResearchRunFromSteps(
  steps: { ferramenta: string; argumento: string; sucesso?: boolean; fontes?: { title?: string; url: string }[] }[],
  opts?: {
    live?: { ferramenta: string; argumento: string; rodada: number; maxRodadas: number };
    reasoning?: string;
    citedText?: string;
  },
): LunaActionRun {
  const actionSteps: LunaActionStep[] = [];

  if (opts?.reasoning?.trim()) {
    actionSteps.push({
      id: 'rs-reasoning',
      kind: 'reason',
      label: 'Analisando pedido',
      status: 'done',
      reasoning: { id: 'rs-reasoning-text', text: opts.reasoning.trim(), status: 'done' },
    });
  }

  for (const [index, s] of steps.entries()) {
    const isUrl = s.ferramenta === 'ler_url';
    const kind: LunaActionStepKind = isUrl ? 'read' : 'search';
    const label = isUrl ? `Ler ${s.argumento}` : `Pesquisar "${s.argumento}"`;
    const sources: LunaWebSource[] | undefined = s.fontes?.map((f, i) => ({
      id: `${index}-${i}`,
      title: f.title ?? hostFromUrl(f.url),
      url: f.url,
      domain: hostFromUrl(f.url),
      snippet: (f as { snippet?: string }).snippet,
      status: s.sucesso === false ? 'rejected' : 'read',
    }));
    actionSteps.push({
      id: `rs-${index}`,
      kind,
      label,
      status: s.sucesso === false ? 'error' : 'done',
      queries: isUrl ? undefined : [s.argumento],
      sources,
    });
  }

  const allSources = actionSteps.flatMap((step) => step.sources ?? []);
  const citations: LunaResearchCitation[] = [];
  if (opts?.citedText) {
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(opts.citedText)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const sourceId = allSources.find((s) => s.url === url)?.id ?? `external-${citations.length}`;
      citations.push({ id: `cite-${citations.length}`, index: citations.length + 1, sourceId, title, url });
    }
  }

  if (citations.length > 0) {
    actionSteps.push({
      id: 'rs-citations',
      kind: 'verify',
      label: 'Referencias encontradas',
      status: 'done',
      citations,
    });
  }

  if (opts?.live && opts.live.maxRodadas > 0) {
    const isUrl = opts.live.ferramenta === 'ler_url';
    actionSteps.push({
      id: 'rs-live',
      kind: isUrl ? 'read' : 'search',
      label: isUrl ? `Ler ${opts.live.argumento}` : `Pesquisar "${opts.live.argumento}"`,
      status: 'running',
      queries: isUrl ? undefined : [opts.live.argumento],
    });
  }

  return {
    id: 'research-run',
    profile: 'deep-research',
    status: opts?.live ? 'running' : 'done',
    steps: actionSteps,
  };
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
