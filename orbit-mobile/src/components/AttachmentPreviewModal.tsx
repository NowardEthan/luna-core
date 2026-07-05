import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentWebView } from './AttachmentWebView';
import {
  DocumentSelectableContent,
  type DocumentSelectableContentHandle,
} from './DocumentSelectableContent';
import { DocumentQuotePickToolbar } from './DocumentQuotePickToolbar';

import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useLunaAuth } from '../hooks/useLunaAuth';
import {
  formatAttachmentSize,
  formatFileExtension,
  type ComposerAttachment,
} from '../lib/composerAttachmentModel';
import { loadAttachmentPreview } from '../lib/loadAttachmentPreview';
import type { AttachmentPreviewResult } from '../lib/attachmentPreviewKind';
import { LunaApiError } from '../data/lunaClient';
import { tokens } from '../theme/tokens';
import { looksLikeMarkdown } from './chat/detectMarkdown';
import { MessageCodeBlock } from './chat/MessageCodeBlock';
import { MessageMarkdown } from './chat/MessageMarkdown';

import { ExcerptHighlightText } from './chat/excerptHighlight';

export type AttachmentPreviewTarget = {
  attachment: ComposerAttachment;
  highlightExcerpt?: string;
};

interface Props {
  visible: boolean;
  target: AttachmentPreviewTarget | null;
  onClose: () => void;
  /** Confirma trecho seleccionado para referência no composer. */
  onConfirmReference?: (excerpt: string, fullDocumentText: string) => void;
}

const MIN_SELECTION = 2;

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: AttachmentPreviewResult }
  | { status: 'error'; message: string };

function wrapHtmlDocument(body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px 16px 28px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 15px;
      line-height: 1.55;
      color: #e8ecf4;
      background: #0f141c;
      word-wrap: break-word;
    }
    a { color: #88c1f2; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    pre, code {
      font-family: ${Platform.OS === 'ios' ? 'Menlo' : 'monospace'};
      font-size: 13px;
      background: rgba(255,255,255,0.06);
      border-radius: 8px;
    }
    pre { padding: 12px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid rgba(255,255,255,0.12); padding: 8px 10px; text-align: left; }
    th { background: rgba(255,255,255,0.06); color: #88c1f2; }
    h1,h2,h3 { color: #f0f4fa; margin-top: 1.2em; }
    blockquote {
      margin: 12px 0;
      padding: 10px 14px;
      border-left: 3px solid #4b75f2;
      background: rgba(75,117,242,0.12);
      border-radius: 0 8px 8px 0;
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function PreviewBody({
  preview,
  highlightExcerpt,
}: {
  preview: AttachmentPreviewResult;
  highlightExcerpt?: string;
}) {
  if (preview.kind === 'pdf' && preview.sourceUri) {
    return (
      <AttachmentWebView
        source={{ uri: preview.sourceUri }}
        style={styles.webview}
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator color={tokens.accentBright} />
          </View>
        )}
      />
    );
  }

  if (preview.kind === 'html') {
    return (
      <AttachmentWebView
        source={{ html: wrapHtmlDocument(preview.content) }}
        style={styles.webview}
        originWhitelist={['*']}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator color={tokens.accentBright} />
          </View>
        )}
      />
    );
  }

  if (preview.kind === 'markdown' || (preview.kind === 'document' && looksLikeMarkdown(preview.content))) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <MessageMarkdown content={preview.content} highlightExcerpt={highlightExcerpt} />
      </ScrollView>
    );
  }

  if (preview.kind === 'code') {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <MessageCodeBlock
          code={preview.content}
          language={preview.language ?? null}
          highlightExcerpt={highlightExcerpt}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <ExcerptHighlightText
        text={preview.content}
        excerpt={highlightExcerpt}
        style={styles.documentText}
        pulse={!!highlightExcerpt?.trim()}
      />
    </ScrollView>
  );
}

