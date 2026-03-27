import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') {
    console.log('Notifications not available on web');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return false;
  }
  
  return true;
}

export async function scheduleDailyAbsenceNotification() {
  if (Platform.OS === 'web') {
    console.log('Notifications not available on web');
    return;
  }

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daily Absence Check',
        body: 'Checking for absences...',
        data: { type: 'daily_absence_check' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    });
    
    console.log('Daily notification scheduled for 8:00 PM');
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
}

export function checkAndNotifyAbsences() {
  if (Platform.OS === 'web') {
    return;
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  const absenceStore = useAbsenceStore.getState();
  const staffStore = useStaffStore.getState();
  
  const todayAbsences = absenceStore.getAbsencesForDate(todayStr);
  const tomorrowAbsences = absenceStore.getAbsencesForDate(tomorrowStr);
  
  let title = '';
  let body = '';
  
  if (todayAbsences.length > 0 || tomorrowAbsences.length > 0) {
    title = '🚨 Absence Alert';
    
    const messages: string[] = [];
    
    if (todayAbsences.length > 0) {
      const names = todayAbsences.map(a => {
        const staff = staffStore.getStaffById(a.staffId);
        return staff ? staff.name : 'Unknown';
      }).join(', ');
      messages.push(`Today (${todayAbsences.length}): ${names}`);
    }
    
    if (tomorrowAbsences.length > 0) {
      const names = tomorrowAbsences.map(a => {
        const staff = staffStore.getStaffById(a.staffId);
        return staff ? staff.name : 'Unknown';
      }).join(', ');
      messages.push(`Tomorrow (${tomorrowAbsences.length}): ${names}`);
    }
    
    body = messages.join('\n');
  } else {
    title = '✅ No Absences';
    body = 'No staff absences for today or tomorrow.';
  }
  
  Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'absence_update' },
    },
    trigger: null,
  });
}

export async function initializeNotifications() {
  if (Platform.OS === 'web') {
    console.log('Notifications not available on web');
    return;
  }

  const hasPermission = await requestNotificationPermissions();
  
  if (hasPermission) {
    await scheduleDailyAbsenceNotification();
    
    Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
      if (notification.request.content.data?.type === 'daily_absence_check') {
        checkAndNotifyAbsences();
      }
    });
    
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification response:', response);
    });
  }
}
