import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PersonType, PersonAbsence } from "@/types";

interface PeopleState {
  people: PersonType[];
  absences: PersonAbsence[];
  addPerson: (person: PersonType) => void;
  updatePerson: (person: PersonType) => void;
  deletePerson: (id: string) => void;
  addAbsence: (absence: PersonAbsence) => void;
  updateAbsence: (absence: PersonAbsence) => void;
  deleteAbsence: (id: string) => void;
  getPersonById: (id: string) => PersonType | undefined;
  getAbsencesForDate: (date: string) => PersonAbsence[];
  getAbsencesForPerson: (personId: string) => PersonAbsence[];
}

const usePeopleStore = create<PeopleState>()(
  persist(
    (set, get) => ({
      people: [],
      absences: [],

      addPerson: (person) =>
        set((state) => ({
          people: [...state.people, person],
        })),

      updatePerson: (updatedPerson) =>
        set((state) => ({
          people: state.people.map((p) =>
            p.id === updatedPerson.id ? updatedPerson : p
          ),
        })),

      deletePerson: (id) =>
        set((state) => ({
          people: state.people.filter((p) => p.id !== id),
          absences: state.absences.filter((a) => a.personId !== id),
        })),

      addAbsence: (absence) =>
        set((state) => ({
          absences: [...state.absences, absence],
        })),

      updateAbsence: (updatedAbsence) =>
        set((state) => ({
          absences: state.absences.map((a) =>
            a.id === updatedAbsence.id ? updatedAbsence : a
          ),
        })),

      deleteAbsence: (id) =>
        set((state) => ({
          absences: state.absences.filter((a) => a.id !== id),
        })),

      getPersonById: (id) => {
        return get().people.find((p) => p.id === id);
      },

      getAbsencesForDate: (date) => {
        return get().absences.filter((a) => a.date === date);
      },

      getAbsencesForPerson: (personId) => {
        return get().absences.filter((a) => a.personId === personId);
      },
    }),
    {
      name: "people-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default usePeopleStore;
