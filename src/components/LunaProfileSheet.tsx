import React, { memo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './Glass';
import { LunaAvatar } from './LunaAvatar';
import { LunaHumorBadge } from './LunaHumorBadge';
import type { LunaHumorBadge as LunaHumorBadgeType } from '../lib/lunaHumor';
import { hapticListTap } from '../lib/haptics';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

type InfoRow = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
};

const INFO_ROWS: InfoRow[] = [
  {
    icon: 'sparkles-outline',
    title: 'Como responde',
    detail: 'Passo a passo, no seu ritmo — sem pressa nem jargão desnecessário.',
  },
  {
    icon: 'book-outline',
    title: 'Memória',
    detail: 'Lembra do contexto entre conversas nos planos com nuvem.',
  },
  {
    icon: 'flower-outline',
    title: 'Terço',
    detail: 'Pode rezar junto contigo, no modo guiado ou em silêncio.',
  },
  {
    icon: 'planet-outline',
    title: 'Órbita',
    detail: 'Parte do ecossistema Luna — assistente, professora e companhia.',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  humor?: LunaHumorBadgeType | null;
}

export const LunaProfileSheet = memo(function LunaProfileSheet({ visible, onClose, humor }: Props) {
  const insets = useSafeAreaInsets();

  const handleClose = () => {
    hapticListTap();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Voltar à conversa"
          >
            <Ionicons name="arrow-back" size={24} color={tokens.textHigh} />
          </Pressable>
          <Text style={styles.topTitle}>Perfil</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <LunaAvatar size={112} zoom={1.12} />
            <Text style={styles.name}>Luna</Text>
            <Text style={styles.tagline}>Assistente · Órbita</Text>
            {humor ? (
              <View style={styles.humorWrap}>
                <LunaHumorBadge humor={humor} inline />
              </View>
            ) : null}
          </View>

          <Glass style={styles.aboutCard} radius={16}>
            <Text style={styles.sectionLabel}>Sobre</Text>
            <Text style={styles.aboutText}>
              Sou a Luna — professora paciente, curiosa e presente. Gosto de explicar com calma,
              lembrar do que importa para ti e acompanhar conversas longas sem perder o fio.
            </Text>
          </Glass>

          <Text style={styles.sectionHeading}>O que posso fazer</Text>
          <View style={styles.featureList}>
            {INFO_ROWS.map((row) => (
              <Glass key={row.title} style={styles.featureCard} radius={14}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Ionicons name={row.icon} size={20} color={tokens.accentBright} />
                  </View>
                  <View style={styles.infoText}>
                    <Text style={styles.infoTitle}>{row.title}</Text>
                    <Text style={styles.infoDetail}>{row.detail}</Text>
                  </View>
                </View>
              </Glass>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.ink0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: tokens.glassBorder,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    ...type.headerTitle,
    color: tokens.textHigh,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  name: {
    color: tokens.textHigh,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 12,
  },
  tagline: {
    color: tokens.textMid,
    fontSize: 14,
    lineHeight: 20,
  },
  humorWrap: {
    marginTop: 6,
  },
  aboutCard: {
    padding: 16,
    gap: 8,
    marginBottom: 20,
  },
  sectionLabel: {
    color: tokens.accentText,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  aboutText: {
    color: tokens.textMid,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionHeading: {
    color: tokens.textLow,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: 10,
  },
  featureList: {
    gap: 10,
  },
  featureCard: {
    alignSelf: 'stretch',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
    flexShrink: 0,
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  infoTitle: {
    color: tokens.textHigh,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  infoDetail: {
    color: tokens.textMid,
    fontSize: 14,
    lineHeight: 21,
    flexShrink: 1,
  },
});
