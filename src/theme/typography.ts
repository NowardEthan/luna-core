import { tokens } from './tokens';

export const type = {
  greeting: {
    fontSize: 17,
    fontWeight: '500' as const,
    color: tokens.textMid,
    letterSpacing: -0.2,
  },
  displayName: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: tokens.textHigh,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: tokens.textLow,
    lineHeight: 20,
    marginTop: 6,
  },
  section: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: tokens.textLow,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  message: {
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: '400' as const,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: tokens.textHigh,
  },
  headerStatus: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: tokens.online,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: tokens.textMid,
    lineHeight: 16,
  },
};
