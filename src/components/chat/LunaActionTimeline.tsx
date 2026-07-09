import React, { memo, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatResearchMetricCitations,
  formatResearchMetricQueries,
  formatResearchMetricSources,
  formatResearchPhases,
  isDeepResearchRun,
  LUNA_ACTION_COPY,
  LUNA_STEP_KIND_LABEL,
  LUNA_WEB_SOURCE_STATUS_LABEL,
  researchRunMetrics,
  type LunaActionRun,
  type LunaActionStep,
  type LunaActionStepKind,
  type LunaWebSource,
} from '../../lib/lunaActionModel';
import { tokens } from '../../theme/tokens';
import { type } from '../../theme/typography';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const KIND_ICON: Record<LunaActionStepKind, string> = {
  reason: '◎',
  plan: '◈',
  read: '⊟',
  search: '⌕',
  write: '✎',
  run: '▶',
  verify: '✓',
  iterate: '↻',
  summarize: '◐',
};

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function stepDotContent(step: LunaActionStep): string {
  if (step.status === 'done') return '✓';
  if (step.status === 'error') return '!';
  if (step.status === 'skipped') return '–';
  if (step.kind) return KIND_ICON[step.kind];
  return '·';
}

const SourceRow = memo(function SourceRow({ source }: { source: LunaWebSource }) {
  const domain = source.domain ?? hostFromUrl(source.url);
  return (
    <Pressable style={styles.sourceRow} onPress={() => void Linking.openURL(source.url)}>
      <View style={styles.sourceDot} />
      <View style={styles.sourceMain}>
        <Text style={styles.sourceTitle} numberOfLines={1}>
          {source.title}
        </Text>
        <View style={styles.sourceMetaRow}>
          <Text style={styles.sourceMeta}>{domain}</Text>
          {source.status && (
            <Text style={styles.sourceStatus}>{LUNA_WEB_SOURCE_STATUS_LABEL[source.status]}</Text>
          )}
        </View>
        {source.snippet ? (
          <Text style={styles.sourceSnippet} numberOfLines={2}>
            {source.snippet}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const ActionStepCard = memo(function ActionStepCard({ step }: { step: LunaActionStep }) {
  const isActive = step.status === 'running';
  const isPast = step.status === 'done' || step.status === 'error' || step.status === 'skipped';

  return (
    <View style={styles.step}>
      <View style={[styles.stepNode, isActive && styles.stepNodeActive, isPast && styles.stepNodePast]}>
        <Text style={styles.stepNodeText}>{stepDotContent(step)}</Text>
      </View>
      <View style={styles.stepCard}>
        <View style={styles.stepHeader}>
          {step.kind && (
            <Text style={styles.stepKind}>{LUNA_STEP_KIND_LABEL[step.kind]}</Text>
          )}
          {step.iteration && (
            <Text style={styles.stepIteration}>
              {LUNA_ACTION_COPY.iteration
                .replace('{current}', String(step.iteration.current))
                .replace('{total}', String(step.iteration.total))}
            </Text>
          )}
        </View>
        {step.label ? <Text style={styles.stepLabel}>{step.label}</Text> : null}
        {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
        {step.reasoning?.text ? (
          <View style={styles.thought}>
            <Text style={styles.thoughtLabel}>{LUNA_ACTION_COPY.reasoning}</Text>
            <Text style={styles.thoughtText}>{step.reasoning.text}</Text>
          </View>
        ) : null}
        {step.queries && step.queries.length > 0 ? (
          <View style={styles.queryBlock}>
            {step.queries.map((query) => (
              <View key={query} style={styles.queryChip}>
                <Text style={styles.queryChipText}>⌕ {query}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {step.sources && step.sources.length > 0 ? (
          <View style={styles.sourceList}>
            {step.sources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
});

function ResearchMetricsRow({
  sourceCount,
  queryCount,
  citationCount,
}: {
  sourceCount: number;
  queryCount: number;
  citationCount: number;
}) {
  if (sourceCount === 0 && queryCount === 0 && citationCount === 0) return null;
  return (
    <View style={styles.metricsRow}>
      {sourceCount > 0 && (
        <View style={styles.metric}>
          <Ionicons name="globe-outline" size={12} color={tokens.textLow} />
          <Text style={styles.metricText}>{formatResearchMetricSources(sourceCount)}</Text>
        </View>
      )}
      {queryCount > 0 && (
        <View style={styles.metric}>
          <Ionicons name="search-outline" size={12} color={tokens.textLow} />
          <Text style={styles.metricText}>{formatResearchMetricQueries(queryCount)}</Text>
        </View>
      )}
      {citationCount > 0 && (
        <View style={styles.metric}>
          <Ionicons name="link-outline" size={12} color={tokens.textLow} />
          <Text style={styles.metricText}>{formatResearchMetricCitations(citationCount)}</Text>
        </View>
      )}
    </View>
  );
}

export const LunaActionTimeline = memo(function LunaActionTimeline({
  run,
}: {
  run: LunaActionRun;
}) {
  const research = isDeepResearchRun(run);
  const isActive = run.status === 'running';
  const [expanded, setExpanded] = useState(isActive);
  const metrics = useMemo(() => researchRunMetrics(run.steps), [run.steps]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={[styles.wrap, research && styles.wrapResearch]}>
      <Pressable onPress={toggle} style={styles.header}>
        <View style={styles.headerMain}>
          <View style={styles.eyebrow}>
            {research && <Text style={styles.profileTag}>{LUNA_ACTION_COPY.profileDeepResearch}</Text>}
            <Text style={[styles.statusTag, isActive ? styles.statusTagRunning : styles.statusTagDone]}>
              {isActive ? LUNA_ACTION_COPY.runningResearch : LUNA_ACTION_COPY.doneResearch}
            </Text>
          </View>
          {run.title && <Text style={styles.title}>{run.title}</Text>}
          <ResearchMetricsRow
            sourceCount={metrics.sourceCount}
            queryCount={metrics.queryCount}
            citationCount={metrics.citationCount}
          />
          {research && (
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${
                        metrics.totalSteps === 0
                          ? 0
                          : Math.min(100, Math.round((metrics.doneSteps / metrics.totalSteps) * 100))
                      }%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {formatResearchPhases(metrics.doneSteps, metrics.totalSteps)}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.steps}>
          {run.steps.map((step) => (
            <ActionStepCard key={step.id} step={step} />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 12,
    marginBottom: 8,
  },
  wrapResearch: {
    borderColor: tokens.accentSoft,
    backgroundColor: tokens.surfaceRaised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerMain: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileTag: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.accentBright,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusTag: {
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusTagRunning: {
    backgroundColor: tokens.accentSoft,
    color: tokens.accentText,
  },
  statusTagDone: {
    backgroundColor: tokens.accentSoft,
    color: tokens.accentText,
  },
  title: {
    ...type.message,
    fontWeight: '600',
    color: tokens.textHigh,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: 12,
    color: tokens.textMid,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.borderSubtle,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.accent,
  },
  progressLabel: {
    fontSize: 11,
    color: tokens.textLow,
    minWidth: 50,
    textAlign: 'right',
  },
  chevron: {
    fontSize: 14,
    color: tokens.textLow,
    padding: 4,
  },
  steps: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderSubtle,
    gap: 10,
  },
  step: {
    flexDirection: 'row',
    gap: 10,
  },
  stepNode: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNodeActive: {
    backgroundColor: tokens.accentSoft,
  },
  stepNodePast: {
    backgroundColor: tokens.accentSoft,
  },
  stepNodeText: {
    fontSize: 11,
    color: tokens.textHigh,
  },
  stepCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  stepKind: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.accentBright,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepIteration: {
    fontSize: 11,
    color: tokens.textLow,
  },
  stepLabel: {
    ...type.message,
    fontWeight: '500',
    color: tokens.textHigh,
    marginBottom: 2,
  },
  stepDetail: {
    fontSize: 12,
    color: tokens.textMid,
    lineHeight: 16,
  },
  thought: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: tokens.accentSoft,
  },
  thoughtLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.accentText,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  thoughtText: {
    fontSize: 12,
    color: tokens.textMid,
    lineHeight: 16,
  },
  queryBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  queryChip: {
    backgroundColor: tokens.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  queryChipText: {
    fontSize: 11,
    color: tokens.accentText,
  },
  sourceList: {
    marginTop: 8,
    gap: 6,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: tokens.surface,
  },
  sourceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.accent,
    marginTop: 6,
  },
  sourceMain: {
    flex: 1,
  },
  sourceTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.accentText,
  },
  sourceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  sourceMeta: {
    fontSize: 11,
    color: tokens.textLow,
  },
  sourceStatus: {
    fontSize: 10,
    color: tokens.accentBright,
    fontWeight: '500',
  },
  sourceSnippet: {
    fontSize: 11,
    color: tokens.textMid,
    lineHeight: 14,
    marginTop: 4,
  },
});
