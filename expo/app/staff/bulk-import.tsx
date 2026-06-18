import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  FlatList,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useColorScheme } from 'react-native';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Upload,
  Users,
  XCircle,
  AlertTriangle,
  Pencil,
  Eye,
  ChevronDown,
  ChevronUp,
  FileDown,
  Search,
  Ban,
} from 'lucide-react-native';
import * as XLSX from 'xlsx';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useStaffStore from '@/store/useStaffStore';
import { StaffMember } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

type ImportRow = {
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  employeeId: string;
  phoneNumber: string;
};

type ValidationError = {
  row: number;
  field: string;
  message: string;
};

type ImportResult = {
  row: ImportRow;
  index: number;
  status: 'ok' | 'duplicate' | 'error' | 'skipped';
  message?: string;
};

type ColumnMap = Record<string, keyof ImportRow | null>;

const FIELD_LABELS: Record<keyof ImportRow, string> = {
  name: 'Full Name',
  email: 'Email Address',
  jobTitle: 'Job Title',
  department: 'Department',
  employeeId: 'Staff ID',
  phoneNumber: 'Phone Number',
};

const REQUIRED_FIELDS: (keyof ImportRow)[] = ['name', 'email'];

const SUPPORTED_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const CSV_HEADERS = ['Full Name', 'Email Address', 'Job Title', 'Department', 'Staff ID', 'Phone Number'];

// ── Smart column detection ─────────────────────────────────────────────────

/** Map header text to the best-matching field key. */
function detectColumn(header: string): keyof ImportRow | null {
  const h = header.toLowerCase().trim();

  // Remove trailing/leading non-word chars
  const clean = h.replace(/[^a-z0-9 ]/g, '').trim();

  const patterns: [RegExp[], keyof ImportRow][] = [
    [[/\bname\b/, /\bfull\s*name\b/, /\bemployee\s*name\b/, /\bstaff\s*name\b/], 'name'],
    [[/\bemail\b/, /\be[- ]?mail\b/, /\bemail\s*address\b/, /\bcontact\s*email\b/], 'email'],
    [[/\bjob\s*title\b/, /\btitle\b/, /\bposition\b/, /\brole\b/, /\boccupation\b/], 'jobTitle'],
    [[/\bdepartment\b/, /\bdept\b/, /\bteam\b/, /\bdivision\b/, /\bunit\b/], 'department'],
    [[/\bstaff\s*id\b/, /\bemployee\s*id\b/, /\bemployee\s*no\b/, /\bbadge\b/, /\bpersonnel\s*no\b/, /\bemployeeno\b/], 'employeeId'],
    [[/\bphone\b/, /\bphone\s*number\b/, /\bmobile\b/, /\bcontact\s*no\b/, /\btelephone\b/, /\bcell\b/], 'phoneNumber'],
  ];

  for (const [regexes, field] of patterns) {
    if (regexes.some((r) => r.test(clean))) return field;
  }

  return null;
}

// ── CSV parsing ────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSVContent(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = parseCSVLine(lines[0]);
  // Detect if first row is a header or data
  const hasHeader = firstLine.some((cell) => {
    const c = cell.toLowerCase().trim();
    return c.includes('name') || c.includes('email') || c.includes('department') || c.includes('title');
  });

  if (hasHeader) {
    return {
      headers: firstLine.map((h) => h.trim()),
      rows: lines.slice(1).map(parseCSVLine),
    };
  }

  // No header — treat first row as data
  return {
    headers: [],
    rows: lines.map(parseCSVLine),
  };
}

// ── Excel parsing ──────────────────────────────────────────────────────────

