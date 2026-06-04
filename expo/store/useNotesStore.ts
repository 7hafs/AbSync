import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NoteType } from "@/types";

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

      addNote: (note) =>
        set((state) => ({
          notes: [...state.notes, note],
        })),

      updateNote: (updatedNote) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === updatedNote.id ? updatedNote : n
          ),
        })),

      deleteNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        })),

      togglePinNote: (id) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, isPinned: !n.isPinned } : n
          ),
        })),

      replaceNotes: (notes) => set(() => ({ notes })),
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
      partialize: (state) => ({
        notes: state.notes,
      }),
    }
  )
);

export default useNotesStore;
