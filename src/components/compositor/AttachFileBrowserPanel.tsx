import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
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
import {
  getSavedSafShortcuts,
  getStorageShortcuts,
  listDeviceDirectory,
  loadDeviceDocuments,
  openStorageShortcut,
  parentDirectoryUri,
  type FileBrowserEntry,
  type StorageShortcut,
} from '../../lib/deviceFileBrowser';
import { isDocumentComposerAttachment } from '../../lib/readableDocuments';
import { tokens } from '../../theme/tokens';

interface Props {
  recentFiles: ComposerAttachment[];
  loadingRecent: boolean;
  selectedUris: ReadonlySet<string>;
  onToggleFile: (file: ComposerAttachment) => void;
  onToggleEntry: (entry: FileBrowserEntry) => void;
  onBrowseDevice?: () => void;
  browseBusy?: boolean;
  reloadKey?: number;
}

export function AttachFileBrowserPanel({
  recentFiles,
  loadingRecent,
  selectedUris,
  onToggleFile,
  onToggleEntry,
  onBrowseDevice,
  browseBusy = false,
  reloadKey = 0,
}: Props) {
  const shortcuts = useMemo(() => getStorageShortcuts(), []);
  const [savedShortcuts, setSavedShortcuts] = useState<StorageShortcut[]>([]);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [folderTitle, setFolderTitle] = useState('Arquivos');
  const [entries, setEntries] = useState<FileBrowserEntry[]>([]);
  const [deviceDocs, setDeviceDocs] = useState<FileBrowserEntry[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  /** No Android, SAF/pastas inteiras costuma ser bloqueado — só o picker nativo. */
  const androidPickerOnly = Platform.OS === 'android';
  const inFolder = !androidPickerOnly && folderUri != null;
  const recentDocs = recentFiles.filter(isDocumentComposerAttachment);

  const refreshDeviceDocs = useCallback(() => {
    if (androidPickerOnly) return;
    setLoadingDevice(true);
    void loadDeviceDocuments()
      .then(setDeviceDocs)
      .catch(() => setDeviceDocs([]))
      .finally(() => setLoadingDevice(false));
  }, [androidPickerOnly]);

  useEffect(() => {
    if (androidPickerOnly) return;
    refreshDeviceDocs();
    void getSavedSafShortcuts().then(setSavedShortcuts);
  }, [androidPickerOnly, refreshDeviceDocs, reloadKey]);

  const openFolder = useCallback((uri: string, title: string) => {
    setFolderUri(uri);
    setFolderTitle(title);
  }, []);

  const openShortcut = useCallback(
    (shortcut: StorageShortcut) => {
      void openStorageShortcut(shortcut).then((result) => {
        if (result.ok) {
          openFolder(result.uri, result.title);
          void getSavedSafShortcuts().then(setSavedShortcuts);
          refreshDeviceDocs();
          return;
        }
        if (result.reason === 'denied') {
          Alert.alert(
            'Sem autorização',
            'Não foi possível abrir esta pasta. Use «Procurar PDF, DOCX, MD…» para escolher arquivos.',
          );
        }
      });
    },
    [openFolder, refreshDeviceDocs],
  );

  const openSavedFolder = useCallback(
    (shortcut: StorageShortcut) => {
      if (shortcut.uri) openFolder(shortcut.uri, shortcut.label);
    },
    [openFolder],
  );

  const goBack = useCallback(() => {
    if (!folderUri) return;
    const parent = parentDirectoryUri(folderUri);
    if (parent) {
      setFolderUri(parent);
      setFolderTitle(
        savedShortcuts.find((s) => s.uri === parent)?.label ??
          shortcuts.find((s) => s.uri === parent)?.label ??
          nameFromUri(parent),
      );
      return;
    }
    setFolderUri(null);
    setFolderTitle('Arquivos');
  }, [folderUri, savedShortcuts, shortcuts]);

  function nameFromUri(uri: string): string {
    try {
      const decoded = decodeURIComponent(uri);
      const part = decoded.split('/').pop() ?? decoded;
      const colon = part.lastIndexOf(':');
      return colon >= 0 ? part.slice(colon + 1) : part;
    } catch {
      return 'Pasta';
    }
  }

  useEffect(() => {
    if (!folderUri || androidPickerOnly) {
      setEntries([]);
      setDirError(null);
      return;
    }

    let cancelled = false;
    setLoadingDir(true);
    setDirError(null);

    void listDeviceDirectory(folderUri, { documentsOnly: true })
      .then((items) => {
        if (cancelled) return;
        setEntries(items);
        if (items.length === 0) {
          setDirError(
            Platform.OS === 'android'
              ? 'Nenhum documento aqui. Toque em «Autorizar pasta» ou «Procurar arquivo».'
              : 'Pasta vazia ou sem permissão de leitura.',
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setDirError('Não foi possível abrir esta pasta.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDir(false);
      });

    return () => {
      cancelled = true;
    };
  }, [androidPickerOnly, folderUri]);

  const renderDocRow = useCallback(
    (file: { uri: string; name: string; size: number }, key: string, onPress: () => void) => {
      const selected = selectedUris.has(file.uri);
      const ext = formatFileExtension(file.name);
      return (
        <Pressable
          key={key}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onPress}
          accessibilityState={{ selected }}
        >
          <View style={styles.fileBadge}>
            <Text style={styles.fileExt}>{ext}</Text>
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {file.name}
            </Text>
            <Text style={styles.rowHint}>{formatAttachmentSize(file.size)}</Text>
          </View>
          <View style={[styles.check, selected && styles.checkOn]}>
            {selected ? <Ionicons name="checkmark" size={14} color={tokens.onAccent} /> : null}
          </View>
        </Pressable>
      );
    },
    [selectedUris],
  );

  const renderEntry = useCallback(
    ({ item }: { item: FileBrowserEntry }) => {
      if (item.kind === 'folder') {
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => openFolder(item.uri, item.name)}
            accessibilityLabel={`Abrir pasta ${item.name}`}
          >
            <View style={styles.folderIcon}>
              <Ionicons name="folder" size={22} color={tokens.accentBright} />
            </View>
            <View style={styles.rowMeta}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.rowHint}>Pasta</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
          </Pressable>
        );
      }

      return renderDocRow(item, item.id, () => onToggleEntry(item));
    },
    [onToggleEntry, openFolder, renderDocRow],
  );

  const listHeader = useMemo(() => {
    if (inFolder) return null;

    return (
      <View style={styles.homeSections}>
        {loadingRecent || loadingDevice ? (
          <View style={styles.loadingRecent}>
            <ActivityIndicator color={tokens.accentBright} size="small" />
          </View>
        ) : null}

        {onBrowseDevice ? (
          <>
            <Pressable
              style={[
                styles.browseBtn,
                androidPickerOnly && styles.browseBtnPrimary,
                browseBusy && styles.browseBtnDisabled,
              ]}
              onPress={onBrowseDevice}
              disabled={browseBusy}
              accessibilityLabel="Escolher arquivos no dispositivo"
            >
              {browseBusy ? (
                <ActivityIndicator color={tokens.accentBright} size="small" />
              ) : (
                <Ionicons
                  name={androidPickerOnly ? 'document-text-outline' : 'search-outline'}
                  size={20}
                  color={tokens.accentBright}
                />
              )}
              <Text style={styles.browseLabel}>
                {androidPickerOnly ? 'Escolher arquivos' : 'Procurar PDF, DOCX, MD…'}
              </Text>
            </Pressable>
            {androidPickerOnly ? (
              <Text style={styles.androidHint}>
                O Android abre o gerenciador de arquivos. Não precisa autorizar pastas — escolha
                PDF, DOCX, MD ou TXT e volte aqui.
              </Text>
            ) : null}
          </>
        ) : null}

        {!androidPickerOnly && deviceDocs.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>No celular</Text>
            {deviceDocs.map((doc) =>
              renderDocRow(doc, `device-${doc.id}`, () => onToggleEntry(doc)),
            )}
          </>
        ) : null}

        {recentDocs.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, deviceDocs.length > 0 && styles.sectionLabelSpaced]}>
              Recentes
            </Text>
            {recentDocs.map((file) =>
              renderDocRow(
                { uri: file.uri!, name: file.name, size: file.size },
                `recent-${file.uri ?? file.id}`,
                () => onToggleFile(file),
              ),
            )}
          </>
        ) : null}

        {deviceDocs.length === 0 && recentDocs.length === 0 && !loadingRecent && !loadingDevice ? (
          <View style={styles.emptyRecent}>
            <Text style={styles.emptyRecentText}>
              {androidPickerOnly
                ? 'Toque em «Escolher arquivos» para anexar PDF, DOCX, MD, TXT e outros. Os recentes aparecem aqui.'
                : 'PDF, DOCX, MD, TXT e JSON aparecem aqui. Use «Procurar» ou abra uma pasta abaixo.'}
            </Text>
          </View>
        ) : null}

        {!androidPickerOnly && savedShortcuts.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, styles.shortcutsLabel]}>Pastas autorizadas</Text>
            {savedShortcuts.map((shortcut) => (
              <Pressable
                key={shortcut.id}
                style={({ pressed }) => [styles.shortcutRow, pressed && styles.rowPressed]}
                onPress={() => openSavedFolder(shortcut)}
                accessibilityLabel={`Abrir ${shortcut.label}`}
              >
                <View style={styles.folderIcon}>
                  <Ionicons name="folder" size={22} color={tokens.accentBright} />
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowTitle}>{shortcut.label}</Text>
                  {shortcut.hint ? <Text style={styles.rowHint}>{shortcut.hint}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
              </Pressable>
            ))}
          </>
        ) : null}

        {!androidPickerOnly ? (
          <>
            <Text style={[styles.sectionLabel, styles.shortcutsLabel]}>
              {savedShortcuts.length > 0 ? 'Abrir outra pasta' : 'Pastas'}
            </Text>
            {shortcuts.map((shortcut) => (
              <Pressable
                key={shortcut.id}
                style={({ pressed }) => [styles.shortcutRow, pressed && styles.rowPressed]}
                onPress={() => openShortcut(shortcut)}
                accessibilityLabel={`Abrir ${shortcut.label}`}
              >
                <View style={styles.folderIcon}>
                  <Ionicons name="folder-open-outline" size={22} color={tokens.accentBright} />
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowTitle}>{shortcut.label}</Text>
                  {shortcut.hint ? <Text style={styles.rowHint}>{shortcut.hint}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
              </Pressable>
            ))}
          </>
        ) : null}
      </View>
    );
  }, [
    androidPickerOnly,
    browseBusy,
    deviceDocs,
    inFolder,
    loadingDevice,
    loadingRecent,
    onBrowseDevice,
    onToggleFile,
    openSavedFolder,
    openShortcut,
    recentDocs,
    renderDocRow,
    savedShortcuts,
    shortcuts,
  ]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {inFolder ? (
          <Pressable style={styles.headerBtn} onPress={goBack} hitSlop={8} accessibilityLabel="Voltar">
            <Ionicons name="chevron-back" size={22} color={tokens.textHigh} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {inFolder ? folderTitle : 'Arquivos'}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {inFolder && loadingDir && entries.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={tokens.accentBright} />
          <Text style={styles.loadingLabel}>Abrindo pasta…</Text>
        </View>
      ) : inFolder && dirError && entries.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={28} color={tokens.textLow} />
          <Text style={styles.emptyTitle}>{dirError}</Text>
        </View>
      ) : (
        <FlatList
          data={inFolder ? entries : []}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.glassBorder,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.textHigh,
    textAlign: 'center',
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingBottom: 12 },
  homeSections: { paddingBottom: 8 },
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
  sectionLabelSpaced: { marginTop: 14 },
  shortcutsLabel: { marginTop: 14 },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(136, 193, 242, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(136, 193, 242, 0.35)',
  },
  browseBtnPrimary: {
    paddingVertical: 14,
    marginBottom: 10,
  },
  browseBtnDisabled: { opacity: 0.55 },
  browseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.accentBright,
  },
  androidHint: {
    fontSize: 12,
    lineHeight: 17,
    color: tokens.textLow,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  loadingRecent: { paddingVertical: 12, alignItems: 'center' },
  emptyRecent: { paddingHorizontal: 4, paddingBottom: 8 },
  emptyRecentText: {
    fontSize: 13,
    lineHeight: 18,
    color: tokens.textLow,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: 'rgba(136, 193, 242, 0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rowPressed: { opacity: 0.82 },
  folderIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(136, 193, 242, 0.12)',
  },
  fileBadge: {
    width: 44,
    height: 44,
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
  rowMeta: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14, color: tokens.textHigh },
  rowHint: { fontSize: 12, color: tokens.textLow },
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingLabel: { fontSize: 13, color: tokens.textMid },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
  },
  emptyTitle: {
    fontSize: 14,
    color: tokens.textMid,
    textAlign: 'center',
  },
});
