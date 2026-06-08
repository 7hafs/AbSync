import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useColorScheme } from 'react-native';
import { CheckCircle2, Download, FileSpreadsheet, FileText, Upload, Users, XCircle, AlertTriangle } from 'lucide-react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useStaffStore from '@/store/useStaffStore';
import { StaffMember } from '@/types';

type ImportRow = {
  name: string;
  department: string;
  employeeId: string;
  email: string;
};

type ImportResult = {
  row: ImportRow;
  index: number;
  status: 'ok' | 'duplicate' | 'error' | 'skipped';
  message?: string;
};

const SUPPORTED_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

function parseCSV(content: string): ImportRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Detect header row
  const header = lines[0].toLowerCase();
  const hasHeader = header.includes('name') || header.includes('employee');

  const startIndex = hasHeader ? 1 : 0;
  const rows: ImportRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length === 0 || (cells.length === 1 && !cells[0].trim())) continue;

    rows.push({
      name: (cells[0] || '').trim(),
      department: (cells[1] || '').trim(),
      employeeId: (cells[2] || '').trim(),
      email: (cells[3] || '').trim(),
    });
  }

  return rows;
}

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
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export default function BulkImportScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;

  const { staff, addStaff } = useStaffStore();

  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [results, setResults] = useState<ImportResult[]>([]);
  const [imported, setImported] = useState(false);

  const handlePickFile = async () => {
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

      // Read file
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const rows = parseCSV(content);
      if (rows.length === 0) {
        Alert.alert('No data found', 'The file appears to be empty or has an unsupported format. Please use a CSV file with Name, Department, Employee ID, and Email columns.');
        return;
      }

      // Validate rows
      const invalidRows = rows.filter((r) => !r.name);
      if (invalidRows.length === rows.length) {
        Alert.alert('Missing names', 'No valid staff names found in the file. The first column must contain names.');
        return;
      }

      if (invalidRows.length > 0) {
        Alert.alert(
          'Some rows are missing names',
          `${invalidRows.length} row(s) have no name and will be skipped. The first column must contain the staff name.`
        );
      }

      setParsedRows(rows);
      setResults([]);
    } catch (err) {
      console.error('[BulkImport] File pick error:', err);
      Alert.alert('Import failed', 'Could not read the selected file. Please ensure it is a valid CSV file.');
    }
  };

  const handleImport = () => {
    if (parsedRows.length === 0) return;

    const importResults: ImportResult[] = [];
    let addedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let dupCount = 0;

    // Build lookup sets for dedup
    const existingNames = new Set(staff.map((s) => s.name.toLowerCase()));
    const existingIds = new Set(staff.filter((s) => s.employeeId).map((s) => s.employeeId!.toLowerCase()));
    const existingEmails = new Set(staff.filter((s) => s.email).map((s) => s.email!.toLowerCase()));

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];

      // Validate
      if (!row.name) {
        importResults.push({ row, index: i, status: 'error', message: 'Name is required' });
        errorCount++;
        continue;
      }

      // Check duplicates by name (case-insensitive)
      if (existingNames.has(row.name.toLowerCase())) {
        importResults.push({ row, index: i, status: 'duplicate', message: `"${row.name}" already exists` });
        dupCount++;
        continue;
      }

      // Check duplicate by employeeId
      if (row.employeeId && existingIds.has(row.employeeId.toLowerCase())) {
        importResults.push({ row, index: i, status: 'duplicate', message: `Employee ID "${row.employeeId}" is already used` });
        dupCount++;
        continue;
      }

      // Check duplicate by email
      if (row.email && existingEmails.has(row.email.toLowerCase())) {
        importResults.push({ row, index: i, status: 'duplicate', message: `Email "${row.email}" is already used` });
        dupCount++;
        continue;
      }

      // Create staff member
      const newMember: StaffMember = {
        id: `bulk-${Date.now()}-${i}`,
        name: row.name,
        department: row.department || undefined,
        employeeId: row.employeeId || undefined,
        email: row.email || undefined,
        active: true,
        createdAt: new Date().toISOString(),
      };

      addStaff(newMember);
      existingNames.add(row.name.toLowerCase());
      if (row.employeeId) existingIds.add(row.employeeId.toLowerCase());
      if (row.email) existingEmails.add(row.email.toLowerCase());

      importResults.push({ row, index: i, status: 'ok', message: 'Added successfully' });
      addedCount++;
    }

    setResults(importResults);
    setImported(true);

    const total = addedCount + skippedCount + errorCount + dupCount;
    Alert.alert(
      'Import Complete',
      `${addedCount} staff member(s) added.\n${dupCount} duplicate(s) skipped.\n${errorCount} error(s).\n\nImported staff are now available in Staff Management.`,
      [{ text: 'OK' }]
    );
  };

  const okCount = results.filter((r) => r.status === 'ok').length;
  const dupCount = results.filter((r) => r.status === 'duplicate').length;
  const errCount = results.filter((r) => r.status === 'error').length;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Bulk Import Staff' }} />

      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.contentLarge]}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 980 : 920 }]}>
          <View style={styles.heroRow}>
            <FileSpreadsheet size={32} color={colors.primary} />
            <View>
              <ThemedText style={styles.heroTitle}>Bulk Staff Upload</ThemedText>
              <ThemedText variant="secondary" style={styles.heroSub}>
                Import staff members from a CSV file. Duplicates are detected by name, employee ID, or email.
              </ThemedText>
            </View>
          </View>

          {/* File picker */}
          <View style={styles.section}>
            <ThemedText style={styles.label}>Upload CSV File</ThemedText>
            <ThemedText variant="secondary" style={styles.hint}>
              File should have columns: Name, Department, Employee ID, Email
            </ThemedText>
            <TouchableOpacity
              testID="bulk-import-pick-file"
              style={[styles.uploadZone, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={handlePickFile}
            >
              {fileName ? (
                <View style={styles.fileRow}>
                  <FileText size={20} color={colors.primary} />
                  <View style={styles.fileInfo}>
                    <ThemedText style={styles.fileNameText}>{fileName}</ThemedText>
                    <ThemedText variant="secondary" style={styles.fileCount}>
                      {parsedRows.length} staff record(s) found
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    onPress={handlePickFile}
                    style={[styles.changeBtn, { borderColor: colors.border }]}
                  >
                    <ThemedText style={{ color: colors.primary, fontWeight: '600' as const }}>Change</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <Upload size={28} color={colors.secondaryText} />
                  <ThemedText variant="secondary" style={styles.uploadText}>
                    Tap to select a CSV file
                  </ThemedText>
                  <ThemedText variant="secondary" style={styles.uploadFormats}>CSV supported</ThemedText>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Preview */}
          {parsedRows.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={styles.label}>
                Preview ({parsedRows.length} records)
              </ThemedText>
              <View style={[styles.previewTable, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={[styles.tableHeaderRow, { borderBottomColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
                  <ThemedText style={[styles.tableHeaderCell, styles.nameCol]}>Name</ThemedText>
                  <ThemedText style={[styles.tableHeaderCell, styles.deptCol]}>Department</ThemedText>
                  <ThemedText style={[styles.tableHeaderCell, styles.idCol]}>ID</ThemedText>
                  <ThemedText style={[styles.tableHeaderCell, styles.emailCol]}>Email</ThemedText>
                </View>
                <FlatList
                  data={parsedRows.slice(0, 15)}
                  keyExtractor={(_, idx) => `row-${idx}`}
                  scrollEnabled={false}
                  renderItem={({ item, index }) => (
                    <View
                      style={[
                        styles.tableRow,
                        { borderBottomColor: colors.border },
                        results.length > 0 && results[index]?.status === 'duplicate' && { backgroundColor: 'rgba(245, 158, 11, 0.08)' },
                        results.length > 0 && results[index]?.status === 'error' && { backgroundColor: 'rgba(220, 38, 38, 0.08)' },
                      ]}
                    >
                      <ThemedText style={[styles.tableCell, styles.nameCol]} numberOfLines={1}>{item.name || '—'}</ThemedText>
                      <ThemedText style={[styles.tableCell, styles.deptCol]} numberOfLines={1}>{item.department || '—'}</ThemedText>
                      <ThemedText style={[styles.tableCell, styles.idCol]} numberOfLines={1}>{item.employeeId || '—'}</ThemedText>
                      <ThemedText style={[styles.tableCell, styles.emailCol]} numberOfLines={1}>{item.email || '—'}</ThemedText>
                    </View>
                  )}
                />
                {parsedRows.length > 15 && (
                  <View style={styles.moreRows}>
                    <ThemedText variant="secondary">+ {parsedRows.length - 15} more records</ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Import button */}
          {parsedRows.length > 0 && !imported && (
            <TouchableOpacity
              testID="bulk-import-button"
              style={[styles.importButton, { backgroundColor: colors.primary }]}
              onPress={handleImport}
            >
              <Download size={18} color="white" />
              <ThemedText style={styles.importButtonText}>
                Import {parsedRows.length} Staff Member{parsedRows.length > 1 ? 's' : ''}
              </ThemedText>
            </TouchableOpacity>
          )}

          {/* Results */}
          {imported && results.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={styles.label}>Import Results</ThemedText>
              <View style={styles.resultSummary}>
                <View style={[styles.resultBadge, { backgroundColor: 'rgba(34, 197, 94, 0.12)' }]}>
                  <CheckCircle2 size={14} color="#22C55E" />
                  <ThemedText style={[styles.resultBadgeText, { color: '#22C55E' }]}>{okCount} added</ThemedText>
                </View>
                <View style={[styles.resultBadge, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                  <AlertTriangle size={14} color="#F59E0B" />
                  <ThemedText style={[styles.resultBadgeText, { color: '#F59E0B' }]}>{dupCount} skipped</ThemedText>
                </View>
                {errCount > 0 && (
                  <View style={[styles.resultBadge, { backgroundColor: 'rgba(220, 38, 38, 0.12)' }]}>
                    <XCircle size={14} color="#DC2626" />
                    <ThemedText style={[styles.resultBadgeText, { color: '#DC2626' }]}>{errCount} errors</ThemedText>
                  </View>
                )}
              </View>

              <View style={[styles.resultList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                {results
                  .filter((r) => r.status !== 'ok')
                  .map((r) => (
                    <View key={`result-${r.index}`} style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                      <View style={styles.resultRowLeft}>
                        {r.status === 'duplicate' ? (
                          <AlertTriangle size={14} color="#F59E0B" />
                        ) : (
                          <XCircle size={14} color="#DC2626" />
                        )}
                        <View>
                          <ThemedText style={styles.resultName}>{r.row.name || `Row ${r.index + 1}`}</ThemedText>
                          <ThemedText variant="secondary" style={styles.resultMsg}>{r.message}</ThemedText>
                        </View>
                      </View>
                    </View>
                  ))}
              </View>

              <TouchableOpacity
                testID="bulk-import-done"
                style={[styles.doneButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => router.back()}
              >
                <ThemedText style={styles.doneButtonText}>Done — View Staff</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  contentLarge: {
    alignItems: 'center',
  },
  panel: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 18,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  heroSub: {
    marginTop: 4,
    lineHeight: 20,
  },
  section: {
    gap: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
  },
  uploadZone: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  uploadPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  uploadFormats: {
    fontSize: 12,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileNameText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  fileCount: {
    fontSize: 12,
  },
  changeBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
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
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 13,
  },
  nameCol: {
    flex: 3,
  },
  deptCol: {
    flex: 2,
  },
  idCol: {
    flex: 1.5,
  },
  emailCol: {
    flex: 2.5,
  },
  moreRows: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 4,
  },
  importButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  resultSummary: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resultBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  resultList: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resultRowLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  resultName: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  resultMsg: {
    fontSize: 11,
    marginTop: 2,
  },
  doneButton: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
