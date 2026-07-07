import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { CalendarShareMode, CalendarSharePayload } from "@/types";
import { StaffMember, Absence } from "@/types";

interface CreateShareInput {
  mode: CalendarShareMode;
  sharedBy: string;
  sharedByEmail: string;
  workspaceId: string;
  staff: StaffMember[];
  absences: Absence[];
}

interface ShareState {
  lastGeneratedLink: string | null;
  lastGeneratedPayload: CalendarSharePayload | null;
  createShareLink: (input: CreateShareInput) => string;
  decodeShareLink: (value: string) => CalendarSharePayload | null;
  clearLastShare: () => void;
}

function encodePayload(payload: CalendarSharePayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

function tryDecodePayload(value: string): CalendarSharePayload | null {
  try {
    const normalizedValue = value.includes("data=")
      ? (Linking.parse(value).queryParams?.data as string | undefined) ?? value
      : value;
    const parsed = JSON.parse(decodeURIComponent(normalizedValue)) as CalendarSharePayload;

    if (parsed.version !== 1 || !Array.isArray(parsed.staff) || !Array.isArray(parsed.absences)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

const useShareStore = create<ShareState>()(
  persist(
    (set) => ({
      lastGeneratedLink: null,
      lastGeneratedPayload: null,
      createShareLink: ({ mode, sharedBy, sharedByEmail, workspaceId, staff, absences }) => {
        const payload: CalendarSharePayload = {
          version: 1,
          workspaceId,
          sharedBy,
          sharedByEmail,
          createdAt: new Date().toISOString(),
          mode,
          staff,
          absences,
        };

        const data = encodePayload(payload);
        const link = Linking.createURL("/share/join", {
          queryParams: { data },
        });

        set({
          lastGeneratedLink: link,
          lastGeneratedPayload: payload,
        });

        return link;
      },
      decodeShareLink: (value) => tryDecodePayload(value),
      clearLastShare: () => set({ lastGeneratedLink: null, lastGeneratedPayload: null }),
    }),
    {
      name: "share-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useShareStore;
