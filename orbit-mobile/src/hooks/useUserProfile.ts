import { useCallback, useEffect, useMemo, useState } from 'react';
import { updateProfile, type User } from 'firebase/auth';

import type { ComposerAttachment } from '../lib/composerAttachmentModel';
import { isFirebaseConfigured } from '../lib/firebase/config';
import { getLunaAuth } from '../lib/firebase/client';
import {
  subscribeUserProfile,
  updateUserProfileFields,
} from '../lib/firebase/firestoreUserProfile';
import type { FirestoreUserProfileDoc, UserProfileMilestones } from '../lib/firebase/userProfileTypes';
import {
  uploadProfileImage,
  type ProfileImageKind,
} from '../lib/firebase/uploadProfileMedia';
import { formatMemberSince } from '../lib/profileInsights';
import { loadLocalProfile, saveLocalProfile, type LocalProfileData } from '../lib/profileStorage';

export type UseUserProfileResult = {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  plan: string;
  memberSinceLabel: string;
  milestones: UserProfileMilestones;
  pinnedLocalIds: string[];
  loading: boolean;
  cloud: boolean;
  saveProfile: (patch: { displayName?: string; bio?: string }) => Promise<void>;
  updateProfileImage: (kind: ProfileImageKind, attachment: ComposerAttachment | null) => Promise<void>;
  refreshLocal: () => Promise<void>;
};

function mergeDisplayName(
  user: User | null,
  fallbackName: string,
  cloud: FirestoreUserProfileDoc | null,
  localName?: string,
): string {
  const fromAuth = user?.displayName?.trim();
  const fromCloud = cloud?.displayName?.trim();
  const fromLocal = localName?.trim();

  // Conta Google / email: auth e nuvem vencem perfil local de outra sessão
  if (user && !user.isAnonymous) {
    return fromAuth || fromCloud || fromLocal || fallbackName;
  }

  return fromLocal || fromAuth || fromCloud || fallbackName;
}

function mergeBio(cloud: FirestoreUserProfileDoc | null, localBio?: string): string {
  return cloud?.bio?.trim() || localBio?.trim() || '';
}

function mergeAvatarUrl(
  user: User | null,
  authPhoto: string | null | undefined,
  cloud: FirestoreUserProfileDoc | null,
  local: LocalProfileData,
): string | null {
  if (user && !user.isAnonymous) {
    if (local.avatarRemoved) return null;
    if (cloud?.avatarUrl) return cloud.avatarUrl;
    if (authPhoto) return authPhoto;
    if (cloud?.photoURL) return cloud.photoURL;
    if (local.avatarUri) return local.avatarUri;
    return null;
  }

  if (local.avatarUri) return local.avatarUri;
  if (local.avatarRemoved) return null;
  if (cloud?.avatarUrl) return cloud.avatarUrl;
  if (authPhoto) return authPhoto;
  if (cloud?.photoURL) return cloud.photoURL;
  return null;
}

function mergeCoverUrl(cloud: FirestoreUserProfileDoc | null, local: LocalProfileData): string | null {
  if (local.coverUri) return local.coverUri;
  if (local.coverRemoved) return null;
  return cloud?.coverUrl ?? null;
}

