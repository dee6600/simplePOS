import type { Status } from './lib/types';

export const colors = {
  bg: '#F5F2EC',
  card: '#FFFFFF',
  text: '#1C1917',
  muted: '#6B645C',
  border: '#E4DDD2',
  primary: '#B45309',
  danger: '#B91C1C',
  disabled: '#D6D0C6',
  white: '#FFFFFF',
};

/** Tile colours; all have enough contrast for white text. */
export const ITEM_COLORS = [
  '#C25E00', // saffron
  '#9C3D00', // burnt orange
  '#A61E4D', // raspberry
  '#6B1F7A', // plum
  '#C92A2A', // red
  '#1864AB', // blue
  '#2B8A3E', // green
  '#0B7285', // teal
  '#5F3DC4', // violet
  '#495057', // grey
];

/** `pending` is only for old orders saved before v1.3 (the app no longer offers it). */
export const STATUS: Record<Status, { label: string; button: string; color: string; bg: string }> = {
  pending: { label: 'Not paid', button: 'Not paid', color: '#B45309', bg: '#FEF3C7' },
  cash: { label: 'Cash', button: 'Paid Cash', color: '#15803D', bg: '#DCFCE7' },
  upi: { label: 'UPI', button: 'Paid UPI', color: '#6D28D9', bg: '#EDE9FE' },
};

export const radius = { sm: 10, md: 14, lg: 18 };
