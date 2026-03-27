import React from "react";
import { Text, TextProps, useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";

interface ThemedTextProps extends TextProps {
  variant?: "default" | "secondary" | "primary";
  size?: "small" | "medium" | "large" | "xlarge";
  weight?: "normal" | "bold" | "semibold";
}

export default function ThemedText({
  style,
  variant = "default",
  size = "medium",
  weight = "normal",
  ...props
}: ThemedTextProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  
  let color;
  switch (variant) {
    case "primary":
      color = Colors[colorScheme || "light"].primary;
      break;
    case "secondary":
      color = Colors[colorScheme || "light"].secondaryText;
      break;
    default:
      color = Colors[colorScheme || "light"].text;
  }
  
  let fontSize;
  switch (size) {
    case "small":
      fontSize = 12;
      break;
    case "medium":
      fontSize = 16;
      break;
    case "large":
      fontSize = 20;
      break;
    case "xlarge":
      fontSize = 24;
      break;
    default:
      fontSize = 16;
  }
  
  let fontWeight;
  switch (weight) {
    case "bold":
      fontWeight = "700";
      break;
    case "semibold":
      fontWeight = "600";
      break;
    default:
      fontWeight = "400";
  }
  
  return (
    <Text
      style={[{ color, fontSize, fontWeight }, style]}
      {...props}
    />
  );
}