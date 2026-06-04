/**
 * Date utilities using local-time-safe methods.
 *
 * All date storage uses "YYYY-MM-DD" calendar-date strings.
 * toISOString() is NEVER used for date formatting because it
 * converts to UTC and can shift dates by one day in non-UTC timezones.
 */

/**
 * Format a Date as a "YYYY-MM-DD" calendar-date string using LOCAL time.
 * This is the single source of truth for date serialization.
 * Safe across all timezones — never shifts dates.
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Create a Date from a "YYYY-MM-DD" calendar-date string.
 * Uses noon UTC to avoid timezone edge cases at midnight.
 * The resulting Date represents the correct calendar date
 * regardless of the user's timezone.
 */
export function fromDateString(dateString: string): Date {
  // Parse as local date at noon to avoid midnight timezone shifts
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Get today's date as a "YYYY-MM-DD" calendar-date string.
 */
export function todayDateString(): string {
  return toDateString(new Date());
}

/**
 * Format a date string for UK display: "DD/MM/YYYY"
 */
export function formatDateUK(dateString: string): string {
  const d = fromDateString(dateString);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format a date string for UK display with weekday: "Mon, 04/06/2026"
 */
export function formatDateUKShort(dateString: string): string {
  const d = fromDateString(dateString);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" });
  return `${weekday}, ${formatDateUK(dateString)}`;
}

/**
 * Format a date string for UK display with full weekday and month:
 * "Wednesday, 4 June 2026"
 */
export function formatDateUKLong(dateString: string): string {
  return fromDateString(dateString).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));

  const weekDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(addDays(monday, i));
  }

  return weekDates;
};

export const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourFormatted = hour.toString().padStart(2, "0");
    slots.push(`${hourFormatted}:00`);
  }
  return slots;
};
