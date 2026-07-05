import { Dimensions, Platform } from 'react-native';

const screenWidth = Dimensions.get('window').width;

/**
 * Config de mola no modelo do SwiftUI (`response` + `dampingFraction`),
 * convertido para o modelo físico do `Animated.spring` (stiffness/damping/mass).
 *
 * - response: período natural da mola em segundos (quanto maior, mais "solta").
 * - dampingFraction: 1 = sem overshoot; <1 = ressalta ligeiramente (respira).
 *
 * k = (2π / response)² · m      c = 2 · ζ · √(k·m) = 4π·ζ / response · m
 *
 * Todas correm no native driver (UI thread) → 60/120fps mesmo com a JS thread ocupada.
 */
export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  restDisplacementThreshold: number;
  restSpeedThreshold: number;
}

function makeSpring(response: number, dampingFraction: number, mass = 1): SpringConfig {
  const stiffness = ((2 * Math.PI) / response) ** 2 * mass;
  const damping = ((4 * Math.PI * dampingFraction) / response) * mass;
  return {
    stiffness: Math.round(stiffness * 100) / 100,
    damping: Math.round(damping * 100) / 100,
    mass,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  };
}

/**
 * Curvas de mola compartilhadas — a linguagem de movimento do app.
 * Android usa `response` ligeiramente menor (o hardware costuma pedir mais rapidez percebida).
 */
const androidFaster = Platform.OS === 'android';

export const springs = {
  /** Push de conversa a entrar — suave, respira, overshoot mínimo. */
  screen: makeSpring(androidFaster ? 0.46 : 0.5, 0.86),
  /** Reabrir a mesma conversa — mais curto. */
  screenQuick: makeSpring(androidFaster ? 0.36 : 0.4, 0.9),
  /** Fundo a voltar à frente ao sair — calmo. */
  screenBack: makeSpring(androidFaster ? 0.5 : 0.55, 0.92),
  /** Entrada de bolha — pop com vida (overshoot suave). */
  bubble: makeSpring(androidFaster ? 0.4 : 0.44, 0.78),
  /** Troca de abas. */
  tab: makeSpring(androidFaster ? 0.38 : 0.42, 0.85),
  /** Feedback de toque — reativo mas orgânico. */
  press: makeSpring(0.34, 0.7),
} as const;

/** Durações de fade (opacity) — pareadas com as molas de transform. */
export const fade = {
  screenMs: Platform.OS === 'android' ? 240 : 280,
  screenQuickMs: Platform.OS === 'android' ? 170 : 200,
  bubbleMs: Platform.OS === 'android' ? 150 : 175,
  tabMs: Platform.OS === 'android' ? 180 : 210,
} as const;

export const motion = {
  /** Micro-interação de toque. */
  pressScale: 0.96,

  /** Push de tela — distância e escala inicial. */
  screenSlideRatio: 0.26,
  screenScaleFrom: 0.985,
  screenOpacityFrom: 0.82,

  /** Profundidade do fundo quando uma conversa está aberta (recua atrás). */
  bgDepthScale: 1.06,
  bgDepthOpacity: 0.68,
  bgDepthTranslateY: -10,

  /** Abas. */
  tabSlidePx: 14,

  /** Bolhas. */
  bubbleSlideUserPx: 12,
  bubbleSlideLunaPx: -12,
  bubbleScaleFrom: 0.96,
} as const;

export function screenPushDistance(mode: 'push' | 'pushQuick'): number {
  const ratio = mode === 'pushQuick' ? motion.screenSlideRatio * 0.7 : motion.screenSlideRatio;
  return Math.round(screenWidth * ratio);
}

export const TAB_ORDER = ['inicio', 'conversas', 'conta', 'definicoes'] as const;

export type TabOrderId = (typeof TAB_ORDER)[number];

export function tabSlideDirection(from: TabOrderId, to: TabOrderId): number {
  const a = TAB_ORDER.indexOf(from);
  const b = TAB_ORDER.indexOf(to);
  if (a === b) return 0;
  return b > a ? 1 : -1;
}
