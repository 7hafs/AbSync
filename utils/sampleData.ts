import { StaffMember, Absence } from "@/types";

export const sampleStaff: StaffMember[] = [
  { id: "1", name: "Emily Wright", department: "HR", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "2", name: "Michael Chen", department: "IT", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "3", name: "Sarah Johnson", department: "Finance", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "4", name: "David Martinez", department: "Operations", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "5", name: "Lisa Anderson", department: "Marketing", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "6", name: "James Wilson", department: "Sales", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "7", name: "Maria Garcia", department: "HR", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "8", name: "Robert Taylor", department: "IT", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "9", name: "Jennifer Brown", department: "Finance", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "10", name: "William Davis", department: "Operations", active: true, createdAt: "2025-01-01T00:00:00.000Z" },
];

export const sampleAbsences: Absence[] = [
  {
    id: "a1",
    staffId: "1",
    date: "2025-10-25",
    session: "Full Day",
    type: "Holiday",
    note: "Annual leave",
    status: "Confirmed",
    createdBy: "Admin 1",
    createdAt: "2025-10-20T00:00:00.000Z",
  },
  {
    id: "a2",
    staffId: "2",
    date: "2025-10-27",
    session: "AM",
    type: "Sickness",
    note: "Doctor appointment",
    status: "Confirmed",
    createdBy: "Admin 1",
    createdAt: "2025-10-21T00:00:00.000Z",
  },
  {
    id: "a3",
    staffId: "3",
    date: "2025-10-28",
    session: "PM",
    type: "Holiday",
    status: "Confirmed",
    createdBy: "Admin 2",
    createdAt: "2025-10-22T00:00:00.000Z",
  },
  {
    id: "a4",
    staffId: "4",
    date: "2025-10-29",
    session: "Full Day",
    type: "Sickness",
    note: "Flu",
    status: "Confirmed",
    createdBy: "Admin 1",
    createdAt: "2025-10-23T00:00:00.000Z",
  },
  {
    id: "a5",
    staffId: "5",
    date: "2025-10-30",
    session: "AM",
    type: "Other",
    note: "Family emergency",
    status: "Confirmed",
    createdBy: "Admin 3",
    createdAt: "2025-10-24T00:00:00.000Z",
  },
];

export function initializeSampleData(
  staffStore: any,
  absenceStore: any
) {
  if (staffStore.staff.length === 0) {
    sampleStaff.forEach((staff: StaffMember) => {
      staffStore.addStaff(staff);
    });
  }

  if (absenceStore.absences.length === 0) {
    sampleAbsences.forEach((absence: Absence) => {
      absenceStore.addAbsence(absence);
    });
  }
}
