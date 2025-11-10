import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Pin, Tag, Calendar } from "lucide-react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { NoteType } from "@/types";

interface NoteCardProps {
  note: NoteType;
  onPress: (note: NoteType) => void;
  onTogglePin: (id: string) => void;
}

export default function NoteCard({
  note,
  onPress,
  onTogglePin,
}: NoteCardProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const formattedDate = new Date(note.updatedAt).toLocaleDateString();
  
  return (
    <TouchableOpacity onPress={() => onPress(note)}>
      <ThemedView
        style={[
          styles.container,
          { borderLeftColor: colors.primary, borderLeftWidth: 4 },
        ]}
        variant="card"
      >
        <View style={styles.header}>
          <ThemedText weight="bold" size="large" numberOfLines={1} style={{ flex: 1 }}>
            {note.title}
          </ThemedText>
          
          <TouchableOpacity
            style={styles.pinButton}
            onPress={() => onTogglePin(note.id)}
          >
            <Pin
              size={20}
              color={note.isPinned ? colors.primary : colors.secondaryText}
              fill={note.isPinned ? colors.primary : "none"}
            />
          </TouchableOpacity>
        </View>
        
        <ThemedText
          variant="secondary"
          numberOfLines={3}
          style={styles.content}
        >
          {note.content}
        </ThemedText>
        
        <View style={styles.footer}>
          <View style={styles.dateContainer}>
            <ThemedText variant="secondary" size="small">
              {formattedDate}
            </ThemedText>
            
            {note.date && (
              <View style={styles.calendarBadge}>
                <Calendar size={12} color={colors.primary} />
                <ThemedText variant="secondary" size="small" style={styles.calendarText}>
                  {note.date}
                </ThemedText>
              </View>
            )}
          </View>
          
          {note.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {note.tags.slice(0, 2).map((tag, index) => (
                <View
                  key={index}
                  style={[styles.tag, { backgroundColor: colors.surfaceVariant }]}
                >
                  <Tag size={12} color={colors.primary} />
                  <ThemedText variant="secondary" size="small" style={styles.tagText}>
                    {tag}
                  </ThemedText>
                </View>
              ))}
              
              {note.tags.length > 2 && (
                <ThemedText variant="secondary" size="small">
                  +{note.tags.length - 2}
                </ThemedText>
              )}
            </View>
          )}
        </View>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pinButton: {
    padding: 4,
  },
  content: {
    marginBottom: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  calendarBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  calendarText: {
    marginLeft: 4,
  },
  tagsContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  tagText: {
    marginLeft: 4,
  },
});