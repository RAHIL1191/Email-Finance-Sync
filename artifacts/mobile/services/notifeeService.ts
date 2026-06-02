import notifee, { AndroidImportance, TriggerType, AndroidCategory, AndroidNotificationSetting } from '@notifee/react-native';
import { Platform } from 'react-native';

/** Initializes the high-priority heads-up reminder channel */
export async function initializeNotifeeChannels(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await notifee.createChannel({
      id: 'fintrack-reminders',
      name: 'Task & Bill Reminders',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      vibrationPattern: [300, 500, 300, 500], // vibrate 300ms, pause 500ms, repeat
    });
    console.log('[NotifeeService] High-priority reminders channel created successfully.');
  } catch (err) {
    console.error('[NotifeeService] Error creating channel:', err);
  }
}

/** Schedules an exact alarm notification with Snooze and Complete actions */
export async function scheduleNotifeeReminder(
  id: string,
  title: string,
  body: string,
  dueDate: Date,
  type: 'task' | 'bill',
  subtype?: string
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    // 1. Android 12+ requires exact alarm permissions
    if (Platform.OS === 'android') {
      const settings = await notifee.getNotificationSettings();
      if (settings.android.alarm === AndroidNotificationSetting.DISABLED) {
        console.warn('[NotifeeService] Exact alarms are disabled! Prompting user to enable settings.');
        await notifee.openAlarmPermissionSettings();
        return;
      }
    }

    const notificationId = subtype ? `${type}-${subtype}-${id}` : `${type}-${id}`;

    // Cancel any existing reminder for this specific entity
    await notifee.cancelNotification(notificationId).catch(() => {});

    console.log(`[NotifeeService] Scheduling ${type} reminder (${subtype || 'default'}) for ${dueDate.toISOString()} with ID: ${notificationId}`);

    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: title,
        body: body || (type === 'task' ? "Don't forget your upcoming task!" : "A bill is due for payment."),
        android: {
          channelId: 'fintrack-reminders',
          category: AndroidCategory.ALARM, // Time-sensitive alarm priority
          importance: AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [300, 500, 300, 500],
          pressAction: { id: 'default' },
          ongoing: true, // Persistent notification (cannot be swiped away)
          autoCancel: false, // Remains in tray even if clicked/tapped
          actions: [
            {
              title: 'Complete',
              pressAction: { id: 'complete' },
            },
            {
              title: 'Snooze',
              pressAction: { id: 'snooze', launchActivity: 'default' },
            },
          ],
        },
        data: {
          entityId: id,
          type: type,
          app: 'fintrack',
          subtype: subtype || '',
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: dueDate.getTime(), // Exact millisecond timing
      }
    );
  } catch (err) {
    console.error('[NotifeeService] Error scheduling notification:', err);
  }
}

/** Cancels a scheduled reminder */
export async function cancelNotifeeReminder(id: string, type: 'task' | 'bill', subtype?: string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const notificationId = subtype ? `${type}-${subtype}-${id}` : `${type}-${id}`;
    await notifee.cancelNotification(notificationId);
    console.log(`[NotifeeService] Cancelled scheduled reminder: ${notificationId}`);
  } catch (err) {
    console.error('[NotifeeService] Error cancelling notification:', err);
  }
}