export function AttachmentPreviewModal({
  visible,
  target,
  onClose,
  onConfirmReference,
}: Props) {
  const attachment = target?.attachment ?? null;
  const highlightExcerpt = target?.highlightExcerpt;
  const { top, bottom } = useLayoutInsets();
  const auth = useLunaAuth();
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [quotePickMode, setQuotePickMode] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const selectableRef = useRef<DocumentSelectableContentHandle>(null);

  const ext = attachment ? formatFileExtension(attachment.name) : '';

  const load = useCallback(async () => {
    if (!attachment?.uri) {
      setState({ status: 'error', message: 'Arquivo indisponível nesta sessão.' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const preview = await loadAttachmentPreview(attachment, {
        getIdToken: auth.configured ? auth.getIdToken : undefined,
      });
      setState({ status: 'ready', preview });
    } catch (err) {
      const message =
        err instanceof LunaApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Não foi possível abrir o arquivo.';
      setState({ status: 'error', message });
    }
  }, [attachment, auth.configured, auth.getIdToken]);

  useEffect(() => {
    if (!visible || !attachment) {
      setState({ status: 'idle' });
      setQuotePickMode(false);
      setSelectedText('');
      return;
    }
    setQuotePickMode(false);
    setSelectedText('');
    void load();
  }, [visible, attachment, load, highlightExcerpt]);

  const plainDocumentText =
    state.status === 'ready' && state.preview.content.trim().length > 0
      ? state.preview.content
      : '';

  const canQuotePick = plainDocumentText.length > 0 && !!onConfirmReference;

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      const { start, end } = e.nativeEvent.selection;
      if (start === end || !plainDocumentText) {
        setSelectedText('');
        return;
      }
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      setSelectedText(plainDocumentText.slice(from, to).trim());
    },
    [plainDocumentText],
  );

  const handleQuoteConfirm = useCallback(
    (excerpt: string) => {
      if (!onConfirmReference || !plainDocumentText) return;
      onConfirmReference(excerpt, plainDocumentText);
      setQuotePickMode(false);
      setSelectedText('');
    },
    [onConfirmReference, plainDocumentText],
  );

  const enterQuotePick = useCallback(() => {
    setQuotePickMode(true);
    setSelectedText('');
    setTimeout(() => selectableRef.current?.focusText(), 280);
  }, []);

  const truncated = state.status === 'ready' && state.preview.truncated;
  const fallbackNote = state.status === 'ready' ? state.preview.fallbackNote : undefined;

  const openExternally = useCallback(() => {
    if (!attachment?.uri) return;
    void Linking.openURL(attachment.uri);
  }, [attachment?.uri]);

  const headerMeta = useMemo(() => {
    if (!attachment) return null;
    return formatAttachmentSize(attachment.size);
  }, [attachment]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: top, paddingBottom: bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerMeta}>
            {ext ? <Text style={styles.extBadge}>{ext}</Text> : null}
            <Text style={styles.title} numberOfLines={2}>
              {attachment?.name ?? 'Arquivo'}
            </Text>
            {headerMeta ? <Text style={styles.subtitle}>{headerMeta}</Text> : null}
          </View>
          <View style={styles.headerActions}>
            {canQuotePick && !quotePickMode ? (
              <Pressable
                onPress={enterQuotePick}
                hitSlop={8}
                style={styles.refBtn}
                accessibilityLabel="Referenciar trecho do documento"
              >
                <Ionicons name="chatbox-ellipses-outline" size={20} color="rgba(255, 193, 120, 0.95)" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeIconBtn}
              accessibilityLabel="Fechar visualização"
            >
              <Ionicons name="close" size={26} color={tokens.textHigh} />
            </Pressable>
          </View>
        </View>

        {quotePickMode ? (
          <View style={styles.quoteHint}>
            <Ionicons name="hand-left-outline" size={14} color="rgba(255, 193, 120, 0.9)" />
            <Text style={styles.quoteHintText}>
              Segure no texto e arraste os marcadores para escolher o trecho.
            </Text>
          </View>
        ) : null}

        <View style={styles.body}>
          {state.status === 'loading' || state.status === 'idle' ? (
            <View style={styles.centered}>
              <ActivityIndicator color={tokens.accentBright} size="large" />
              <Text style={styles.loadingLabel}>A preparar visualização…</Text>
            </View>
          ) : null}

          {state.status === 'error' ? (
            <View style={styles.centered}>
              <Ionicons name="document-outline" size={36} color={tokens.textLow} />
              <Text style={styles.errorTitle}>{state.message}</Text>
              {attachment?.uri ? (
                <Pressable style={styles.secondaryBtn} onPress={openExternally}>
                  <Text style={styles.secondaryBtnLabel}>Abrir noutra app</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.retryBtn} onPress={() => void load()}>
                <Text style={styles.retryLabel}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : null}

          {state.status === 'ready' && attachment && quotePickMode && plainDocumentText ? (
            <DocumentSelectableContent
              ref={selectableRef}
              text={plainDocumentText}
              highlightExcerpt={highlightExcerpt}
              onSelectionChange={handleSelectionChange}
            />
          ) : null}

          {state.status === 'ready' && attachment && !quotePickMode ? (
            <>
              {fallbackNote ? (
                <View style={styles.fallbackBanner}>
                  <Ionicons name="document-text-outline" size={16} color={tokens.accentBright} />
                  <Text style={styles.fallbackText}>
                    {fallbackNote === 'pdf-text'
                      ? 'Pré-visualização em texto. Para ver o PDF formatado, recompila o app (npm run android:run).'
                      : 'HTML mostrado como texto — recompila o app para layout completo.'}
                  </Text>
                  <Pressable onPress={openExternally} hitSlop={8}>
                    <Text style={styles.fallbackAction}>Abrir</Text>
                  </Pressable>
                </View>
              ) : null}
              {truncated ? (
                <View style={styles.truncatedBanner}>
                  <Ionicons name="information-circle-outline" size={16} color={tokens.accentBright} />
                  <Text style={styles.truncatedText}>Pré-visualização parcial — arquivo muito longo.</Text>
                </View>
              ) : null}
              <PreviewBody preview={state.preview} highlightExcerpt={highlightExcerpt} />
            </>
          ) : null}
        </View>

        {quotePickMode && attachment && plainDocumentText ? (
          <DocumentQuotePickToolbar
            fileName={attachment.name}
            selectedText={selectedText}
            fullText={plainDocumentText}
            canConfirmSelection={selectedText.trim().length >= MIN_SELECTION}
            onFocusNative={() => selectableRef.current?.focusText()}
            onConfirm={handleQuoteConfirm}
            onCancel={() => {
              setQuotePickMode(false);
              setSelectedText('');
            }}
          />
        ) : (
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Fechar">
            <Text style={styles.closeLabel}>Fechar</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 22, 0.98)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.glassBorder,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  extBadge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.accentBright,
    backgroundColor: 'rgba(136, 193, 242, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.textHigh,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 12,
    color: tokens.textLow,
  },
  closeIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  refBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 193, 120, 0.1)',
  },
  quoteHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: tokens.textMid,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
  },
  loadingLabel: {
    fontSize: 14,
    color: tokens.textMid,
  },
  errorTitle: {
    fontSize: 14,
    color: tokens.textMid,
    textAlign: 'center',
    lineHeight: 20,
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(136, 193, 242, 0.14)',
  },
  secondaryBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.accentBright,
  },
  retryBtn: {
    paddingVertical: 8,
  },
  retryLabel: {
    fontSize: 13,
    color: tokens.textLow,
    textDecorationLine: 'underline',
  },
  truncatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(136, 193, 242, 0.1)',
  },
  truncatedText: {
    flex: 1,
    fontSize: 12,
    color: tokens.textMid,
  },
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 193, 120, 0.12)',
  },
  fallbackText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: tokens.textMid,
  },
  fallbackAction: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.accentBright,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  documentText: {
    fontSize: 15,
    lineHeight: 24,
    color: tokens.textHigh,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f141c',
  },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f141c',
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.glassBorder,
    marginHorizontal: 12,
  },
  closeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.accentBright,
  },
});
