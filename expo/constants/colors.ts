const white = '#FFFFFF';
const black = '#0F172A';
const lightGray = '#EEF2F7';
const mediumGray = '#D5DCE5';

export const absenceColors = {
  holiday: '#0891B2',
  sickLeave: '#DC2626',
  appointment: '#EA580C',
  training: '#DB2777',
  publicHoliday: '#B45309',
  pending: '#64748B',
  approved: '#0F766E',
  rejected: '#B91C1C',
  amSlot: 'rgba(16, 185, 129, 0.12)',
  pmSlot: 'rgba(99, 102, 241, 0.12)',
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
