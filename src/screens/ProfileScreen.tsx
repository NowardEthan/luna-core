import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Glass } from '../components/Glass';
import { ProfileEditSheet } from '../components/ProfileEditSheet';
import { ProfileImagePickSheet, type ProfileImageTarget } from '../components/ProfileImagePickSheet';
import type { SessionItem } from '../data/fixtures';
import { demoUser } from '../data/fixtures';
import type { ComposerAttachment } from '../lib/composerAttachmentModel';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useLunaAuth } from '../hooks/useLunaAuth';
import { useUserProfile } from '../hooks/useUserProfile';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { toggleConversationPinned } from '../lib/firebase/firestoreUserProfile';
import {
  buildProfileActivity,
  computeAchievements,
  computeProfileStats,
  resolvePinnedSessions,
} from '../lib/profileInsights';
import { toggleLocalPin } from '../lib/profileStorage';
import { PLAN_DISPLAY_LABELS } from '../features/billing/plans';
import type { LunaPlanId } from '../features/billing/types';
import { tokens } from '../theme/tokens';

interface Props {
  sessions: SessionItem[];
  onOpenSession: (id: string) => void;
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'L';
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function planLabel(plan: string): string {
  const id = plan as LunaPlanId;
  return PLAN_DISPLAY_LABELS[id] ?? 'Grátis';
}

function defaultBio(isAnonymous: boolean): string {
  return isAnonymous
    ? 'Explorando o Orbit em sessão anônima. Vincule Google para salvar o perfil na nuvem.'
    : 'Aprendiz curioso · conversas com a Luna no bolso.';
}

/** Perfil social — dados reais de Firestore, conversas e marcos locais. */
export function ProfileScreen({ sessions, onOpenSession }: Props) {
  const headerTopPad = useHeaderTopPadding(0);
  const auth = useLunaAuth();
  const google = useGoogleSignIn();

  const fallbackName =
    auth.user?.displayName || auth.user?.email?.split('@')[0] || demoUser.name;
  const profile = useUserProfile(auth.user, fallbackName);

  const [googleError, setGoogleError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinBusy, setPinBusy] = useState<string | null>(null);
  const [imagePickTarget, setImagePickTarget] = useState<ProfileImageTarget | null>(null);
  const [imageUploading, setImageUploading] = useState<ProfileImageTarget | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useAndroidBackHandler(
    useCallback(() => {
      if (imagePickTarget) {
        setImagePickTarget(null);
        return true;
      }
      if (editOpen) {
        setEditOpen(false);
        return true;
      }
      return false;
    }, [imagePickTarget, editOpen]),
    imagePickTarget != null || editOpen,
  );

  const isAnonymous = auth.user?.isAnonymous ?? true;
  const email = auth.user?.email ?? null;
  const uid = auth.uid;

  const displayName = profile.displayName || fallbackName;
  const initials = initialsFromName(displayName);
  const bioText = profile.bio.trim() || defaultBio(isAnonymous);
  const avatarUrl = profile.avatarUrl;
  const coverUrl = profile.coverUrl;

  const stats = useMemo(() => computeProfileStats(sessions), [sessions]);
  const pinned = useMemo(
    () => resolvePinnedSessions(sessions, profile.pinnedLocalIds),
    [sessions, profile.pinnedLocalIds],
  );
  const activity = useMemo(() => buildProfileActivity(sessions), [sessions]);
  const achievements = useMemo(
    () =>
      computeAchievements({
        stats,
        isAnonymous,
        cloud: profile.cloud,
        milestones: profile.milestones,
      }),
    [stats, isAnonymous, profile.cloud, profile.milestones],
  );

  const pinCandidates = useMemo(() => sessions.slice(0, 8), [sessions]);

  const combinedError = auth.error || google.error || googleError || imageError || profileError;

  const isSessionPinned = useCallback(
    (session: SessionItem) =>
      session.pinned === true || profile.pinnedLocalIds.includes(session.id),
    [profile.pinnedLocalIds],
  );

  const handleGoogle = () => {
    setGoogleError(null);
    void google.signInWithGoogle().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Erro ao entrar com Google.';
      if (message !== 'Login cancelado.') setGoogleError(message);
    });
  };

  const handleSaveProfile = async (patch: { displayName: string; bio: string }) => {
    setSaving(true);
    setProfileError(null);
    try {
      await profile.saveProfile(patch);
      setEditOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar o perfil.';
      setProfileError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (session: SessionItem) => {
    const currentlyPinned = isSessionPinned(session);
    setPinBusy(session.id);
    try {
      if (profile.cloud && uid) {
        await toggleConversationPinned(uid, session.id, !currentlyPinned);
      } else {
        await toggleLocalPin(session.id, uid);
        await profile.refreshLocal();
      }
    } catch {
      /* mantém estado anterior */
    } finally {
      setPinBusy(null);
    }
  };

  const handleImagePick = async (attachment: ComposerAttachment) => {
    if (!imagePickTarget) return;
    const target = imagePickTarget;
    setImagePickTarget(null);
    setImageUploading(target);
    setImageError(null);
    try {
      await profile.updateProfileImage(target, attachment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar a imagem.';
      setImageError(message);
    } finally {
      setImageUploading(null);
    }
  };

  const handleRemoveImage = async (target: ProfileImageTarget) => {
    setImageUploading(target);
    setImageError(null);
    try {
      await profile.updateProfileImage(target, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível remover a imagem.';
      setImageError(message);
    } finally {
      setImageUploading(null);
    }
  };

  return (
    <>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.coverWrap, { paddingTop: headerTopPad }]}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} contentFit="cover" blurRadius={18} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.coverImage} contentFit="cover" blurRadius={18} />
          ) : (
            <LinearGradient
              colors={['#1a2438', '#2B4B9E', '#4B75F2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(14,16,20,0.92)']}
            style={styles.coverScrim}
          />
          <View style={styles.coverDecor} pointerEvents="none">
            <View style={[styles.ring, styles.ringA]} />
            <View style={[styles.ring, styles.ringB]} />
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.avatarRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" transition={150} />
            ) : (
              <LinearGradient
                colors={[tokens.accentBright, tokens.accentDeep]}
                style={styles.avatar}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )}
            <View style={styles.nameCol}>
              <Text style={styles.displayName}>{displayName}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>{planLabel(profile.plan)}</Text>
                </View>
                <Text style={styles.memberMeta}>
                  {isAnonymous
                    ? 'Sessão anônima'
                    : profile.memberSinceLabel !== 'Recente'
                      ? `Desde ${profile.memberSinceLabel}`
                      : 'Conta Google'}
                </Text>
              </View>
            </View>
          </View>

          {profile.loading ? (
            <ActivityIndicator color={tokens.accentBright} style={styles.profileLoader} />
          ) : null}

          <Text style={styles.bio}>{bioText}</Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}

          <Glass radius={16} style={styles.statsCard}>
            <StatCell value={stats.conversations} label="Conversas" />
            <View style={styles.statDivider} />
            <StatCell value={stats.messages} label="Mensagens" />
            <View style={styles.statDivider} />
            <StatCell value={stats.pinned} label="Fixadas" />
          </Glass>

          {combinedError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{combinedError}</Text>
            </View>
          ) : null}

          {isAnonymous ? (
            <>
              <Pressable
                onPress={() => setEditOpen(true)}
                style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
              >
                <Ionicons name="create-outline" size={16} color={tokens.accentBright} />
                <Text style={styles.editBtnText}>Editar perfil local</Text>
              </Pressable>
              <Pressable
                disabled={google.busy || !google.ready}
                onPress={handleGoogle}
                style={({ pressed }) => [styles.googleBtn, pressed && styles.pressed]}
              >
                {google.busy ? (
                  <ActivityIndicator color={tokens.textHigh} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color={tokens.textHigh} />
                    <Text style={styles.googleBtnText}>Vincular conta Google</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => setEditOpen(true)}
              style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={16} color={tokens.accentBright} />
              <Text style={styles.editBtnText}>Editar perfil</Text>
            </Pressable>
          )}

          {pinned.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Conversas em destaque</Text>
              {pinned.map((session) => (
                <Pressable
                  key={session.id}
                  onPress={() => onOpenSession(session.id)}
                  style={({ pressed }) => [styles.pinnedCard, pressed && styles.pressed]}
                >
                  <Ionicons name="pin" size={16} color={tokens.accentBright} />
                  <View style={styles.pinnedCol}>
                    <Text style={styles.pinnedTitle} numberOfLines={1}>
                      {session.title}
                    </Text>
                    <Text style={styles.pinnedPreview} numberOfLines={2}>
                      {session.preview}
                    </Text>
                  </View>
                  <Text style={styles.pinnedTime}>{session.updatedAt}</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {pinCandidates.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Fixar conversas</Text>
              <Glass radius={16} style={styles.pinList}>
                {pinCandidates.map((session, index) => {
                  const pinnedNow = isSessionPinned(session);
                  const busy = pinBusy === session.id;
                  return (
                    <View
                      key={session.id}
                      style={[
                        styles.pinRow,
                        index < pinCandidates.length - 1 && styles.pinRowBorder,
                      ]}
                    >
                      <Pressable
                        onPress={() => onOpenSession(session.id)}
                        style={({ pressed }) => [styles.pinRowMain, pressed && styles.pressed]}
                      >
                        <View style={styles.pinRowCol}>
                          <Text style={styles.pinRowTitle} numberOfLines={1}>
                            {session.title}
                          </Text>
                          <Text style={styles.pinRowMeta} numberOfLines={1}>
                            {session.updatedAt}
                            {session.messageCount != null ? ` · ${session.messageCount} msgs` : ''}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => void handleTogglePin(session)}
                        accessibilityLabel={pinnedNow ? 'Desafixar conversa' : 'Fixar conversa'}
                        style={({ pressed }) => [styles.pinToggle, pressed && styles.pressed]}
                      >
                        {busy ? (
                          <ActivityIndicator color={tokens.accentBright} size="small" />
                        ) : (
                          <Ionicons
                            name={pinnedNow ? 'pin' : 'pin-outline'}
                            size={18}
                            color={pinnedNow ? tokens.accentBright : tokens.textMid}
                          />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </Glass>
            </>
          ) : null}

          {activity.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Atividade recente</Text>
              <Glass radius={16} style={styles.activityCard}>
                {activity.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.activityRow,
                      index < activity.length - 1 && styles.activityBorder,
                    ]}
                  >
                    <Ionicons name={item.icon} size={18} color={tokens.textMid} />
                    <View style={styles.activityCol}>
                      <Text style={styles.activityText}>{item.text}</Text>
                      <Text style={styles.activityDate}>{item.date}</Text>
                    </View>
                  </View>
                ))}
              </Glass>
            </>
          ) : (
            <Text style={styles.emptyHint}>
              Ainda sem conversas — envie a primeira mensagem à Luna na aba Início.
            </Text>
          )}

          <Text style={styles.sectionTitle}>Conquistas</Text>
          <View style={styles.achievementGrid}>
            {achievements.map((item) => (
              <View
                key={item.id}
                style={[styles.achievementCell, !item.earned && styles.achievementLocked]}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={item.earned ? tokens.accentBright : tokens.textLow}
                />
                <Text
                  style={[styles.achievementLabel, !item.earned && styles.achievementLabelLocked]}
                >
                  {item.label}
                </Text>
                {!item.earned && item.hint ? (
                  <Text style={styles.achievementHint}>{item.hint}</Text>
                ) : null}
              </View>
            ))}
          </View>

          {uid ? (
            <Text style={styles.uid}>
              ID {uid.slice(0, 8)}…{uid.slice(-4)}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <ProfileEditSheet
        visible={editOpen}
        displayName={displayName}
        bio={profile.bio}
        saving={saving}
        hasAvatar={avatarUrl != null}
        hasCover={coverUrl != null}
        imageUploading={imageUploading}
        onClose={() => setEditOpen(false)}
        onSave={(patch) => void handleSaveProfile(patch)}
        onChangeAvatar={() => setImagePickTarget('avatar')}
        onChangeCover={() => setImagePickTarget('cover')}
        onRemoveAvatar={() => void handleRemoveImage('avatar')}
        onRemoveCover={() => void handleRemoveImage('cover')}
      />

      <ProfileImagePickSheet
        visible={imagePickTarget != null}
        target={imagePickTarget ?? 'avatar'}
        onClose={() => setImagePickTarget(null)}
        onPick={(attachment) => void handleImagePick(attachment)}
      />
    </>
  );
}

const COVER_H = 168;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  coverWrap: {
    height: COVER_H,
    backgroundColor: tokens.ink1,
    overflow: 'hidden',
  },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverScrim: { ...StyleSheet.absoluteFillObject },
  coverDecor: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ringA: { width: 220, height: 220 },
  ringB: { width: 140, height: 140, opacity: 0.6 },
  body: { paddingHorizontal: 20, paddingBottom: 36, marginTop: -36 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: tokens.ink1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 28, fontWeight: '700' },
  nameCol: { flex: 1, paddingBottom: 4, gap: 6 },
  displayName: { color: tokens.textHigh, fontSize: 22, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: tokens.accentSoft,
  },
  planBadgeText: { color: tokens.accentBright, fontSize: 11, fontWeight: '700' },
  memberMeta: { color: tokens.textMid, fontSize: 12 },
  profileLoader: { marginTop: 10, alignSelf: 'flex-start' },
  bio: { color: tokens.textMid, fontSize: 14, lineHeight: 20, marginTop: 14 },
  email: { color: tokens.textLow, fontSize: 13, marginTop: 6 },
  statsCard: {
    flexDirection: 'row',
    marginTop: 18,
    paddingVertical: 14,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: tokens.textHigh, fontSize: 20, fontWeight: '700' },
  statLabel: { color: tokens.textMid, fontSize: 11 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: tokens.glassBorder },
  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(229,115,115,0.12)',
  },
  errorText: { color: '#E57373', fontSize: 13 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  googleBtnText: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
  },
  editBtnText: { color: tokens.accentBright, fontSize: 14, fontWeight: '600' },
  sectionTitle: {
    color: tokens.textMid,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pinnedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  pinnedCol: { flex: 1, gap: 4 },
  pinnedTitle: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  pinnedPreview: { color: tokens.textMid, fontSize: 12, lineHeight: 17 },
  pinnedTime: { color: tokens.textLow, fontSize: 11 },
  pinList: { paddingHorizontal: 4, paddingVertical: 2 },
  pinRow: { flexDirection: 'row', alignItems: 'center' },
  pinRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.glassBorder,
  },
  pinRowMain: { flex: 1, paddingVertical: 12, paddingHorizontal: 10 },
  pinRowCol: { gap: 3 },
  pinRowTitle: { color: tokens.textHigh, fontSize: 14, fontWeight: '600' },
  pinRowMeta: { color: tokens.textLow, fontSize: 11 },
  pinToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCard: { paddingHorizontal: 14, paddingVertical: 4 },
  activityRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  activityBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.glassBorder,
  },
  activityCol: { flex: 1, gap: 3 },
  activityText: { color: tokens.textHigh, fontSize: 13, lineHeight: 18 },
  activityDate: { color: tokens.textLow, fontSize: 11 },
  emptyHint: {
    color: tokens.textMid,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 20,
  },
  achievementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  achievementCell: {
    width: '31%',
    minWidth: 100,
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  achievementLocked: { opacity: 0.45 },
  achievementLabel: {
    color: tokens.textMid,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
  achievementLabelLocked: { color: tokens.textLow },
  achievementHint: {
    color: tokens.textLow,
    fontSize: 9,
    textAlign: 'center',
  },
  uid: {
    color: tokens.textLow,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
  },
  pressed: { opacity: 0.88 },
});
