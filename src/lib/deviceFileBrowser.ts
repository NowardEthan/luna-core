import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';

import {
  attachmentKindFromMime,
  newAttachmentId,
  type ComposerAttachment,
} from './composerAttachmentModel';
import { isDocumentAttachmentName, isMediaFileName } from './readableDocuments';

const SAF_ROOTS_KEY = 'orbit.attach.safRoots';

export type FileBrowserEntry = {
  id: string;
  name: string;
  uri: string;
  kind: 'folder' | 'file';
  size: number;
  mime: string;
};

export type StorageShortcut = {
  id: string;
  label: string;
  uri: string;
  hint?: string;
  /** Android — abre picker SAF em vez de file:// */
  androidSafFolder?: 'Download' | 'Documents' | 'pick';
};

function basename(uri: string): string {
  const clean = uri.replace(/\/+$/, '');
  const slash = clean.lastIndexOf('/');
  const raw = slash >= 0 ? clean.slice(slash + 1) : clean;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function mimeFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return 'application/octet-stream';
}

function isHiddenName(name: string): boolean {
  return name.startsWith('.') || name === 'LOST.DIR';
}

function sortEntries(entries: FileBrowserEntry[]): FileBrowserEntry[] {
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' });
  });
}

/** Na aba Arquivo: pastas + ficheiros que não são foto/vídeo/áudio. */
function filterForDocumentTab(entries: FileBrowserEntry[]): FileBrowserEntry[] {
  return entries.filter((entry) => {
    if (entry.kind === 'folder') return true;
    return !isMediaFileName(entry.name);
  });
}

function nameFromSafUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const slash = decoded.lastIndexOf('/');
  const segment = slash >= 0 ? decoded.slice(slash + 1) : decoded;
  const colon = segment.lastIndexOf(':');
  return colon >= 0 ? segment.slice(colon + 1) : segment;
}

export async function loadSafRoots(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SAF_ROOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

async function saveSafRoot(uri: string): Promise<void> {
  const existing = await loadSafRoots();
  if (existing.includes(uri)) return;
  await AsyncStorage.setItem(SAF_ROOTS_KEY, JSON.stringify([uri, ...existing].slice(0, 6)));
}

/** Atalhos — Android usa SAF (sem file://). */
export function getStorageShortcuts(): StorageShortcut[] {
  if (Platform.OS === 'android') {
    return [
      {
        id: 'download',
        label: 'Downloads',
        uri: '',
        hint: 'PDFs e ficheiros transferidos',
        androidSafFolder: 'Download',
      },
      {
        id: 'documents',
        label: 'Documentos',
        uri: '',
        hint: 'Word, notas, etc.',
        androidSafFolder: 'Documents',
      },
      {
        id: 'pick',
        label: 'Escolher pasta…',
        uri: '',
        hint: 'Qualquer pasta do telemóvel',
        androidSafFolder: 'pick',
      },
    ];
  }

  const shortcuts: StorageShortcut[] = [];
  try {
    shortcuts.push({
      id: 'app-documents',
      label: 'Documentos do app',
      uri: Paths.document.uri,
    });
  } catch {
    /* Paths indisponível */
  }
  return shortcuts;
}

export type OpenShortcutResult =
  | { ok: true; uri: string; title: string }
  | { ok: false; reason: 'cancelled' | 'denied' | 'unavailable' };

/** Abre pasta via SAF (Android) ou file:// (iOS). */
export async function openStorageShortcut(
  shortcut: StorageShortcut,
): Promise<OpenShortcutResult> {
  if (Platform.OS === 'android') {
    if (shortcut.androidSafFolder === 'pick') {
      const uri = await pickDocumentDirectory();
      if (!uri) return { ok: false, reason: 'cancelled' };
      return { ok: true, uri, title: nameFromSafUri(uri) || shortcut.label };
    }
    if (shortcut.androidSafFolder) {
      const uri = await requestDocumentFolderAccess(shortcut.androidSafFolder);
      if (!uri) return { ok: false, reason: 'denied' };
      return { ok: true, uri, title: shortcut.label };
    }
    return { ok: false, reason: 'unavailable' };
  }

  if (!shortcut.uri) return { ok: false, reason: 'unavailable' };
  return { ok: true, uri: shortcut.uri, title: shortcut.label };
}

/** Pede ao utilizador que escolha uma pasta (Android SAF). */
export async function pickDocumentDirectory(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const dir = await Directory.pickDirectoryAsync();
    if (!dir?.uri) return null;
    await saveSafRoot(dir.uri);
    return dir.uri;
  } catch {
    return null;
  }
}

/** Autoriza Downloads/Documentos via SAF. */
export async function requestDocumentFolderAccess(
  folderName: 'Download' | 'Documents' = 'Download',
): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const initial = StorageAccessFramework.getUriForDirectoryInRoot(folderName);
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync(initial);
    if (result.granted && result.directoryUri) {
      await saveSafRoot(result.directoryUri);
      return result.directoryUri;
    }
  } catch {
    /* tenta picker genérico */
  }
  return pickDocumentDirectory();
}

