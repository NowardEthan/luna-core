import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { extractCitedSources, type ResearchLive, type ResearchStep } from '../../lib/researchTrace';
import { hapticListTap } from '../../lib/haptics';
import { tokens } from '../../theme/tokens';

type Props = {
  steps?: ResearchStep[];
  live?: ResearchLive;
  /** Texto final da resposta — usado só pra marcar quais fontes já foram citadas. */
  citedText?: string;
};

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function stepLabel(step: { ferramenta: string; argumento: string; sucesso?: boolean }): string {
  const isUrl = step.ferramenta === 'ler_url';
  const alvo = isUrl ? hostFromUrl(step.argumento) : `"${step.argumento}"`;
  if (step.sucesso === false) {
    return isUrl ? `Não consegui abrir ${alvo}` : `Não consegui pesquisar ${alvo}`;
  }
  return isUrl ? `Abriu ${alvo}` : `Pesquisou ${alvo}`;
}

function liveLabel(live: ResearchLive): string {
  const isUrl = live.ferramenta === 'ler_url';
  const alvo = isUrl ? hostFromUrl(live.argumento) : `"${live.argumento}"`;
  const acao = isUrl ? `Abrindo ${alvo}…` : `Pesquisando ${alvo}…`;
  return live.maxRodadas > 1 ? `${acao} (rodada ${live.rodada} de ${live.maxRodadas})` : acao;
}

export function ResearchTrace({ steps = [], live, citedText }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (steps.length === 0 && !live) return null;

  if (live) {
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <Ionicons name="search-outline" size={13} color={tokens.accentBright} />
          <Text style={styles.liveLabel} numberOfLines={1}>
            {liveLabel(live)}
          </Text>
        </View>
      </View>
    );
  }

  const fontes = steps.flatMap((s) => s.fontes ?? []);
  const citadas = citedText ? extractCitedSources(citedText, fontes) : new Set<string>();
  const summary =
    steps.length === 1
      ? stepLabel(steps[0])
      : `Pesquisou · ${fontes.length || steps.length} fonte${fontes.length === 1 ? '' : 's'}`;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.row}
        onPress={() => {
          hapticListTap();
          setExpanded((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Recolher fontes da pesquisa' : 'Ver fontes da pesquisa'}
      >
        <Ionicons name="search-outline" size={13} color={tokens.textLow} />
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {summary}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={tokens.textLow} />
      </Pressable>
      {expanded ? (
        <View style={styles.sourceList}>
          {fontes.length > 0 ? (
            fontes.map((fonte, i) => (
              <Pressable
                key={`${fonte.url}-${i}`}
                style={styles.sourceRow}
                onPress={() => void Linking.openURL(fonte.url)}
              >
                <Text style={styles.sourceTitle} numberOfLines={1}>
                  {fonte.title?.trim() || hostFromUrl(fonte.url)}
                  {citadas.has(fonte.url) ? '  ·  citada na resposta' : ''}
                </Text>
                <Text style={styles.sourceUrl} numberOfLines={1}>
                  {hostFromUrl(fonte.url)}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.sourceEmpty}>Nenhuma fonte retornada.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  liveLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textLow,
    flexShrink: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textLow,
    flex: 1,
  },
  sourceList: {
    marginTop: 6,
    gap: 8,
    paddingLeft: 18,
  },
  sourceRow: {
    gap: 1,
  },
  sourceTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: tokens.accentText,
  },
  sourceUrl: {
    fontSize: 11,
    color: tokens.textLow,
  },
  sourceEmpty: {
    fontSize: 12,
    color: tokens.textLow,
    fontStyle: 'italic',
  },
});
