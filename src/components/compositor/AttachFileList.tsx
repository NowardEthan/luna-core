import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatAttachmentSize,
  formatFileExtension,
  type ComposerAttachment,
} from '../../lib/composerAttachmentModel';
import { tokens } from '../../theme/tokens';

interface Props {
  files: ComposerAttachment[];
  loading: boolean;
  selectedUris: ReadonlySet<string>;
  browseBusy?: boolean;
  onToggleFile: (file: ComposerAttachment) => void;
  onBrowseDevice: () => void;
}

export function AttachFileList({
  files,
  loading,
  selectedUris,
  browseBusy = false,
  onToggleFile,
  onBrowseDevice,
}: Props) {
  const recentImages = files.filter((f) => f.kind === 'image');
  const recentDocs = files.filter((f) => f.kind === 'file');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {loading && files.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={tokens.accentBright} />
          <Text style={styles.loadingLabel}>A carregar recentes…</Text>
        </View>
      ) : null}

      {files.length > 0 ? (
        <>
          {recentImages.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Imagens recentes</Text>
              <View style={styles.imageRow}>
                {recentImages.map((file) => {
                  const selected = file.uri ? selectedUris.has(file.uri) : false;
                  return (
                    <Pressable
                      key={`img-${file.uri ?? file.id}`}
                      style={styles.imageTile}
                      onPress={() => onToggleFile(file)}
                      accessibilityState={{ selected }}
                    >
                      {file.uri ? (
                        <Image source={{ uri: file.uri }} style={styles.imageThumb} resizeMode="cover" />
                      ) : null}
                      <View style={[styles.imageCheck, selected && styles.imageCheckOn]}>
                        {selected ? <Ionicons name="checkmark" size={12} color={tokens.onAccent} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {recentDocs.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Arquivos recentes</Text>
              {recentDocs.map((file) => renderFileRow(file, selectedUris, onToggleFile))}
            </>
          ) : null}

          {recentImages.length > 0 && recentDocs.length === 0 ? (
            <>
              <Text style={styles.sectionLabel}>Arquivos recentes</Text>
              <Text style={styles.emptyHint}>
                PDFs e documentos que escolheres aparecem aqui para reutilizar.
              </Text>
            </>
          ) : null}
        </>
      ) : !loading ? (
        <View style={styles.emptyBlock}>
          <Ionicons name="document-outline" size={28} color={tokens.textLow} />
          <Text style={styles.emptyTitle}>Nenhum arquivo recente</Text>
          <Text style={styles.emptyHint}>
            Os ficheiros que anexares ficam guardados aqui para reutilizares rápido.
          </Text>
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, styles.browseSection]}>Adicionar novo</Text>
      <Pressable
        style={({ pressed }) => [styles.browseRow, pressed && styles.rowPressed]}
        onPress={onBrowseDevice}
        disabled={browseBusy}
        accessibilityLabel="Procurar arquivo no dispositivo"
      >
        <View style={styles.browseIcon}>
          {browseBusy ? (
            <ActivityIndicator color={tokens.accentBright} size="small" />
          ) : (
            <Ionicons name="folder-open-outline" size={20} color={tokens.accentBright} />
          )}
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.browseTitle}>Procurar no dispositivo</Text>
          <Text style={styles.browseHint}>PDF, texto, código e outros formatos</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
      </Pressable>
    </ScrollView>
  );
}

function renderFileRow(
  file: ComposerAttachment,
  selectedUris: ReadonlySet<string>,
  onToggleFile: (file: ComposerAttachment) => void,
) {
  const selected = file.uri ? selectedUris.has(file.uri) : false;
  const ext = formatFileExtension(file.name);
  return (
    <Pressable
      key={`${file.uri ?? file.id}-${file.name}`}
      style={({ pressed }) => [styles.fileRow, pressed && styles.rowPressed]}
      onPress={() => onToggleFile(file)}
      accessibilityState={{ selected }}
    >
      <View style={styles.fileBadge}>
        <Text style={styles.fileExt}>{ext}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.fileName} numberOfLines={2}>
          {file.name}
        </Text>
        <Text style={styles.fileSize}>{formatAttachmentSize(file.size)}</Text>
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? <Ionicons name="checkmark" size={14} color={tokens.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 12 },
  loading: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  loadingLabel: { fontSize: 13, color: tokens.textMid },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.textLow,
    marginBottom: 8,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  browseSection: { marginTop: 16 },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  imageTile: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: tokens.ink1,
  },
  imageThumb: { width: '100%', height: '100%' },
  imageCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCheckOn: {
    backgroundColor: tokens.accent,
    borderColor: '#FFFFFF',
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.textHigh,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
    color: tokens.textLow,
    textAlign: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(136, 193, 242, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(136, 193, 242, 0.18)',
  },
  browseIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(136, 193, 242, 0.14)',
  },
  rowMeta: { flex: 1, minWidth: 0, gap: 2 },
  browseTitle: { fontSize: 14, fontWeight: '600', color: tokens.textHigh },
  browseHint: { fontSize: 12, color: tokens.textLow },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rowPressed: { opacity: 0.82 },
  fileBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  fileExt: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.accentBright,
    textTransform: 'uppercase',
  },
  fileName: { fontSize: 14, color: tokens.textHigh },
  fileSize: { fontSize: 12, color: tokens.textLow },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: tokens.accent,
    borderColor: tokens.accent,
  },
});
