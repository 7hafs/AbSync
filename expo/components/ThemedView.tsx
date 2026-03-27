import React from "react";
import { View, ViewProps, useColorScheme, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";

interface ThemedViewProps extends ViewProps {
  variant?: "default" | "card" | "surface" | "surfaceVariant";
  useGradient?: boolean;
}

export default function ThemedView({
  style,
  variant = "default",
  useGradient = false,
  ...props
}: ThemedViewProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  let backgroundColor;
  switch (variant) {
    case "card":
      backgroundColor = colors.card;
      break;
    case "surface":
      backgroundColor = colors.surface;
      break;
    case "surfaceVariant":
      backgroundColor = colors.surfaceVariant;
      break;
    default:
      backgroundColor = colors.background;
  }
  
  if (useGradient && variant === "default") {
    return (
      <LinearGradient
        colors={[colors.backgroundGradientStart, colors.backgroundGradientEnd]}
        style={[StyleSheet.absoluteFillObject, style]}
        {...props}
      />
    );
  }
  
  return (
    <View
      style={[{ backgroundColor }, style]}
      {...props}
    />
  );
}