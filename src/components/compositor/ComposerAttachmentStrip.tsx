import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  formatFileExtension,
  type ComposerAttachment,
} from '../../lib/composerAttachmentModel';
import { tokens } from '../../theme/tokens';
import { ImagePreviewModal } from '../ImagePreviewModal';

interface Props {
  attachments: ComposerAttachment[];
  onRemove: (id: string) => void;
}

/** Faixa compacta de anexos — estilo Telegram (miniaturas quadradas). */
export function ComposerAttachmentStrip({ attachments, onRemove }: Props) {
  const [preview, setPreview] = useState<{ uri: string; title: string } | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.strip}
        accessibilityLabel="Anexos selecionados"
      >
        {attachments.map((att) => (
          <View key={att.id} style={styles.tileWrap}>
            {att.kind === 'image' ? (
              <Pressable
                onPress={() => att.uri && setPreview({ uri: att.uri, title: att.name })}
                disabled={!att.uri}
                accessibilityLabel={`Ampliar ${att.name}`}
              >
                {att.uri ? (
                  <Image source={{ uri: att.uri }} style={styles.thumb} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Ionicons name="image-outline" size={18} color={tokens.textMid} />
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={[styles.thumb, styles.fileThumb]}>
                <Text style={styles.fileExt}>{formatFileExtension(att.name)}</Text>
              </View>
            )}
            <Pressable
              onPress={() => onRemove(att.id)}
              hitSlop={6}
              accessibilityLabel={`Remover ${att.name}`}
              style={styles.removeBtn}
            >
              <Ionicons name="close" size={12} color={tokens.textHigh} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <ImagePreviewModal
        visible={preview != null}
        uri={preview?.uri ?? null}
        title={preview?.title}
        onClose={() => setPreview(null)}
      />
    </>
  );
}

const THUMB = 56;

const styles = StyleSheet.create({
  scroll: {
    marginBottom: 8,
    maxHeight: THUMB + 4,
  },
  strip: {
    gap: 8,
    paddingHorizontal: 2,
  },
  tileWrap: {
    position: 'relative',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    backgroundColor: tokens.surface,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  fileThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(136, 193, 242, 0.14)',
  },
  fileExt: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.accentBright,
    textTransform: 'uppercase',
  },
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 20, 26, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
});
