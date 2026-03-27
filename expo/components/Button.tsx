import React from "react";
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator,
  TouchableOpacityProps,
  useColorScheme
} from "react-native";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: "filled" | "outlined" | "text";
  size?: "small" | "medium" | "large";
  isLoading?: boolean;
}

export default function Button({
  title,
  variant = "filled",
  size = "medium",
  isLoading = false,
  style,
  ...props
}: ButtonProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  let buttonStyle;
  let textColor;
  
  switch (variant) {
    case "outlined":
      buttonStyle = {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: colors.primary,
      };
      textColor = colors.primary;
      break;
    case "text":
      buttonStyle = {
        backgroundColor: "transparent",
      };
      textColor = colors.primary;
      break;
    default:
      buttonStyle = {
        backgroundColor: colors.primary,
      };
      textColor = "white";
  }
  
  let paddingVertical;
  let paddingHorizontal;
  let fontSize;
  
  switch (size) {
    case "small":
      paddingVertical = 6;
      paddingHorizontal = 12;
      fontSize = 14;
      break;
    case "large":
      paddingVertical = 14;
      paddingHorizontal = 24;
      fontSize = 18;
      break;
    default:
      paddingVertical = 10;
      paddingHorizontal = 16;
      fontSize = 16;
  }
  
  return (
    <TouchableOpacity
      style={[
        styles.button,
        buttonStyle,
        { paddingVertical, paddingHorizontal },
        style,
      ]}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor, fontSize }]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "600",
  },
});