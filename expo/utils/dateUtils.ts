export const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate();
};

export const getMonthName = (month: number): string => {
  const date = new Date();
  date.setMonth(month);
  return date.toLocaleString("default", { month: "long" });
};

export const getDayName = (date: Date): string => {
  return date.toLocaleString("default", { weekday: "long" });
};

export const getShortDayName = (date: Date): string => {
  return date.toLocaleString("default", { weekday: "short" });
};

export const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const getWeekDates = (date: Date): Date[] => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(date.setDate(diff));
  
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(addDays(monday, i));
  }
  
  return weekDates;
};

export const generateTimeSlots = (): string[] => {
  const slots = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourFormatted = hour.toString().padStart(2, "0");
    slots.push(`${hourFormatted}:00`);
  }
  return slots;
};