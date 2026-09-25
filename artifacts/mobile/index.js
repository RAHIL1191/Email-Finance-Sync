import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'expo-router/entry';

// ─── Helper: Queue a pending action for the React state bridge ───────────────
// When the app is killed, we can't call updateTask/markBillPaid directly.
// Instead, we queue the action and AppContext consumes it on next init/foreground.

const PENDING_ACTIONS_KEY = '@fintrack/pending_notif_actions';

async function queueNotifAction(action) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    const actions = raw ? JSON.parse(raw) : [];
    const filtered = actions.filter(
      (a) => !(a.entityId === action.entityId && a.entityType === action.entityType && a.action === action.action)
    );
    filtered.push(action);
    await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(filtered));
    console.log(`[Notifee Background] Queued ${action.action} for ${action.entityType} ${action.entityId}`);
  } catch (err) {
    console.error('[Notifee Background] Error queuing action:', err);
  }
}

// ─── Register Notifee background headless event handler ──────────────────────
// This runs when the app is backgrounded or completely terminated.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  if (!notification) return;

  const entityId = notification.data?.entityId;
  const entityType = notification.data?.type;
  const entitySubtype = notification.data?.subtype;
  const isFintrack = notification.data?.app === 'fintrack';

  // ── Delivery Guard: auto-dismiss if entity is already completed/deleted ──
  // This prevents stale notifications from appearing when the entity state
  // changed between scheduling and trigger time.
  if (type === EventType.DELIVERED && isFintrack && entityId && entityType) {
    try {
      const storageKey = entityType === 'task' ? '@fintrack/tasks' : '@fintrack/bills';
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        const items = JSON.parse(raw);
        const entity = items.find((i) => i.id === entityId);
        const shouldDismiss =
          !entity ||
          (entityType === 'task' && entity.isCompleted) ||
          (entityType === 'bill' && entity.isPaid);
        if (shouldDismiss) {
          await notifee.cancelNotification(notification.id);
          console.log(`[Notifee Background] Auto-dismissed stale ${entityType} notification for ${entityId}`);
          return;
        }
      }
    } catch (err) {
      console.error('[Notifee Background] Error in delivery guard:', err);
    }
  }

  if (type === EventType.ACTION_PRESS && entityId) {
    // ── Complete Action ───────────────────────────────────────────────────────
    if (pressAction?.id === 'complete') {
      try {
        await notifee.cancelNotification(notification.id);

        // Write directly to AsyncStorage for immediate persistence
        if (entityType === 'task') {
          const rawTasks = await AsyncStorage.getItem('@fintrack/tasks');
          if (rawTasks) {
            const tasks = JSON.parse(rawTasks);
            const updated = tasks.map((t) =>
              t.id === entityId ? { ...t, isCompleted: true, updatedAt: new Date().toISOString() } : t
            );
            await AsyncStorage.setItem('@fintrack/tasks', JSON.stringify(updated));
            console.log(`[Notifee Background] Task ${entityId} marked completed in AsyncStorage.`);
          }
        } else if (entityType === 'bill') {
          const rawBills = await AsyncStorage.getItem('@fintrack/bills');
          if (rawBills) {
            const bills = JSON.parse(rawBills);
            const updated = bills.map((b) =>
              b.id === entityId ? { ...b, isPaid: true, updatedAt: new Date().toISOString() } : b
            );
            await AsyncStorage.setItem('@fintrack/bills', JSON.stringify(updated));
            console.log(`[Notifee Background] Bill ${entityId} marked paid in AsyncStorage.`);
          }
        }

        // Also queue action for React state bridge (so AppContext picks it up on resume)
        await queueNotifAction({
          action: 'complete',
          entityType,
          entityId,
          timestamp: new Date().toISOString(),
        });
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

        // Dynamically import the service to schedule the snoozed reminder
        const { scheduleNotifeeReminder } = await import('./services/notifeeService');
        await scheduleNotifeeReminder(
          entityId,
          notification.title || 'Snoozed Reminder',
          notification.body || '',
          snoozeTime,
          entityType,
          entitySubtype
        );

        // Queue snooze action for React state bridge
        await queueNotifAction({
          action: 'snooze',
          entityType,
          entityId,
          snoozeDate: snoozeTime.toISOString(),
          title: notification.title,
          body: notification.body,
          timestamp: new Date().toISOString(),
        });

        console.log(`[Notifee Background] Snoozed entity ${entityId} (${entitySubtype || 'default'}) rescheduled for ${snoozeTime.toISOString()}`);
      } catch (err) {
        console.error('[Notifee Background] Error snoozing entity:', err);
      }
    }
  }
});