function entriesFromDirectoryListing(
  dirUri: string,
  items: Array<Directory | File>,
): FileBrowserEntry[] {
  const entries: FileBrowserEntry[] = [];

  for (const item of items) {
    if (item instanceof Directory) {
      const name = item.name || nameFromSafUri(item.uri) || basename(item.uri);
      if (isHiddenName(name)) continue;
      entries.push({
        id: item.uri,
        name,
        uri: item.uri,
        kind: 'folder',
        size: 0,
        mime: 'inode/directory',
      });
      continue;
    }

    const file = item as File;
    const name = file.name || nameFromSafUri(file.uri) || basename(file.uri);
    if (isHiddenName(name)) continue;

    entries.push({
      id: file.uri,
      name,
      uri: file.uri,
      kind: 'file',
      size: file.size ?? 0,
      mime: mimeFromFilename(name),
    });
  }

  return entries;
}

async function listContentDirectory(dirUri: string): Promise<FileBrowserEntry[]> {
  const dir = new Directory(dirUri);
  if (!dir.exists) return [];
  const items = dir.list();
  return sortEntries(entriesFromDirectoryListing(dirUri, items));
}

async function listSafTreeDirectory(treeUri: string): Promise<FileBrowserEntry[]> {
  const childUris = await StorageAccessFramework.readDirectoryAsync(treeUri);
  const entries: FileBrowserEntry[] = [];

  for (const uri of childUris) {
    const name = nameFromSafUri(uri);
    if (isHiddenName(name)) continue;
    try {
      if (uri.includes('/tree/')) {
        entries.push({
          id: uri,
          name,
          uri,
          kind: 'folder',
          size: 0,
          mime: 'inode/directory',
        });
        continue;
      }
      const probe = new File(uri);
      if (probe.exists) {
        entries.push({
          id: uri,
          name,
          uri,
          kind: 'file',
          size: probe.size ?? 0,
          mime: mimeFromFilename(name),
        });
        continue;
      }
      const sub = new Directory(uri);
      if (sub.exists) {
        entries.push({
          id: uri,
          name,
          uri,
          kind: 'folder',
          size: 0,
          mime: 'inode/directory',
        });
      }
    } catch {
      entries.push({
        id: uri,
        name,
        uri,
        kind: 'file',
        size: 0,
        mime: mimeFromFilename(name),
      });
    }
  }

  return sortEntries(entries);
}

/** Documentos no telemóvel (pastas SAF autorizadas). */
export async function loadDeviceDocuments(limit = 36): Promise<FileBrowserEntry[]> {
  if (Platform.OS !== 'android') return [];

  type Scored = FileBrowserEntry & { score: number };
  const collected: Scored[] = [];
  const seen = new Set<string>();

  for (const root of await loadSafRoots()) {
    try {
      const items = filterForDocumentTab(await listDeviceDirectory(root));
      for (const item of items) {
        if (item.kind !== 'file') continue;
        if (!isDocumentAttachmentName(item.name) && !item.name.includes('.')) continue;
        const key = item.uri;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ ...item, score: 4 });
      }
    } catch {
      /* SAF revogado */
    }
  }

  collected.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt'));
  return collected.slice(0, limit).map(({ score: _score, ...entry }) => entry);
}

/** Lista conteúdo de uma pasta (SAF content:// ou file://). */
export async function listDeviceDirectory(
  dirUri: string,
  opts?: { documentsOnly?: boolean },
): Promise<FileBrowserEntry[]> {
  const documentsOnly = opts?.documentsOnly !== false;

  if (dirUri.startsWith('content://')) {
    let entries: FileBrowserEntry[] = [];
    try {
      entries = await listContentDirectory(dirUri);
    } catch {
      if (dirUri.includes('/tree/')) {
        try {
          entries = await listSafTreeDirectory(dirUri);
        } catch {
          entries = [];
        }
      }
    }
    return documentsOnly ? filterForDocumentTab(entries) : entries;
  }

  try {
    const dir = new Directory(dirUri);
    if (!dir.exists) return [];
    const items = dir.list();
    const sorted = sortEntries(entriesFromDirectoryListing(dirUri, items));
    return documentsOnly ? filterForDocumentTab(sorted) : sorted;
  } catch {
    return [];
  }
}

export function attachmentFromBrowserEntry(entry: FileBrowserEntry): ComposerAttachment {
  return {
    id: newAttachmentId(),
    kind: entry.kind === 'file' ? 'file' : attachmentKindFromMime(entry.mime),
    name: entry.name,
    size: entry.size,
    mime: entry.mime,
    uri: entry.uri,
  };
}

export function attachmentFromRecentFile(file: ComposerAttachment): ComposerAttachment {
  return {
    id: newAttachmentId(),
    kind: file.kind,
    name: file.name,
    size: file.size,
    mime: file.mime,
    uri: file.uri,
  };
}

export function parentDirectoryUri(uri: string): string | null {
  if (uri.startsWith('content://')) {
    try {
      const dir = new Directory(uri);
      const parent = dir.parentDirectory;
      return parent?.uri ?? null;
    } catch {
      return null;
    }
  }

  const clean = uri.replace(/\/+$/, '');
  const slash = clean.lastIndexOf('/');
  if (slash <= 'file://'.length) return null;
  return clean.slice(0, slash);
}

/** Pastas SAF já autorizadas — atalhos rápidos na home. */
export async function getSavedSafShortcuts(): Promise<StorageShortcut[]> {
  const roots = await loadSafRoots();
  return roots.map((uri, index) => ({
    id: `saf-${index}`,
    label: nameFromSafUri(uri) || 'Pasta autorizada',
    uri,
    hint: 'Acesso concedido',
  }));
}

/** Legado — Android 13+ ignora READ_EXTERNAL_STORAGE. */
export async function ensureStoragePermission(): Promise<boolean> {
  return Platform.OS !== 'android' || Number(Platform.Version) < 33;
}
