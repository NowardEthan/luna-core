import React, { useMemo } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import Markdown, {
  MarkdownIt,
  type ASTNode,
  type RenderRules,
} from 'react-native-markdown-display';

import { tokens } from '../../theme/tokens';
import {
  excerptHighlightStyle,
  excerptHighlightStyles,
  findExcerptRange,
  splitTextWithExcerpt,
} from './excerptHighlight';
import { MessageCodeBlock } from './MessageCodeBlock';
import { normalizeCodeLanguage } from './messageCodeTheme';

const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

const markdownIt = MarkdownIt({ typographer: true, linkify: true });

type Props = {
  content: string;
  highlightExcerpt?: string;
};

function trimFenceContent(content: string): string {
  if (content.charAt(content.length - 1) === '\n') {
    return content.substring(0, content.length - 1);
  }
  return content;
}

function fenceLanguage(node: ASTNode): string | null {
  const info = (node as ASTNode & { sourceInfo?: string }).sourceInfo;
  if (!info?.trim()) return null;
  return normalizeCodeLanguage(`language-${info.trim()}`);
}

function useMarkdownRules(highlightExcerpt?: string): RenderRules {
  const excerpt = highlightExcerpt?.trim() ?? '';

  return useMemo(() => {
    const rules: RenderRules = {
      fence(node, _children, _parent, _styles) {
        const code = trimFenceContent(node.content);
        return (
          <MessageCodeBlock
            key={node.key}
            code={code}
            language={fenceLanguage(node)}
            highlightExcerpt={excerpt || undefined}
          />
        );
      },
      table(node, children, _parent, styles) {
        return (
          <ScrollView
            key={node.key}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={markdownStyles.tableScroll}
          >
            <View style={styles._VIEW_SAFE_table}>{children}</View>
          </ScrollView>
        );
      },
    };

    if (!excerpt) return rules;

    rules.text = (node, _children, _parent, styles, inheritedStyles = {}) => {
      const parts = splitTextWithExcerpt(node.content, excerpt);
      if (!parts.some((p) => p.highlighted)) {
        return (
          <Text key={node.key} style={[inheritedStyles, styles.text]}>
            {node.content}
          </Text>
        );
      }
      return (
        <Text key={node.key} style={[inheritedStyles, styles.text]}>
          {parts.map((part, i) =>
            part.highlighted ? (
              <Text key={i} style={[inheritedStyles, styles.text, excerptHighlightStyle]}>
                {part.text}
              </Text>
            ) : (
              <Text key={i}>{part.text}</Text>
            ),
          )}
        </Text>
      );
    };

    rules.code_inline = (node, _children, _parent, styles, inheritedStyles = {}) => {
      const content = node.content;
      const matched = !!findExcerptRange(content, excerpt);
      return (
        <Text
          key={node.key}
          style={[
            inheritedStyles,
            styles.code_inline,
            matched ? excerptHighlightStyles.inlineCodeMatch : null,
          ]}
        >
          {content}
        </Text>
      );
    };

    return rules;
  }, [excerpt]);
}

export function MessageMarkdownInner({ content, highlightExcerpt }: Props) {
  const rules = useMarkdownRules(highlightExcerpt);

  return (
    <Markdown
      markdownit={markdownIt}
      mergeStyle
      style={markdownStyles}
      rules={rules}
      onLinkPress={(url) => {
        void Linking.openURL(url);
        return false;
      }}
    >
      {content}
    </Markdown>
  );
}

export const MessageMarkdown = React.memo(MessageMarkdownInner, (prev, next) => {
  return prev.content === next.content && prev.highlightExcerpt === next.highlightExcerpt;
});

const baseText: TextStyle = {
  fontSize: 15,
  lineHeight: 24,
  color: tokens.textHigh,
};

const markdownStyles = StyleSheet.create({
  body: {
    ...baseText,
    marginTop: 0,
    marginBottom: 0,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 12,
  },
  heading1: {
    ...baseText,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 8,
  },
  heading2: {
    ...baseText,
    fontSize: 15.5,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 8,
  },
  heading3: {
    ...baseText,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 6,
    color: tokens.accentText,
  },
  heading4: {
    ...baseText,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 6,
    color: tokens.accentText,
  },
  strong: {
    fontWeight: '600',
    color: tokens.textHigh,
  },
  em: {
    fontStyle: 'italic',
    color: tokens.textMid,
  },
  s: {
    textDecorationLine: 'line-through',
    color: tokens.textLow,
  },
  link: {
    color: tokens.accentText,
    textDecorationLine: 'underline',
  },
  code_inline: {
    fontFamily: mono,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.chipFg,
    backgroundColor: tokens.chipBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bullet_list: {
    marginTop: 2,
    marginBottom: 12,
  },
  ordered_list: {
    marginTop: 2,
    marginBottom: 12,
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bullet_list_icon: {
    ...baseText,
    width: 14,
    color: tokens.textLow,
    marginLeft: 0,
    marginRight: 0,
  },
  bullet_list_content: {
    ...baseText,
    flex: 1,
  },
  ordered_list_icon: {
    ...baseText,
    width: 18,
    color: tokens.textLow,
    marginLeft: 0,
    marginRight: 0,
  },
  ordered_list_content: {
    ...baseText,
    flex: 1,
  },
  blockquote: {
    marginTop: 2,
    marginBottom: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(75, 117, 242, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: tokens.accent,
  },
  hr: {
    backgroundColor: tokens.glassBorder,
    height: StyleSheet.hairlineWidth * 2,
    marginVertical: 12,
  },
  tableScroll: {
    marginBottom: 10,
  },
  table: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.glassBorder,
  },
  th: {
    ...baseText,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.accentText,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 88,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  td: {
    ...baseText,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 88,
  },
});
