export type StaffMember = {
  id: string;
  name: string;
  department?: string;
  active: boolean;
  createdAt: string;
};

export type AbsenceSessionType = 'AM' | 'PM' | 'Full Day';

export type AbsenceTypeCategory = 'Holiday' | 'Sickness' | 'Other';

export type AbsenceStatus = 'Pending' | 'Confirmed' | 'Cancelled';

export type Absence = {
  id: string;
  staffId: string;
  date: string;
  session: AbsenceSessionType;
  type: AbsenceTypeCategory;
  note?: string;
  status: AbsenceStatus;
  createdBy: string;
  createdAt: string;
};

export type CalendarViewType = "month" | "week" | "day";

export type DashboardStats = {
  totalAbsencesThisMonth: number;
  sicknessCount: number;
  holidayCount: number;
  staffWithMostAbsences: { staffId: string; count: number }[];
  daysWithHighAbsence: { date: string; count: number }[];
};

export type EventType = {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  timeOfDay?: 'AM' | 'PM';
  personId?: string;
  isRecurring: boolean;
  recurringPattern?: 'daily' | 'weekly' | 'monthly';
};

export type NoteType = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  date?: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReminderType = {
  id: string;
  title: string;
  date: string;
  time?: string;
  isCompleted: boolean;
  isRecurring: boolean;
  recurringPattern?: 'daily' | 'weekly' | 'monthly';
};

export type PersonType = {
  id: string;
  name: string;
  role?: string;
};

export type PersonAbsence = {
  id: string;
  personId: string;
  date: string;
  type: 'vacation' | 'absence';
  reason?: string;
};
