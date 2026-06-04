import { StaffMember, Absence } from '@/types';
import { toDateString } from '@/utils/dateUtils';

export const sampleStaff: StaffMember[] = [
  { id: '1', name: 'Sarah Ahmed', department: 'Operations', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'Adam Lewis', department: 'Support', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '3', name: 'Maya Patel', department: 'Finance', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '4', name: 'Chloe Green', department: 'People', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '5', name: 'Owen Clark', department: 'Sales', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
];

const publicHolidays2026: Absence[] = [
  { id: 'ph-2026-01-01', staffId: 'public-holiday', name: 'New Year\'s Day', type: 'Public Holiday', date: '2026-01-01', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ph-2026-04-03', staffId: 'public-holiday', name: 'Good Friday', type: 'Public Holiday', date: '2026-04-03', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ph-2026-04-06', staffId: 'public-holiday', name: 'Easter Monday', type: 'Public Holiday', date: '2026-04-06', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ph-2026-05-04', staffId: 'public-holiday', name: 'Early May Bank Holiday', type: 'Public Holiday', date: '2026-05-04', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ph-2026-05-25', staffId: 'public-holiday', name: 'Spring Bank Holiday', type: 'Public Holiday', date: '2026-05-25', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ph-2026-08-31', staffId: 'public-holiday', name: 'Summer Bank Holiday', type: 'Public Holiday', date: '2026-08-31', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ph-2026-12-25', staffId: 'public-holiday', name: 'Christmas Day', type: 'Public Holiday', date: '2026-12-25', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ph-2026-12-28', staffId: 'public-holiday', name: 'Boxing Day (substitute day)', type: 'Public Holiday', date: '2026-12-28', duration: 'Full', status: 'Approved', cover: null, notes: 'UK public holiday', locked: true, createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
];

export const sampleAbsences: Absence[] = [
  ...publicHolidays2026,
  { id: 'a1', staffId: '1', name: 'Sarah Ahmed', type: 'Holiday', date: '2026-04-21', duration: 'Full', status: 'Pending', cover: 'James', notes: 'Family trip', createdBy: 'Manager', createdAt: '2026-04-12T00:00:00.000Z' },
  { id: 'a2', staffId: '2', name: 'Adam Lewis', type: 'Sickness', date: '2026-04-21', duration: 'AM', status: 'Approved', cover: null, notes: 'GP appointment', createdBy: 'Manager', createdAt: '2026-04-13T00:00:00.000Z' },
  { id: 'a3', staffId: '3', name: 'Maya Patel', type: 'Training', date: '2026-04-24', duration: 'PM', status: 'Approved', cover: null, notes: 'Leadership workshop', createdBy: 'Manager', createdAt: '2026-04-13T00:00:00.000Z' },
  { id: 'a4', staffId: '4', name: 'Chloe Green', type: 'Other', date: '2026-04-24', duration: 'AM', status: 'Rejected', cover: null, notes: 'Dentist', createdBy: 'Manager', createdAt: '2026-04-15T00:00:00.000Z' },
];

export function initializeSampleData(staffStore: any, absenceStore: any) {
  console.log('[sampleData] initializing sample data');

  if (staffStore.staff.length === 0) {
    sampleStaff.forEach((staff: StaffMember) => {
      if (!staffStore.staff.find((s: StaffMember) => s.id === staff.id)) {
        staffStore.addStaff(staff);
      }
    });
  }

  if (absenceStore.absences.length === 0) {
    sampleAbsences.forEach((absence: Absence) => {
      if (!absenceStore.absences.find((a: Absence) => a.id === absence.id)) {
        absenceStore.addAbsence(absence);
      }
    });
  }
}
