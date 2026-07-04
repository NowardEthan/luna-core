import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatAttachmentSize,
  formatFileExtension,
  type ComposerAttachment,
} from '../lib/composerAttachmentModel';
import { canPreviewAttachment } from '../lib/attachmentPreviewKind';
import { tokens } from '../theme/tokens';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';
import { ImagePreviewModal } from './ImagePreviewModal';

interface Props {
  attachments: ComposerAttachment[];
  solo?: boolean;
  onOpenDocumentPreview?: (
    attachment: ComposerAttachment,
    opts?: { highlightExcerpt?: string },
  ) => void;
}

export function MessageAttachments({
  attachments,
  solo = false,
  onOpenDocumentPreview,
}: Props) {
  const [imagePreview, setImagePreview] = useState<{ uri: string; title: string } | null>(null);
  const [localFilePreview, setLocalFilePreview] = useState<ComposerAttachment | null>(null);

  const openFile = (att: ComposerAttachment, highlightExcerpt?: string) => {
    if (onOpenDocumentPreview) {
      onOpenDocumentPreview(att, highlightExcerpt ? { highlightExcerpt } : undefined);
      return;
    }
    setLocalFilePreview(att);
  };

  if (attachments.length === 0) return null;

  const imageCount = attachments.filter((a) => a.kind === 'image').length;
  const multiImage = imageCount > 1;

  return (
    <>
      <View
        style={[
          styles.root,
          solo && styles.rootSolo,
          multiImage && styles.rootGrid,
        ]}
        accessibilityLabel={`${attachments.length} anexo${attachments.length === 1 ? '' : 's'}`}
      >
        {attachments.map((att) => {
          if (att.kind === 'image') {
            return (
              <Pressable
                key={att.id}
                onPress={() => att.uri && setImagePreview({ uri: att.uri, title: att.name })}
                disabled={!att.uri}
                accessibilityLabel={`Ampliar ${att.name}`}
                style={[styles.imageTile, solo && !multiImage && styles.imageTileSolo]}
              >
                <View style={styles.imageFrame}>
                  {att.uri ? (
                    <Image source={{ uri: att.uri }} style={styles.image} />
                  ) : (
                    <View style={styles.imageFallback}>
                      <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.65)" />
                    </View>
                  )}
                  <View style={styles.imageOverlay}>
                    <Text style={styles.imageOverlayName} numberOfLines={1}>
                      {att.name}
                    </Text>
                    {att.uri ? <Text style={styles.imageOverlayHint}>Ampliar</Text> : null}
                  </View>
                </View>
              </Pressable>
            );
          }

          const ext = formatFileExtension(att.name);
          const previewable = canPreviewAttachment(att);
          return (
            <Pressable
              key={att.id}
              style={({ pressed }) => [styles.fileCard, pressed && previewable && styles.fileCardPressed]}
              onPress={() => previewable && openFile(att)}
              disabled={!previewable}
              accessibilityLabel={previewable ? `Ver ${att.name}` : att.name}
            >
              <Text style={styles.fileBadge}>{ext}</Text>
              <View style={styles.fileMeta}>
                <Text style={styles.fileName} numberOfLines={2}>
                  {att.name}
                </Text>
                <Text style={styles.fileSize}>
                  {formatAttachmentSize(att.size)}
                  {previewable ? ' · Ver' : ''}
                </Text>
              </View>
              {previewable ? (
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <ImagePreviewModal
        visible={imagePreview != null}
        uri={imagePreview?.uri ?? null}
        title={imagePreview?.title}
        onClose={() => setImagePreview(null)}
      />
      {!onOpenDocumentPreview ? (
        <AttachmentPreviewModal
          visible={localFilePreview != null}
          target={localFilePreview ? { attachment: localFilePreview } : null}
          onClose={() => setLocalFilePreview(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
    marginTop: 4,
  },
  rootSolo: {
    marginTop: 0,
  },
  rootGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageTile: {
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  imageTileSolo: {
    minWidth: 160,
  },
  imageFrame: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  image: {
    width: '100%',
    minHeight: 120,
    maxHeight: 220,
    aspectRatio: 4 / 3,
  },
  imageFallback: {
    width: '100%',
    minHeight: 100,
    aspectRatio: 4 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  imageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.42)',
    gap: 1,
  },
  imageOverlayName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
  },
  imageOverlayHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fileCardPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fileBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.onAccent,
    textTransform: 'uppercase',
    minWidth: 36,
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  fileName: {
    fontSize: 12,
    color: tokens.onAccent,
  },
  fileSize: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.72)',
  },
});
