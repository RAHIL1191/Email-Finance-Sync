import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'expo-router/entry';

// Register Notifee background headless event handler.
// This runs when the app is backgrounded or completely terminated.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  if (!notification) return;

  const entityId = notification.data?.entityId;
  const entityType = notification.data?.type;
  const entitySubtype = notification.data?.subtype;

  if (type === EventType.ACTION_PRESS && entityId) {
    // ── Complete Action ───────────────────────────────────────────────────────
    if (pressAction?.id === 'complete') {
      try {
        await notifee.cancelNotification(notification.id);

        if (entityType === 'task') {
          const rawTasks = await AsyncStorage.getItem('@fintrack/tasks');
          if (rawTasks) {
            const tasks = JSON.parse(rawTasks);
            const updated = tasks.map((t) =>
              t.id === entityId ? { ...t, isCompleted: true, updatedAt: new Date().toISOString() } : t
            );
            await AsyncStorage.setItem('@fintrack/tasks', JSON.stringify(updated));
            console.log(`[Notifee Background] Task ${entityId} marked completed.`);
          }
        } else if (entityType === 'bill') {
          const rawBills = await AsyncStorage.getItem('@fintrack/bills');
          if (rawBills) {
            const bills = JSON.parse(rawBills);
            const updated = bills.map((b) =>
              b.id === entityId ? { ...b, isPaid: true, updatedAt: new Date().toISOString() } : b
            );
            await AsyncStorage.setItem('@fintrack/bills', JSON.stringify(updated));
            console.log(`[Notifee Background] Bill ${entityId} marked paid.`);
          }
        }
      } catch (err) {
        console.error('[Notifee Background] Error completing entity:', err);
      }
    }

    // ── Snooze Action ─────────────────────────────────────────────────────────
    if (pressAction?.id === 'snooze') {
      try {
        await notifee.cancelNotification(notification.id);

        // Calculate snooze date (10 minutes in the future)
        const snoozeTime = new Date(Date.now() + 10 * 60 * 1000);

        // Dynamically import the service to schedule the snoonzed reminder
        const { scheduleNotifeeReminder } = await import('./services/notifeeService');
        await scheduleNotifeeReminder(
          entityId,
          notification.title || 'Snoozed Reminder',
          notification.body || '',
          snoozeTime,
          entityType,
          entitySubtype
        );
        console.log(`[Notifee Background] Snoozed entity ${entityId} (${entitySubtype || 'default'}) rescheduled for ${snoozeTime.toISOString()}`);
      } catch (err) {
        console.error('[Notifee Background] Error snoozing entity:', err);
      }
    }
  }
});
