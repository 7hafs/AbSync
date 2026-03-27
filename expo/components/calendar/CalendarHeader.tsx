import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import { getMonthName } from "@/utils/dateUtils";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { CalendarViewType } from "@/types";

interface CalendarHeaderProps {
  currentDate: Date;
  onPrevious: () => void;
  onNext: () => void;
  view: CalendarViewType;
  onViewChange: (view: CalendarViewType) => void;
}

export default function CalendarHeader({
  currentDate,
  onPrevious,
  onNext,
  view,
  onViewChange,
}: CalendarHeaderProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const getHeaderTitle = () => {
    const month = getMonthName(currentDate.getMonth());
    const year = currentDate.getFullYear();
    
    switch (view) {
      case "day":
        return `${month} ${currentDate.getDate()}, ${year}`;
      case "week":
        return `${month} ${year}`;
      default:
        return `${month} ${year}`;
    }
  };

  return (
    <ThemedView style={styles.container} variant="card">
      <View style={styles.titleContainer}>
        <ThemedText size="large" weight="bold">
          {getHeaderTitle()}
        </ThemedText>
        
        <View style={styles.navigationContainer}>
          <TouchableOpacity onPress={onPrevious} style={styles.navButton}>
            <ChevronLeft size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} style={styles.navButton}>
            <ChevronRight size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.viewSelectorContainer}>
        <TouchableOpacity
          style={[
            styles.viewButton,
            view === "month" && { backgroundColor: colors.primary },
          ]}
          onPress={() => onViewChange("month")}
        >
          <ThemedText
            variant={view === "month" ? "default" : "secondary"}
            style={view === "month" && { color: "white" }}
          >
            Month
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.viewButton,
            view === "week" && { backgroundColor: colors.primary },
          ]}
          onPress={() => onViewChange("week")}
        >
          <ThemedText
            variant={view === "week" ? "default" : "secondary"}
            style={view === "week" && { color: "white" }}
          >
            Week
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.viewButton,
            view === "day" && { backgroundColor: colors.primary },
          ]}
          onPress={() => onViewChange("day")}
        >
          <ThemedText
            variant={view === "day" ? "default" : "secondary"}
            style={view === "day" && { color: "white" }}
          >
            Day
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  titleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  navigationContainer: {
    flexDirection: "row",
  },
  navButton: {
    padding: 4,
    marginLeft: 8,
  },
  viewSelectorContainer: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
  },
  viewButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
    marginHorizontal: 4,
  },
});