function parseExcelContent(base64: string): { headers: string[]; rows: string[][] } {
  // base64 is already the content; read as binary
  const data = XLSX.read(base64, { type: 'base64' });
  const firstSheet = data.Sheets[data.SheetNames[0]];
  if (!firstSheet) return { headers: [], rows: [] };

  const jsonRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(firstSheet, { header: 1 });

  if (jsonRows.length === 0) return { headers: [], rows: [] };

  const firstRow = jsonRows[0].map((c) => String(c ?? ''));
  const hasHeader = firstRow.some((cell) => {
    const c = cell.toLowerCase().trim();
    return c.includes('name') || c.includes('email') || c.includes('department') || c.includes('title');
  });

  if (hasHeader) {
    return {
      headers: firstRow.map((h) => h.trim()),
      rows: jsonRows.slice(1).map((r) => r.map((c) => String(c ?? '').trim())),
    };
  }

  return {
    headers: [],
    rows: jsonRows.map((r) => r.map((c) => String(c ?? '').trim())),
  };
}

// ── Column mapping ─────────────────────────────────────────────────────────

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const usedFields = new Set<keyof ImportRow>();

  // First pass: exact/smart matches
  for (const header of headers) {
    const field = detectColumn(header);
    if (field && !usedFields.has(field)) {
      map[header] = field;
      usedFields.add(field);
    } else {
      map[header] = null;
    }
  }

  // Second pass: positional fallback if no smart match
  if (!usedFields.has('name') && headers.length >= 1) {
    const h = headers[0];
    if (map[h] === null) { map[h] = 'name'; usedFields.add('name'); }
  }
  if (!usedFields.has('email') && headers.length >= 2) {
    const h = headers[1];
    if (map[h] === null) { map[h] = 'email'; usedFields.add('email'); }
  }
  if (!usedFields.has('jobTitle') && headers.length >= 3) {
    const h = headers[2];
    if (map[h] === null) { map[h] = 'jobTitle'; usedFields.add('jobTitle'); }
  }
  if (!usedFields.has('department') && headers.length >= 4) {
    const h = headers[3];
    if (map[h] === null) { map[h] = 'department'; usedFields.add('department'); }
  }

  return map;
}

function applyMapping(
  headers: string[],
  rows: string[][],
  columnMap: ColumnMap,
): ImportRow[] {
  const emptyRow: ImportRow = {
    name: '',
    email: '',
    jobTitle: '',
    department: '',
    employeeId: '',
    phoneNumber: '',
  };

  return rows.map((row) => {
    const result = { ...emptyRow };
    headers.forEach((header, idx) => {
      const field = columnMap[header];
      if (field && idx < row.length) {
        (result as Record<string, string>)[field] = row[idx].trim();
      }
    });
    return result;
  });
}

// ── Validation ─────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRows(rows: ImportRow[]): ValidationError[] {
  const errors: ValidationError[] = [];

  rows.forEach((row, idx) => {
    if (!row.name.trim()) {
      errors.push({ row: idx + 1, field: 'name', message: 'Full Name is required' });
    }
    if (!row.email.trim()) {
      errors.push({ row: idx + 1, field: 'email', message: 'Email Address is required' });
    } else if (!EMAIL_REGEX.test(row.email.trim())) {
      errors.push({ row: idx + 1, field: 'email', message: `"${row.email}" is not a valid email address` });
    }
  });

  return errors;
}

// ── Template generation ────────────────────────────────────────────────────

async function downloadTemplate(): Promise<void> {
  try {
    const csvContent = CSV_HEADERS.join(',') + '\n' +
      'John Smith,john@company.com,Manager,Sales,EMP001,+44 7123 456789\n' +
      'Jane Doe,jane@company.com,Developer,Engineering,EMP002,+44 7987 654321';

    const filePath = `${FileSystem.cacheDirectory}absync-staff-import-template.csv`;
    await FileSystem.writeAsStringAsync(filePath, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Download Staff Import Template',
      });
    } else {
      Alert.alert('Template saved', `Template saved to ${filePath}`);
    }
  } catch (err) {
    console.error('[BulkImport] Template download error:', err);
    Alert.alert('Error', 'Could not generate template. Please try again.');
  }
}

