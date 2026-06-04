/**
 * CSV export utility for absence records.
 *
 * Exports absence data as a CSV file that can be shared or saved.
 * Uses UK date formatting (DD/MM/YYYY) throughout.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Absence } from '@/types';
import { formatDateUK } from '@/utils/dateUtils';

const CSV_HEADERS = [
  'Date',
  'Employee',
  'Type',
  'Duration',
  'Status',
  'Cover',
  'Notes',
  'Created',
];

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function absenceToCsvRow(absence: Absence): string {
  return [
    formatDateUK(absence.date),
    escapeCsvField(absence.name),
    escapeCsvField(absence.type),
    absence.duration,
    absence.status,
    escapeCsvField(absence.cover ?? ''),
    escapeCsvField(absence.notes ?? ''),
    formatDateUK(absence.createdAt.split('T')[0]),
  ].join(',');
}

/**
 * Export absences as a CSV file and share it via the system share sheet.
 */
export async function exportAbsencesCSV(
  absences: Absence[]
): Promise<{ success: boolean; message: string }> {
  try {
    if (absences.length === 0) {
      return { success: false, message: 'No absence records to export.' };
    }

    const sorted = [...absences].sort((a, b) => a.date.localeCompare(b.date));
    const rows = sorted.map(absenceToCsvRow);
    const csv = [CSV_HEADERS.join(','), ...rows].join('\n');

    const fileName = `absenceflow-export-${new Date().toISOString().split('T')[0]}.csv`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Absences CSV',
      });
      return { success: true, message: 'CSV exported successfully.' };
    }

    return {
      success: true,
      message: `CSV saved to ${filePath}. Sharing is not available on this device.`,
    };
  } catch (err) {
    console.error('[csvExport] Export failed:', err);
    return { success: false, message: 'Failed to export CSV. Please try again.' };
  }
}
