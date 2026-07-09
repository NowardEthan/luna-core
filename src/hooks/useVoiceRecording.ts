import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';

import { VoiceClip } from '../data/fixtures';

const MIN_DURATION_MS = 500;
const POLL_MS = 100;

export type { VoiceClip };

function disposeRecorder(recorder: AudioRecorder | null) {
  if (!recorder) return;
  try {
    if (recorder.getStatus().isRecording) {
      void recorder.stop();
    }
  } catch {
    /* ignora */
  }
  try {
    (recorder as { release?: () => void }).release?.();
  } catch {
    /* ignora */
  }
}

/** Gravação de voz via expo-audio — recorder criado só ao gravar (evita crash no hot reload). */
export function useVoiceRecording() {
  const recorderRef = useRef<AudioRecorder | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const [durationMs, setDurationMs] = useState(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      const recorder = recorderRef.current;
      if (!recorder) return;
      setDurationMs(recorder.getStatus().durationMillis);
    }, POLL_MS);
  }, [stopPolling]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (state !== 'active') {
        stopPolling();
      }
    });
    return () => {
      sub.remove();
      stopPolling();
      disposeRecorder(recorderRef.current);
      recorderRef.current = null;
    };
  }, [stopPolling]);

  const createRecorder = useCallback((): AudioRecorder | null => {
    if (!appActiveRef.current) return null;
    disposeRecorder(recorderRef.current);
    try {
      recorderRef.current = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      return recorderRef.current;
    } catch {
      recorderRef.current = null;
      return null;
    }
  }, []);

  const ensurePermission = useCallback(async () => {
    let permission = await AudioModule.getRecordingPermissionsAsync();
    if (!permission.granted) {
      permission = await AudioModule.requestRecordingPermissionsAsync();
    }
    if (!permission.granted) {
      Alert.alert(
        'Microfone',
        'Permita o acesso ao microfone para enviar mensagens de voz com a Luna.',
      );
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    return true;
  }, []);

  const start = useCallback(async () => {
    if (!appActiveRef.current) return false;

    let recorder = recorderRef.current;
    if (!recorder || !recorder.getStatus().canRecord) {
      recorder = createRecorder();
    }
    if (!recorder) {
      Alert.alert('Gravação', 'Não foi possível iniciar a gravação. Tente novamente.');
      return false;
    }
    if (recorder.getStatus().isRecording) return true;

    const ok = await ensurePermission();
    if (!ok) return false;

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setDurationMs(0);
      startPolling();
      return true;
    } catch {
      disposeRecorder(recorderRef.current);
      recorderRef.current = null;
      Alert.alert('Gravação', 'Não foi possível iniciar a gravação. Tente novamente.');
      return false;
    }
  }, [createRecorder, ensurePermission, startPolling]);

  const cancel = useCallback(async () => {
    stopPolling();
    setDurationMs(0);
    const recorder = recorderRef.current;
    if (!recorder?.getStatus().isRecording) return;
    try {
      await recorder.stop();
    } catch {
      /* descarta gravação cancelada */
    }
    disposeRecorder(recorderRef.current);
    recorderRef.current = null;
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      /* falha ao liberar o modo de áudio não deve travar o cancelamento */
    }
  }, [stopPolling]);

  const finish = useCallback(async (): Promise<VoiceClip | null> => {
    stopPolling();
    const recorder = recorderRef.current;
    if (!recorder?.getStatus().isRecording) return null;

    const duration = recorder.getStatus().durationMillis;

    try {
      await recorder.stop();
    } catch {
      disposeRecorder(recorderRef.current);
      recorderRef.current = null;
      return null;
    }

    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      /* falha ao liberar o modo de áudio não deve travar o envio */
    }

    const uri = recorder.uri;
    disposeRecorder(recorderRef.current);
    recorderRef.current = null;
    setDurationMs(0);

    if (duration < MIN_DURATION_MS) return null;
    if (!uri) return null;

    return { uri, durationMs: duration };
  }, [stopPolling]);

  return {
    durationMs,
    start,
    cancel,
    finish,
  };
}

export function formatVoiceDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