// ── Staff export ───────────────────────────────────────────────────────────

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function exportStaffCSV(staffList: StaffMember[]): Promise<void> {
  try {
    if (staffList.length === 0) {
      Alert.alert('No data', 'No staff members to export.');
      return;
    }

    const rows = staffList.map((s) =>
      [
        escapeCsv(s.name),
        escapeCsv(s.email ?? ''),
        escapeCsv(s.jobTitle ?? ''),
        escapeCsv(s.department ?? ''),
        escapeCsv(s.employeeId ?? ''),
        escapeCsv(s.phoneNumber ?? ''),
      ].join(','),
    );

    const csv = [CSV_HEADERS.join(','), ...rows].join('\n');
    const fileName = `absync-staff-export-${new Date().toISOString().split('T')[0]}.csv`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Staff',
      });
    } else {
      Alert.alert('Export saved', `CSV saved to ${filePath}`);
    }
  } catch (err) {
    console.error('[BulkImport] Export error:', err);
    Alert.alert('Error', 'Could not export staff. Please try again.');
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BulkImportScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;

  const { staff, addStaff } = useStaffStore();

  // File state
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);

  // Import state
  const [imported, setImported] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Validation
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  // Edit modal
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<ImportRow | null>(null);

  // Preview expansion
  const [showAllPreview, setShowAllPreview] = useState(false);

  // ── File picker ────────────────────────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setFileName(asset.name);
      setImported(false);
      setResults([]);
      setValidationErrors([]);
      setShowErrors(false);
      setEditingIndex(null);
      setEditRow(null);
      setShowAllPreview(false);

      const isExcel =
        asset.name.endsWith('.xlsx') ||
        asset.name.endsWith('.xls') ||
        asset.mimeType?.includes('spreadsheetml') ||
        asset.mimeType?.includes('excel');

      let parsedHeaders: string[];
      let parsedDataRows: string[][];

      if (isExcel) {
        // Read as base64 for XLSX library
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const result = parseExcelContent(base64);
        parsedHeaders = result.headers;
        parsedDataRows = result.rows;
      } else {
        const content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const result = parseCSVContent(content);
        parsedHeaders = result.headers;
        parsedDataRows = result.rows;
      }

      if (parsedDataRows.length === 0) {
        Alert.alert(
          'No data found',
          'The file appears to be empty or has an unsupported format. Please use a CSV or Excel file with staff data.',
        );
        return;
      }

      // Handle no-header files: use default column names
      const effectiveHeaders =
        parsedHeaders.length > 0
          ? parsedHeaders
          : CSV_HEADERS.slice(0, Math.max(parsedDataRows[0]?.length ?? 4, 4));

      const map = buildColumnMap(effectiveHeaders);
      const rows = applyMapping(effectiveHeaders, parsedDataRows, map);

      // Filter out completely empty rows
      const nonEmpty = rows.filter(
        (r) => r.name.trim() || r.email.trim() || r.jobTitle.trim() || r.department.trim(),
      );

      if (nonEmpty.length === 0) {
        Alert.alert('No data found', 'No readable staff records were found in the file.');
        return;
      }

      setHeaders(effectiveHeaders);
      setColumnMap(map);
      setParsedRows(nonEmpty);
      setRawRows(parsedDataRows);

      // Run validation
      const errors = validateRows(nonEmpty);
      setValidationErrors(errors);

      const mappedFields = Object.values(map).filter(Boolean).length;
      const totalFields = effectiveHeaders.length;

      if (mappedFields === 0) {
        Alert.alert(
          'Column Detection',
          `Could not automatically detect column meanings from the headers. The first 4 columns will be treated as: Full Name, Email, Job Title, Department (in that order). You can edit individual records before importing.`,
        );
      }
    } catch (err) {
      console.error('[BulkImport] File pick error:', err);
      Alert.alert('Import failed', 'Could not read the selected file. Please ensure it is a valid CSV or Excel file.');
    }
  }, []);

  // ── Edit row ────────────────────────────────────────────────────────────

  const openEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setEditRow({ ...parsedRows[index] });
  }, [parsedRows]);

  const saveEdit = useCallback(() => {
    if (editingIndex === null || !editRow) return;
    const updated = [...parsedRows];
    updated[editingIndex] = editRow;
    setParsedRows(updated);

    // Re-validate
    const errors = validateRows(updated);
    setValidationErrors(errors);

    setEditingIndex(null);
    setEditRow(null);
  }, [editingIndex, editRow, parsedRows]);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditRow(null);
  }, []);

  // ── Import ──────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (parsedRows.length === 0) return;

    // Final validation
    const errors = validateRows(parsedRows);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowErrors(true);
      Alert.alert(
        'Validation Errors',
        `${errors.length} error(s) found. Please fix the highlighted rows before importing.`,
      );
      return;
    }

    setImporting(true);
    setImportProgress(0);

    const importResults: ImportResult[] = [];
    let addedCount = 0;
    let dupCount = 0;
    let errorCount = 0;

    // Build lookup sets from current store
    const existingEmails = new Set(
      staff.filter((s) => s.email).map((s) => s.email!.toLowerCase()),
    );
    const existingNames = new Set(staff.map((s) => s.name.toLowerCase()));

    // Also track within-batch duplicates
    const batchEmails = new Set<string>();
    const batchNames = new Set<string>();

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];

      // Check batch duplicates
      if (batchEmails.has(row.email.toLowerCase())) {
        importResults.push({
          row,
          index: i,
          status: 'duplicate',
          message: `Email "${row.email}" appears multiple times in this file`,
        });
        dupCount++;
        continue;
      }

      // Check existing duplicates by email
      if (existingEmails.has(row.email.toLowerCase())) {
        importResults.push({
          row,
          index: i,
          status: 'duplicate',
          message: `Email "${row.email}" is already registered`,
        });
        dupCount++;
        continue;
      }

      // Create staff member
      const newMember: StaffMember = {
        id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${i}`,
        name: row.name.trim(),
        department: row.department.trim() || undefined,
        employeeId: row.employeeId.trim() || undefined,
        email: row.email.trim() || undefined,
        jobTitle: row.jobTitle.trim() || undefined,
        phoneNumber: row.phoneNumber.trim() || undefined,
        active: true,
        createdAt: new Date().toISOString(),
      };

      try {
        addStaff(newMember);
        existingEmails.add(row.email.toLowerCase());
        existingNames.add(row.name.toLowerCase());
        batchEmails.add(row.email.toLowerCase());
        batchNames.add(row.name.toLowerCase());

        importResults.push({ row, index: i, status: 'ok', message: 'Added successfully' });
        addedCount++;
      } catch {
        importResults.push({
          row,
          index: i,
          status: 'error',
          message: 'Failed to save to database',
        });
        errorCount++;
      }

      setImportProgress(Math.round(((i + 1) / parsedRows.length) * 100));
    }

    setResults(importResults);
    setImported(true);
    setImporting(false);

    const total = addedCount + dupCount + errorCount;
    Alert.alert(
      'Import Complete',
      `${addedCount} staff member(s) added successfully.\n${dupCount} duplicate(s) skipped.\n${errorCount} error(s).\n\nImported staff are now available in Staff Management and the Dashboard.`,
      [{ text: 'OK' }],
    );
  }, [parsedRows, staff, addStaff]);

  // ── Computed values ─────────────────────────────────────────────────────

  const okCount = results.filter((r) => r.status === 'ok').length;
  const dupCount = results.filter((r) => r.status === 'duplicate').length;
  const errCount = results.filter((r) => r.status === 'error').length;

  const duplicateRows = useMemo(
    () => {
      const emailSet = new Set(staff.filter((s) => s.email).map((s) => s.email!.toLowerCase()));
      return parsedRows.filter((r) => r.email && emailSet.has(r.email.toLowerCase()));
    },
    [parsedRows, staff],
  );

  const newRows = useMemo(
    () => {
      const emailSet = new Set(staff.filter((s) => s.email).map((s) => s.email!.toLowerCase()));
      return parsedRows.filter((r) => r.email && !emailSet.has(r.email.toLowerCase()));
    },
    [parsedRows, staff],
  );

  const previewRows = showAllPreview ? parsedRows : parsedRows.slice(0, 10);
  const hasErrors = validationErrors.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Import Staff',
          headerRight: () =>
            staff.length > 0 ? (
              <TouchableOpacity
                onPress={() => exportStaffCSV(staff)}
                style={{ marginRight: 8 }}
              >
                <FileDown size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : null,
        }}
      />

      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentLarge]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.panel,
            { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 980 : undefined },
          ]}
        >
          {/* Hero */}
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: '#FEF3C7' }]}>
              <FileSpreadsheet size={28} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.heroTitle}>Bulk Staff Import</ThemedText>
              <ThemedText variant="secondary" style={styles.heroSub}>
                Upload a CSV or Excel file with staff records. Duplicates are detected by email address.
              </ThemedText>
            </View>
          </View>

          {/* Template download */}
          <TouchableOpacity
            style={[styles.templateBtn, { borderColor: colors.border }]}
            onPress={downloadTemplate}
            activeOpacity={0.7}
          >
            <Download size={16} color={colors.primary} />
            <ThemedText style={[styles.templateBtnText, { color: colors.primary }]}>
              Download sample CSV template
            </ThemedText>
          </TouchableOpacity>

          {/* File upload zone */}
          <View style={styles.section}>
            <TouchableOpacity
              testID="bulk-import-pick-file"
              style={[
                styles.uploadZone,
                {
                  borderColor: fileName ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              onPress={handlePickFile}
              activeOpacity={0.7}
            >
              {fileName ? (
                <View style={styles.fileRow}>
                  <View style={[styles.fileIcon, { backgroundColor: '#FEF3C7' }]}>
                    <FileText size={20} color="#D97706" />
                  </View>
                  <View style={styles.fileInfo}>
                    <ThemedText style={styles.fileNameText} numberOfLines={1}>
                      {fileName}
                    </ThemedText>
                    <ThemedText variant="secondary" style={styles.fileCount}>
                      {parsedRows.length} record{parsedRows.length !== 1 ? 's' : ''} detected
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    onPress={handlePickFile}
                    style={[styles.changeBtn, { borderColor: colors.border }]}
                  >
                    <ThemedText style={{ color: colors.primary, fontWeight: '600' as const, fontSize: 13 }}>
                      Change
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <View style={[styles.uploadIcon, { backgroundColor: colors.surfaceVariant }]}>
                    <Upload size={26} color={colors.secondaryText} />
                  </View>
                  <ThemedText style={styles.uploadText} weight="semibold">
                    Tap to select a file
                  </ThemedText>
                  <ThemedText variant="secondary" style={styles.uploadFormats}>
                    CSV or Excel (.xlsx) supported
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Stats bar */}
          {parsedRows.length > 0 && !imported && (
            <View style={[styles.statsBar, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.statItem}>
                <Users size={14} color={colors.primary} />
                <ThemedText style={styles.statText}>{parsedRows.length} total</ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <CheckCircle2 size={14} color="#16A34A" />
                <ThemedText style={[styles.statText, { color: '#16A34A' }]}>
                  {newRows.length} new
                </ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ban size={14} color="#F59E0B" />
                <ThemedText style={[styles.statText, { color: '#F59E0B' }]}>
                  {duplicateRows.length} duplicates
                </ThemedText>
              </View>
            </View>
          )}

          {/* Validation errors */}
          {showErrors && hasErrors && !imported && (
            <View style={[styles.errorsCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <View style={styles.errorsHeader}>
                <AlertTriangle size={16} color="#DC2626" />
                <ThemedText style={styles.errorsTitle}>
                  {validationErrors.length} validation error{validationErrors.length !== 1 ? 's' : ''}
                </ThemedText>
              </View>
              {validationErrors.slice(0, 5).map((err, idx) => (
                <View key={idx} style={styles.errorItem}>
                  <XCircle size={12} color="#DC2626" />
                  <ThemedText style={styles.errorText}>
                    Row {err.row}, {FIELD_LABELS[err.field as keyof ImportRow] ?? err.field}: {err.message}
                  </ThemedText>
                </View>
              ))}
              {validationErrors.length > 5 && (
                <ThemedText variant="secondary" style={{ fontSize: 11, marginTop: 4 }}>
                  +{validationErrors.length - 5} more errors
                </ThemedText>
              )}
            </View>
          )}

          {/* Preview table */}
          {parsedRows.length > 0 && !imported && (
            <View style={styles.section}>
              <View style={styles.previewHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Eye size={16} color={colors.text} />
                  <ThemedText style={styles.sectionLabel} weight="semibold">
                    Preview
                  </ThemedText>
                </View>
                <ThemedText variant="secondary" style={{ fontSize: 12 }}>
                  Tap the pencil icon to edit a row
                </ThemedText>
              </View>

              <View style={[styles.previewTable, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                {/* Table header */}
                <View
                  style={[
                    styles.tableHeaderRow,
                    { borderBottomColor: colors.border, backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  <ThemedText style={[styles.tableHeaderCell, styles.nameCol]}>Name</ThemedText>
                  <ThemedText style={[styles.tableHeaderCell, styles.emailCol]}>Email</ThemedText>
                  <ThemedText style={[styles.tableHeaderCell, styles.jobCol]}>Job Title</ThemedText>
                  <ThemedText style={[styles.tableHeaderCell, styles.deptCol]}>Dept</ThemedText>
                  <ThemedText style={[styles.tableHeaderCell, styles.editCol]}>Edit</ThemedText>
                </View>

                {/* Table rows */}
                <FlatList
                  data={previewRows}
                  keyExtractor={(_, idx) => `row-${idx}`}
                  scrollEnabled={false}
                  renderItem={({ item, index }) => {
                    const isDup = duplicateRows.some((d) => d.email === item.email && item.email);
                    const hasRowError = validationErrors.some((e) => e.row === index + 1);
                    return (
                      <View
                        style={[
                          styles.tableRow,
                          { borderBottomColor: colors.border },
                          isDup && { backgroundColor: 'rgba(245, 158, 11, 0.06)' },
                          hasRowError && { backgroundColor: 'rgba(220, 38, 38, 0.06)' },
                        ]}
                      >
                        <ThemedText style={[styles.tableCell, styles.nameCol]} numberOfLines={1}>
                          {item.name || '—'}
                        </ThemedText>
                        <View style={[styles.tableCell, styles.emailCol]}>
                          <ThemedText
                            style={[
                              { fontSize: 12 },
                              isDup && { color: '#D97706', fontWeight: '600' as const },
                            ]}
                            numberOfLines={1}
                          >
                            {item.email || '—'}
                          </ThemedText>
                          {isDup && (
                            <ThemedText style={{ fontSize: 9, color: '#D97706' }}>duplicate</ThemedText>
                          )}
                        </View>
                        <ThemedText style={[styles.tableCell, styles.jobCol]} numberOfLines={1}>
                          {item.jobTitle || '—'}
                        </ThemedText>
                        <ThemedText style={[styles.tableCell, styles.deptCol]} numberOfLines={1}>
                          {item.department || '—'}
                        </ThemedText>
                        <TouchableOpacity
                          style={[styles.tableCell, styles.editCol]}
                          onPress={() => openEdit(index)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Pencil size={14} color={colors.secondaryText} />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />

                {/* Show more */}
                {parsedRows.length > 10 && !showAllPreview && (
                  <TouchableOpacity
                    style={[styles.showMoreBtn, { borderTopColor: colors.border }]}
                    onPress={() => setShowAllPreview(true)}
                  >
                    <ChevronDown size={14} color={colors.primary} />
                    <ThemedText style={{ color: colors.primary, fontSize: 13, fontWeight: '600' as const }}>
                      Show all {parsedRows.length} records
                    </ThemedText>
                  </TouchableOpacity>
                )}

                {showAllPreview && parsedRows.length > 10 && (
                  <TouchableOpacity
                    style={[styles.showMoreBtn, { borderTopColor: colors.border }]}
                    onPress={() => setShowAllPreview(false)}
                  >
                    <ChevronUp size={14} color={colors.primary} />
                    <ThemedText style={{ color: colors.primary, fontSize: 13, fontWeight: '600' as const }}>
                      Show fewer
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Import button */}
          {parsedRows.length > 0 && !imported && (
            <TouchableOpacity
              testID="bulk-import-button"
              style={[
                styles.importButton,
                { backgroundColor: importing ? colors.secondaryText : colors.primary },
              ]}
              onPress={handleImport}
              disabled={importing}
              activeOpacity={0.7}
            >
              {importing ? (
                <View style={styles.importingRow}>
                  <ActivityIndicator size="small" color="white" />
                  <ThemedText style={styles.importButtonText}>
                    Importing... {importProgress}%
                  </ThemedText>
                </View>
              ) : (
                <>
                  <Download size={18} color="white" />
                  <ThemedText style={styles.importButtonText}>
                    Import {newRows.length} Staff Member{newRows.length !== 1 ? 's' : ''}
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Progress bar */}
          {importing && (
            <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceVariant }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${importProgress}%`,
                  },
                ]}
              />
            </View>
          )}

          {/* Results summary */}
          {imported && results.length > 0 && (
            <View style={styles.section}>
              <View style={styles.resultHeader}>
                <CheckCircle2 size={20} color="#16A34A" />
                <ThemedText style={styles.resultTitle}>Import Complete</ThemedText>
              </View>

              <View style={styles.resultSummary}>
                <View style={[styles.resultBadge, { backgroundColor: 'rgba(22, 163, 74, 0.1)' }]}>
                  <CheckCircle2 size={16} color="#16A34A" />
                  <View>
                    <ThemedText style={[styles.resultBadgeValue, { color: '#16A34A' }]}>
                      {okCount}
                    </ThemedText>
                    <ThemedText style={[styles.resultBadgeLabel, { color: '#16A34A' }]}>
                      Added
                    </ThemedText>
                  </View>
                </View>
                <View style={[styles.resultBadge, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                  <AlertTriangle size={16} color="#D97706" />
                  <View>
                    <ThemedText style={[styles.resultBadgeValue, { color: '#D97706' }]}>
                      {dupCount}
                    </ThemedText>
                    <ThemedText style={[styles.resultBadgeLabel, { color: '#D97706' }]}>
                      Skipped
                    </ThemedText>
                  </View>
                </View>
                {errCount > 0 && (
                  <View style={[styles.resultBadge, { backgroundColor: 'rgba(220, 38, 38, 0.1)' }]}>
                    <XCircle size={16} color="#DC2626" />
                    <View>
                      <ThemedText style={[styles.resultBadgeValue, { color: '#DC2626' }]}>
                        {errCount}
                      </ThemedText>
                      <ThemedText style={[styles.resultBadgeLabel, { color: '#DC2626' }]}>
                        Errors
                      </ThemedText>
                    </View>
                  </View>
                )}
              </View>

              {/* Error/skipped details */}
              {results.filter((r) => r.status !== 'ok').length > 0 && (
                <View style={[styles.resultList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  {results
                    .filter((r) => r.status !== 'ok')
                    .map((r) => (
                      <View key={`result-${r.index}`} style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                        {r.status === 'duplicate' ? (
                          <AlertTriangle size={14} color="#D97706" />
                        ) : (
                          <XCircle size={14} color="#DC2626" />
                        )}
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.resultName}>
                            {r.row.name || `Row ${r.index + 1}`}
                          </ThemedText>
                          <ThemedText variant="secondary" style={styles.resultMsg}>
                            {r.message}
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                </View>
              )}

              <TouchableOpacity
                testID="bulk-import-done"
                style={[styles.doneButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => router.back()}
              >
                <ThemedText style={[styles.doneButtonText, { color: colors.primary }]}>
                  Done — Go to Staff List
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editingIndex !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={cancelEdit}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={cancelEdit}>
              <ThemedText style={{ color: colors.secondaryText, fontSize: 16 }}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.modalTitle} weight="semibold">
              Edit Row {editingIndex !== null ? editingIndex + 1 : ''}
            </ThemedText>
            <TouchableOpacity onPress={saveEdit}>
              <ThemedText style={{ color: colors.primary, fontSize: 16, fontWeight: '600' as const }}>
                Save
              </ThemedText>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {editRow && (
              <>
                <View style={styles.modalField}>
                  <ThemedText style={styles.modalLabel}>Full Name *</ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={editRow.name}
                    onChangeText={(v) => setEditRow({ ...editRow, name: v })}
                    placeholder="Full Name"
                    placeholderTextColor={colors.secondaryText}
                  />
                </View>
                <View style={styles.modalField}>
                  <ThemedText style={styles.modalLabel}>Email Address *</ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={editRow.email}
                    onChangeText={(v) => setEditRow({ ...editRow, email: v })}
                    placeholder="Email Address"
                    placeholderTextColor={colors.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.modalField}>
                  <ThemedText style={styles.modalLabel}>Job Title</ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={editRow.jobTitle}
                    onChangeText={(v) => setEditRow({ ...editRow, jobTitle: v })}
                    placeholder="Job Title"
                    placeholderTextColor={colors.secondaryText}
                  />
                </View>
                <View style={styles.modalField}>
                  <ThemedText style={styles.modalLabel}>Department</ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={editRow.department}
                    onChangeText={(v) => setEditRow({ ...editRow, department: v })}
                    placeholder="Department"
                    placeholderTextColor={colors.secondaryText}
                  />
                </View>
                <View style={styles.modalField}>
                  <ThemedText style={styles.modalLabel}>Staff ID</ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={editRow.employeeId}
                    onChangeText={(v) => setEditRow({ ...editRow, employeeId: v })}
                    placeholder="Staff ID (optional)"
                    placeholderTextColor={colors.secondaryText}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.modalField}>
                  <ThemedText style={styles.modalLabel}>Phone Number</ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={editRow.phoneNumber}
                    onChangeText={(v) => setEditRow({ ...editRow, phoneNumber: v })}
                    placeholder="Phone Number (optional)"
                    placeholderTextColor={colors.secondaryText}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
            )}
          </ScrollView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  contentLarge: { alignItems: 'center' },
  panel: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 18,
  },

  // Hero
  heroRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.4 },
  heroSub: { marginTop: 4, lineHeight: 20, fontSize: 13 },

  // Template
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  templateBtnText: { fontSize: 14, fontWeight: '600' as const },

  // Upload
  section: { gap: 10 },
  uploadZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  uploadPlaceholder: { alignItems: 'center', gap: 10 },
  uploadIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: { fontSize: 16 },
  uploadFormats: { fontSize: 12 },

  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: { flex: 1, gap: 2 },
  fileNameText: { fontSize: 15, fontWeight: '600' as const },
  fileCount: { fontSize: 12 },
  changeBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 13, fontWeight: '600' as const },
  statDivider: { width: 1, height: 16, backgroundColor: 'rgba(128,128,128,0.2)' },

  // Errors
  errorsCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  errorsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorsTitle: { fontSize: 14, fontWeight: '700' as const, color: '#DC2626' },
  errorItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorText: { fontSize: 12, color: '#DC2626', flex: 1 },

  // Preview
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: { fontSize: 15 },
  previewTable: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tableCell: { justifyContent: 'center' },
  nameCol: { flex: 2.5 },
  emailCol: { flex: 2.5 },
  jobCol: { flex: 2 },
  deptCol: { flex: 1.8 },
  editCol: { width: 32, alignItems: 'center' },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
  },

  // Import button
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    paddingVertical: 16,
  },
  importButtonText: { color: 'white', fontSize: 16, fontWeight: '700' as const },
  importingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Progress
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', borderRadius: 2 },

  // Results
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  resultTitle: { fontSize: 17, fontWeight: '700' as const },
  resultSummary: { flexDirection: 'row', gap: 10 },
  resultBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    padding: 14,
  },
  resultBadgeValue: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
  resultBadgeLabel: { fontSize: 11, fontWeight: '600' as const },
  resultList: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resultName: { fontSize: 13, fontWeight: '700' as const },
  resultMsg: { fontSize: 11, marginTop: 2 },
  doneButton: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: { fontSize: 15, fontWeight: '700' as const },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16 },
  modalContent: { padding: 20, gap: 20 },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 14, fontWeight: '600' as const },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
  },
});
