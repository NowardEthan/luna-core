/** Limiar de deslize para cancelar gravação (px, dx negativo). */
export const CANCEL_SLIDE_PX = 52;

/** Limiar de deslize para bloquear gravação (px, dy negativo). */
export const LOCK_SLIDE_PX = -72;

export interface VoiceHoldUi {
  active: boolean;
  willCancel: boolean;
  willLock: boolean;
  locked: boolean;
  durationMs: number;
  slideDx: number;
  slideDy: number;
}

export const IDLE_VOICE_UI: VoiceHoldUi = {
  active: false,
  willCancel: false,
  willLock: false,
  locked: false,
  durationMs: 0,
  slideDx: 0,
  slideDy: 0,
};
