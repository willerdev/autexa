/** Primary blue tuned to the same depth/saturation family as the previous teal (#0F766E). */
export const colors = {
  primary: '#175EA3',
  primaryMuted: '#DCEAF8',
  primaryDark: '#124A82',
  background: '#F4F4F5',
  surface: '#FFFFFF',
  text: '#18181B',
  textSecondary: '#71717A',
  textMuted: '#A1A1AA',
  border: '#E4E4E7',
  danger: '#DC2626',
  star: '#F59E0B',
  overlay: 'rgba(24, 24, 27, 0.4)',
} as const;

export type ColorName = keyof typeof colors;
