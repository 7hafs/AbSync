import React, { useState, useEffect } from "react";
import { View, StyleSheet, TextInput, ScrollView, TouchableOpacity } from "react-native";
import { X, Plus, Calendar } from "lucide-react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import Button from "@/components/Button";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { NoteType } from "@/types";

interface NoteEditorProps {
  initialNote?: NoteType;
  onSave: (note: NoteType) => void;
  onCancel: () => void;
}

export default function NoteEditor({
  initialNote,
  onSave,
  onCancel,
}: NoteEditorProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const [title, setTitle] = useState(initialNote?.title || "");
  const [content, setContent] = useState(initialNote?.content || "");
  const [tags, setTags] = useState<string[]>(initialNote?.tags || []);
  const [date, setDate] = useState(initialNote?.date || "");
  const [newTag, setNewTag] = useState("");
  
  const handleSave = () => {
    if (!title) {
      // Show error
      return;
    }
    
    const now = new Date().toISOString();
    
    const note: NoteType = {
      id: initialNote?.id || Date.now().toString(),
      title,
      content,
      tags,
      date,
      isPinned: initialNote?.isPinned || false,
      createdAt: initialNote?.createdAt || now,
      updatedAt: now,
    };
    
    onSave(note);
  };
  
  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };
  
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <TextInput
          style={[
            styles.titleInput,
            { 
              color: colors.text,
              borderBottomColor: colors.border,
            },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder="Note title"
          placeholderTextColor={colors.secondaryText}
          autoFocus
        />
        
        <TextInput
          style={[
            styles.contentInput,
            { 
              color: colors.text,
            },
          ]}
          value={content}
          onChangeText={setContent}
          placeholder="Start typing..."
          placeholderTextColor={colors.secondaryText}
          multiline
          textAlignVertical="top"
        />
        
        <View style={styles.dateSection}>
          <View style={styles.dateLabelContainer}>
            <Calendar size={18} color={colors.primary} />
            <ThemedText weight="semibold" style={styles.dateLabel}>
              Calendar Date (optional)
            </ThemedText>
          </View>
          <TextInput
            style={[
              styles.dateInput,
              { 
                color: colors.text,
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.border,
              },
            ]}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.secondaryText}
          />
        </View>
        
        <View style={styles.tagsSection}>
          <ThemedText weight="semibold" style={styles.tagsHeader}>
            Tags
          </ThemedText>
          
          <View style={styles.tagsContainer}>
            {tags.map((tag, index) => (
              <View
                key={index}
                style={[
                  styles.tag,
                  { backgroundColor: colors.surfaceVariant },
                ]}
              >
                <ThemedText variant="secondary">{tag}</ThemedText>
                <TouchableOpacity
                  style={styles.removeTagButton}
                  onPress={() => handleRemoveTag(tag)}
                >
                  <X size={14} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          
          <View style={styles.addTagContainer}>
            <TextInput
              style={[
                styles.addTagInput,
                { 
                  color: colors.text,
                  backgroundColor: colors.surfaceVariant,
                  borderColor: colors.border,
                },
              ]}
              value={newTag}
              onChangeText={setNewTag}
              placeholder="Add a tag"
              placeholderTextColor={colors.secondaryText}
              onSubmitEditing={handleAddTag}
            />
            <TouchableOpacity
              style={[
                styles.addTagButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleAddTag}
            >
              <Plus size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      
      <View style={styles.buttonContainer}>
        <Button
          title="Cancel"
          variant="outlined"
          style={styles.button}
          onPress={onCancel}
        />
        <Button
          title="Save"
          style={styles.button}
          onPress={handleSave}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  scrollView: {
    flex: 1,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "bold",
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  contentInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 200,
  },
  dateSection: {
    marginTop: 24,
    marginBottom: 16,
  },
  dateLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  dateLabel: {
    marginLeft: 8,
  },
  dateInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  tagsSection: {
    marginTop: 16,
    marginBottom: 32,
  },
  tagsHeader: {
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  removeTagButton: {
    marginLeft: 6,
  },
  addTagContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  addTagInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  addTagButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
  },
  button: {
    flex: 1,
    marginHorizontal: 8,
  },
});