import React from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import NoteEditor from "@/components/notes/NoteEditor";
import useNotesStore from "@/store/useNotesStore";
import { NoteType } from "@/types";

export default function NoteEditorScreen() {
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const { notes, addNote, updateNote } = useNotesStore();
  
  const existingNote = id ? notes.find(n => n.id === id) : undefined;
  
  const initialNote = existingNote || (date ? {
    id: "",
    title: "",
    content: "",
    tags: [],
    date: date,
    isPinned: false,
    createdAt: "",
    updatedAt: "",
  } : undefined);
  
  const handleSave = (note: NoteType) => {
    if (existingNote) {
      updateNote(note);
    } else {
      addNote(note);
    }
    router.back();
  };
  
  const handleCancel = () => {
    router.back();
  };
  
  return (
    <>
      <Stack.Screen 
        options={{ 
          title: existingNote ? "Edit Note" : "New Note",
          headerBackTitle: "Back",
        }} 
      />
      <NoteEditor
        initialNote={initialNote}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </>
  );
}
