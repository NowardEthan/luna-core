/**
 * Tokens Orbit — tema central `orbit-cosmic`.
 */
export const tokens = {
  ink0: '#0A0B0F',
  ink1: '#0E1014',
  ink2: '#12141A',
  shell: '#16181F',

  surface: '#1C1F28',
  surfaceRaised: '#242830',
  surfaceHover: '#2C303C',

  glass: 'rgba(255,255,255,0.055)',
  glassStrong: 'rgba(255,255,255,0.09)',
  glassBorder: 'rgba(255,255,255,0.08)',

  border: '#3A404C',
  borderSubtle: '#282C36',
  borderSoft: 'rgba(255,255,255,0.08)',

  textHigh: '#F2F4F8',
  textMid: '#9CA3B0',
  textLow: '#7A808C',

  accent: '#4B75F2',
  accentMid: '#5979D9',
  accentBright: '#88C1F2',
  accentDeep: '#2B4B9E',
  accentText: '#7A9AF5',
  accentSoft: 'rgba(75, 117, 242, 0.14)',
  onAccent: '#F2F4F8',

  bubbleUserStart: '#5E86F5',
  bubbleUserEnd: '#3D5FC4',
  bubbleLuna: 'rgba(28, 31, 40, 0.72)',

  online: '#6BC4A0',
  onlineSoft: 'rgba(107, 196, 160, 0.2)',

  /** Cores semânticas de status — usar sempre estas em vez de hex hardcoded. */
  warning: '#FFB74D',
  warningSoft: 'rgba(255, 183, 77, 0.16)',
  error: '#E57373',
  errorSoft: 'rgba(229, 115, 115, 0.16)',
  success: '#6BC4A0',

  /** Markdown / code blocks (tema Orbit concept) */
  codeBlockBg: '#12151C',
  codeBlockToolbar: '#181C24',
  codeBlockText: '#D8DCE6',
  codeBlockLangBg: 'rgba(75, 117, 242, 0.14)',
  codeBlockLangFg: '#7A9AF5',
  chipBg: 'rgba(255, 255, 255, 0.08)',
  chipFg: '#C8D0E0',
  syntaxComment: '#6B7280',
  syntaxString: '#98C379',
  syntaxKeyword: '#C792EA',
  syntaxFunction: '#82AAFF',
  syntaxNumber: '#F78C6C',
  syntaxTag: '#FFCB6B',
  syntaxPunctuation: '#89DDFF',
} as const;

export type Tokens = typeof tokens;
