import React from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import ReminderForm from "@/components/reminders/ReminderForm";
import useRemindersStore from "@/store/useRemindersStore";
import { ReminderType } from "@/types";

export default function ReminderFormScreen() {
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const { reminders, addReminder, updateReminder } = useRemindersStore();
  
  const existingReminder = id ? reminders.find(r => r.id === id) : undefined;
  
  const initialReminder = existingReminder || (date ? {
    id: "",
    title: "",
    date: date,
    time: "",
    isCompleted: false,
    isRecurring: false,
  } : undefined);
  
  const handleSave = (reminder: ReminderType) => {
    if (existingReminder) {
      updateReminder(reminder);
    } else {
      addReminder(reminder);
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
          title: existingReminder ? "Edit Reminder" : "New Reminder",
          headerBackTitle: "Back",
        }} 
      />
      <ReminderForm
        initialReminder={initialReminder}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </>
  );
}
