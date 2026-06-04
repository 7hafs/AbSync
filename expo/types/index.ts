export type StaffMember = {
  id: string;
  name: string;
  department?: string;
  active: boolean;
  createdAt: string;
};

export type CalendarAccessLevel = 'owner' | 'editor' | 'viewer';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  accessLevel: CalendarAccessLevel;
  joinedAt: string;
};

export type CalendarShareMode = 'edit' | 'view';

export type AbsenceType = 'Holiday' | 'Sickness' | 'Training' | 'Unpaid Leave' | 'Other' | 'Public Holiday';
export type AbsenceDuration = 'Full' | 'AM' | 'PM';
export type AbsenceStatus = 'Pending' | 'Approved' | 'Rejected';

export type Absence = {
  id: string;
  staffId: string;
  name: string;
  type: AbsenceType;
  date: string;
  duration: AbsenceDuration;
  status: AbsenceStatus;
  cover?: string | null;
  notes: string;
  locked?: boolean;
  createdBy: string;
  createdAt: string;
};

export type CalendarSharePayload = {
  version: 1;
  workspaceId: string;
  sharedBy: string;
  sharedByEmail: string;
  createdAt: string;
  mode: CalendarShareMode;
  staff: StaffMember[];
  absences: Absence[];
};

export type CalendarViewType = 'month' | 'week' | 'day';

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
