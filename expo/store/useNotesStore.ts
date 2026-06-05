import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NoteType } from "@/types";
import { DB_VERSION } from "@/lib/storageManager";
import { upsertNote, deleteNoteFromSupabase } from "@/lib/dataService";

interface NotesState {
  notes: NoteType[];
  isLoaded: boolean;
  addNote: (note: NoteType) => void;
  updateNote: (note: NoteType) => void;
  deleteNote: (id: string) => void;
  togglePinNote: (id: string) => void;
  replaceNotes: (notes: NoteType[]) => void;
  setLoaded: (loaded: boolean) => void;
  searchNotes: (query: string) => NoteType[];
  getNotesForDate: (date: string) => NoteType[];
  getNotesByTag: (tag: string) => NoteType[];
  getPinnedNotes: () => NoteType[];
}

const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: [],
      isLoaded: false,

      addNote: (note) => {
        set((state) => ({
          notes: [...state.notes, note],
        }));
        // Sync to Supabase
        upsertNote(note);
      },

      updateNote: (updatedNote) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === updatedNote.id ? updatedNote : n
          ),
        }));
        // Sync to Supabase
        upsertNote(updatedNote);
      },

      deleteNote: (id) => {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        }));
        // Sync to Supabase
        deleteNoteFromSupabase(id);
      },

      togglePinNote: (id) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, isPinned: !n.isPinned } : n
          ),
        })),

      replaceNotes: (incoming) => {
        if (!Array.isArray(incoming) || incoming.length === 0) {
          const currentCount = get().notes.length;
          if (currentCount > 0) {
            console.warn('[useNotesStore] Refusing to replace notes with empty array');
            return;
          }
        }
        set(() => ({ notes: incoming }));
      },
      setLoaded: (loaded) => set(() => ({ isLoaded: loaded })),

      searchNotes: (query) => {
        const lowerQuery = query.toLowerCase();
        return get().notes.filter(
          (n) =>
            n.title.toLowerCase().includes(lowerQuery) ||
            n.content.toLowerCase().includes(lowerQuery) ||
            n.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
        );
      },

      getNotesForDate: (date) => {
        return get().notes.filter((n) => n.date === date);
      },

      getNotesByTag: (tag) => {
        return get().notes.filter((n) => n.tags.includes(tag));
      },

      getPinnedNotes: () => {
        return get().notes.filter((n) => n.isPinned);
      },
    }),
    {
      name: "notes-storage-v2",
      storage: createJSONStorage(() => AsyncStorage),
      version: DB_VERSION,
      migrate: (persisted) => persisted,
      partialize: (state) => ({
        notes: state.notes,
      }),
    }
  )
);

export default useNotesStore;