export function useUserProfile(
  user: User | null,
  fallbackName: string,
): UseUserProfileResult {
  const uid = user?.uid ?? null;
  const cloudEnabled = isFirebaseConfigured() && uid != null;

  const [cloudDoc, setCloudDoc] = useState<FirestoreUserProfileDoc | null>(null);
  const [local, setLocal] = useState<LocalProfileData>({});
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(async () => {
    setLocal(
      await loadLocalProfile(uid, { isAnonymous: user?.isAnonymous ?? false }),
    );
  }, [uid, user?.isAnonymous]);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    if (!uid || !cloudEnabled) {
      setCloudDoc(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeUserProfile(
      uid,
      (doc) => {
        setCloudDoc(doc);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid, cloudEnabled]);

  const displayName = mergeDisplayName(user, fallbackName, cloudDoc, local.displayName);
  const bio = mergeBio(cloudDoc, local.bio);
  const avatarUrl = mergeAvatarUrl(user, user?.photoURL, cloudDoc, local);
  const coverUrl = mergeCoverUrl(cloudDoc, local);
  const plan = cloudDoc?.plan ?? 'free';
  const memberSinceLabel = formatMemberSince(cloudDoc?.createdAt);
  const milestones = cloudDoc?.milestones ?? {};

  const saveProfile = useCallback(
    async (patch: { displayName?: string; bio?: string }) => {
      if (!uid) return;

      const nextLocal = await saveLocalProfile(
        {
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        },
        uid,
      );
      setLocal(nextLocal);

      if (cloudEnabled) {
        await updateUserProfileFields(uid, {
          displayName: patch.displayName?.trim() || displayName,
          bio: patch.bio?.trim() ?? bio,
        });

        const auth = getLunaAuth();
        if (auth?.currentUser && patch.displayName?.trim()) {
          try {
            await updateProfile(auth.currentUser, { displayName: patch.displayName.trim() });
          } catch {
            /* Auth display name opcional */
          }
        }
      }
    },
    [uid, cloudEnabled, displayName, bio],
  );

  const updateProfileImage = useCallback(
    async (kind: ProfileImageKind, attachment: ComposerAttachment | null) => {
      if (!uid) return;

      if (kind === 'avatar') {
        if (!attachment?.uri) {
          const nextLocal = await saveLocalProfile(
            {
              avatarUri: undefined,
              avatarRemoved: true,
            },
            uid,
          );
          setLocal(nextLocal);
          if (cloudEnabled) {
            await updateUserProfileFields(uid, { avatarUrl: null });
          }
          return;
        }

        let uri = attachment.uri;
        if (cloudEnabled) {
          uri = await uploadProfileImage(uid, 'avatar', attachment);
          await updateUserProfileFields(uid, { avatarUrl: uri, photoURL: uri });
          const auth = getLunaAuth();
          if (auth?.currentUser) {
            try {
              await updateProfile(auth.currentUser, { photoURL: uri });
            } catch {
              /* opcional */
            }
          }
          const nextLocal = await saveLocalProfile(
            {
              avatarUri: undefined,
              avatarRemoved: false,
            },
            uid,
          );
          setLocal(nextLocal);
          return;
        }

        const nextLocal = await saveLocalProfile(
          {
            avatarUri: uri,
            avatarRemoved: false,
          },
          uid,
        );
        setLocal(nextLocal);
        return;
      }

      if (!attachment?.uri) {
        const nextLocal = await saveLocalProfile(
          {
            coverUri: undefined,
            coverRemoved: true,
          },
          uid,
        );
        setLocal(nextLocal);
        if (cloudEnabled) {
          await updateUserProfileFields(uid, { coverUrl: null });
        }
        return;
      }

      let uri = attachment.uri;
      if (cloudEnabled) {
        uri = await uploadProfileImage(uid, 'cover', attachment);
        await updateUserProfileFields(uid, { coverUrl: uri });
        const nextLocal = await saveLocalProfile(
          {
            coverUri: undefined,
            coverRemoved: false,
          },
          uid,
        );
        setLocal(nextLocal);
        return;
      }

      const nextLocal = await saveLocalProfile(
        {
          coverUri: uri,
          coverRemoved: false,
        },
        uid,
      );
      setLocal(nextLocal);
    },
    [uid, cloudEnabled],
  );

  return useMemo(
    () => ({
      displayName,
      bio,
      avatarUrl,
      coverUrl,
      plan,
      memberSinceLabel,
      milestones,
      pinnedLocalIds: local.pinnedConversationIds ?? [],
      loading,
      cloud: cloudEnabled,
      saveProfile,
      updateProfileImage,
      refreshLocal,
    }),
    [
      displayName,
      bio,
      avatarUrl,
      coverUrl,
      plan,
      memberSinceLabel,
      milestones,
      local.pinnedConversationIds,
      loading,
      cloudEnabled,
      saveProfile,
      updateProfileImage,
      refreshLocal,
    ],
  );
}
