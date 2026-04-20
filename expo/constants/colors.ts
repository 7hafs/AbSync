const white = '#FFFFFF';
const black = '#0F172A';
const lightGray = '#EEF2F7';
const mediumGray = '#D5DCE5';

export const absenceColors = {
  holiday: '#22C55E',
  sickLeave: '#EF4444',
  appointment: '#F97316',
  training: '#8B5CF6',
  publicHoliday: '#D4A017',
  pending: '#94A3B8',
  approved: '#16A34A',
  rejected: '#DC2626',
  amSlot: 'rgba(59, 130, 246, 0.10)',
  pmSlot: 'rgba(249, 115, 22, 0.10)',
};

export default {
  light: {
    primary: '#0F766E',
    background: '#F4F7F4',
    backgroundGradientStart: '#F4F7F4',
    backgroundGradientEnd: '#E7F1EC',
    card: white,
    text: black,
    border: mediumGray,
    notification: '#0F766E',
    secondaryText: '#64748B',
    surface: '#FBFDFB',
    surfaceVariant: lightGray,
  },
  dark: {
    primary: '#5EEAD4',
    background: '#091412',
    backgroundGradientStart: '#091412',
    backgroundGradientEnd: '#0E1D1A',
    card: '#10201D',
    text: '#F8FAFC',
    border: '#1F3733',
    notification: '#5EEAD4',
    secondaryText: '#94A3B8',
    surface: '#132723',
    surfaceVariant: '#18322D',
  },
};
