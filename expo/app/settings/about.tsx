import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Info, Mail, Shield, FileText, Smartphone } from 'lucide-react-native';
import ThemedView from '@/components/ThemedView';
import ThemedText from '@/components/ThemedText';
import Colors from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';

const APP_VERSION = '2.0.0';
const BUILD_NUMBER = '3';
const SUPPORT_EMAIL = 'support@absenceflow.app';
const PRIVACY_POLICY_URL = 'https://absenceflow.app/privacy';

export default function AboutScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];

  const handleEmailSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL(PRIVACY_POLICY_URL);
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <Stack.Screen options={{ title: 'Support & About' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* App Info */}
        <View style={styles.section}>
          <View
            style={[
              styles.heroCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Smartphone size={36} color={colors.primary} />
            <ThemedText size="xlarge" weight="bold">
              AbsenceFlow
            </ThemedText>
            <ThemedText variant="secondary">
              Staff absence tracking made simple
            </ThemedText>
          </View>
        </View>

        {/* Version Info */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            App Information
          </ThemedText>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Info size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">App Version</ThemedText>
                <ThemedText variant="secondary" size="small">
                  {APP_VERSION}
                </ThemedText>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Info size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Build Number</ThemedText>
                <ThemedText variant="secondary" size="small">
                  {BUILD_NUMBER}
                </ThemedText>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={handleEmailSupport}
          >
            <View style={styles.settingContent}>
              <Mail size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Support Email</ThemedText>
                <ThemedText variant="secondary" size="small">
                  {SUPPORT_EMAIL}
                </ThemedText>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={handlePrivacyPolicy}
          >
            <View style={styles.settingContent}>
              <Shield size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Privacy Policy</ThemedText>
                <ThemedText variant="secondary" size="small">
                  View our privacy policy online
                </ThemedText>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Release Notes */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Release Notes
          </ThemedText>

          <View
            style={[
              styles.notesCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <FileText size={20} color={colors.primary} />
            <View style={styles.notesContent}>
              <ThemedText weight="semibold">Version {APP_VERSION}</ThemedText>
              <ThemedText variant="secondary" size="small" style={styles.notesText}>
                {'\u2022'} Dashboard summary cards with absence counts{'\n'}
                {'\u2022'} Calendar dot indicators for staffing levels{'\n'}
                {'\u2022'} New absence categories: Sickness, Unpaid Leave, Other{'\n'}
                {'\u2022'} CSV export for absence records{'\n'}
                {'\u2022'} Absence filters (All, Current, Upcoming, Completed){'\n'}
                {'\u2022'} Duplicate absence detection{'\n'}
                {'\u2022'} Improved empty states throughout the app{'\n'}
                {'\u2022'} Success messages after creating and editing records
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText
            variant="secondary"
            size="small"
            style={styles.footerText}
          >
            AbsenceFlow is designed for small teams to track staff absences
            simply and efficiently. All data is stored locally on your device.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingTextContainer: {
    marginLeft: 16,
  },
  notesCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  notesContent: {
    flex: 1,
    gap: 6,
  },
  notesText: {
    lineHeight: 20,
  },
  footer: {
    marginTop: 8,
    alignItems: 'center',
    padding: 16,
  },
  footerText: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
