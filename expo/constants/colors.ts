const white = "#FFFFFF";
const black = "#000000";
const lightGray = "#F8F9FA";
const mediumGray = "#E0E0E0";
const darkGray = "#333333";

export const absenceColors = {
  amSlot: "rgba(255, 216, 168, 0.4)",
  pmSlot: "rgba(168, 216, 255, 0.4)",
  holiday: "rgba(255, 246, 168, 0.4)",
  sickness: "rgba(255, 198, 198, 0.4)",
  other: "rgba(230, 230, 230, 0.4)",
  amSlotSolid: "#FFD8A8",
  pmSlotSolid: "#A8D8FF",
  holidaySolid: "#FFF6A8",
  sicknessSolid: "#FFC6C6",
  otherSolid: "#E6E6E6",
};

export default {
  light: {
    primary: "#4A90E2",
    background: "#E8F4F8",
    backgroundGradientStart: "#E8F4F8",
    backgroundGradientEnd: "#D4E9F7",
    card: white,
    text: black,
    border: mediumGray,
    notification: "#4A90E2",
    secondaryText: "#757575",
    surface: white,
    surfaceVariant: "#F5F9FB",
  },
  dark: {
    primary: "#4A90E2",
    background: "#0A1628",
    backgroundGradientStart: "#0A1628",
    backgroundGradientEnd: "#1A2332",
    card: "#1E1E1E",
    text: white,
    border: "#2C2C2C",
    notification: "#4A90E2",
    secondaryText: "#BBBBBB",
    surface: "#262626",
    surfaceVariant: "#2C2C2C",
  },
};
