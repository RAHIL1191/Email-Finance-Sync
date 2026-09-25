import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { parseLocalDate } from "@/hooks/useLocalDate";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskLike {
  id: string;
  title: string;
  dueDate: string;
  notes?: string;
  isCompleted: boolean;
  reminderEnabled: boolean;
  reminderDate?: string;
  reminderFrequency?: "once" | "daily" | "weekly" | "monthly";
}

interface BillLike {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
  remindDays?: string;
}

interface NotificationPrefs {
  task_reminders?: boolean;
  task_due?: boolean;
  bill_upcoming?: boolean;
  bill_overdue?: boolean;
  taskHour: number;
  taskMinute: number;
  billHour: number;
  billMinute: number;
}

interface DesiredNotification {
  id: string;
  entityId: string;
  title: string;
  body: string;
  trigger: Date;
  type: "task" | "bill";
  subtype?: string;
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const NOTIF_PREFS_KEY = "notification_prefs";
const REMINDER_TIME_KEY = "@fintrack/reminder_time";
const TASK_REMINDER_TIME_KEY = "@fintrack/task_reminder_time";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPrefs(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function getBillReminderTime(): Promise<{ hour: number; minute: number }> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_TIME_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { hour: 8, minute: 11 };
}

async function getTaskReminderTime(): Promise<{ hour: number; minute: number }> {
  try {
    const raw = await AsyncStorage.getItem(TASK_REMINDER_TIME_KEY);
    if (raw) {
      const { hour, minute } = JSON.parse(raw);
      if (typeof hour === "number" && typeof minute === "number") return { hour, minute };
    }
  } catch {}
  return { hour: 8, minute: 0 };
}

function buildTriggerDate(
  dueDateStr: string,
  offsetDays: number,
  hour: number,
  minute: number
): Date | null {
  const trigger = parseLocalDate(dueDateStr);
  trigger.setDate(trigger.getDate() + offsetDays);
  trigger.setHours(hour, minute, 0, 0);
  return trigger.getTime() > Date.now() ? trigger : null;
}

function parseRemindDays(val?: string): number {
  if (!val) return 3;
  const weeksMatch = val.match(/(\d+)\s+weeks?/i);
  if (weeksMatch) return parseInt(weeksMatch[1]) * 7;
  const daysMatch = val.match(/(\d+)/);
  return daysMatch ? Math.max(1, parseInt(daysMatch[1])) : 3;
}

// ─── Core Reconciler ──────────────────────────────────────────────────────────

/**
 * The Notification Reconciler follows a "desired state" pattern:
 *
 * 1. Read current entities (tasks, bills) from the passed arrays
 * 2. Compute the SET of notifications that SHOULD exist
 * 3. Get the SET of notifications that DO exist (from Notifee)
 * 4. Diff: cancel extras, schedule missing ones
 *
 * This is self-healing: if anything gets out of sync,
 * the next reconciliation fixes it automatically.
 */
export async function reconcileNotifications(
  tasks: TaskLike[],
  bills: BillLike[]
): Promise<{ scheduled: number; cancelled: number }> {
  if (Platform.OS === "web") return { scheduled: 0, cancelled: 0 };

  try {
    const prefs = await getPrefs();
    const billTime = await getBillReminderTime();
    const taskTime = await getTaskReminderTime();

    // ── 1. Build desired notification set ──────────────────────────────────

    const desired = new Map<string, DesiredNotification>();

    // Tasks
    for (const task of tasks) {
      if (task.isCompleted) continue; // ← Single check eliminates ALL ghost task notifications

      // Due date notification
      if (prefs.task_due !== false) {
        const triggerDate = buildTriggerDate(task.dueDate, 0, taskTime.hour, taskTime.minute);
        if (triggerDate) {
          const notifId = `task-due-${task.id}`;
          desired.set(notifId, {
            id: notifId,
            entityId: task.id,
            title: `📋 Task Due Today: ${task.title}`,
            body: task.notes || "This task is due today.",
            trigger: triggerDate,
            type: "task",
            subtype: "due",
          });
        }
      }

      // Reminder notification
      if (task.reminderEnabled && task.reminderDate && prefs.task_reminders !== false) {
        const triggerDate = new Date(task.reminderDate);
        triggerDate.setSeconds(0, 0);
        if (triggerDate.getTime() > Date.now()) {
          const notifId = `task-${task.id}`;
          desired.set(notifId, {
            id: notifId,
            entityId: task.id,
            title: `⏰ Task Reminder: ${task.title}`,
            body: task.notes || "Don't forget your upcoming task!",
            trigger: triggerDate,
            type: "task",
          });
        }
      }
    }

    // Bills
    for (const bill of bills) {
      if (bill.isPaid) continue; // ← Single check eliminates ALL ghost bill notifications

      const remindOffset = parseRemindDays(bill.remindDays);

      // Upcoming notification
      if (prefs.bill_upcoming !== false) {
        const triggerDate = buildTriggerDate(bill.dueDate, -remindOffset, billTime.hour, billTime.minute);
        if (triggerDate) {
          const notifId = `bill-upcoming-${bill.id}`;
          desired.set(notifId, {
            id: notifId,
            entityId: bill.id,
            title: "📅 Bill Due Soon",
            body: `${bill.title} — $${bill.amount.toFixed(2)} is due in ${remindOffset} day${remindOffset !== 1 ? "s" : ""}.`,
            trigger: triggerDate,
            type: "bill",
            subtype: "upcoming",
          });
        }
      }

      // Overdue notification
      if (prefs.bill_overdue !== false) {
        const triggerDate = buildTriggerDate(bill.dueDate, 1, billTime.hour, billTime.minute);
        if (triggerDate) {
          const notifId = `bill-overdue-${bill.id}`;
          desired.set(notifId, {
            id: notifId,
            entityId: bill.id,
            title: "⚠️ Bill Overdue",
            body: `${bill.title} — $${bill.amount.toFixed(2)} was due yesterday. Please pay now.`,
            trigger: triggerDate,
            type: "bill",
            subtype: "overdue",
          });
        }
      }
    }

    // ── 2. Get currently scheduled Notifee trigger IDs ─────────────────────

    const notifee = (await import("@notifee/react-native")).default;
    const scheduledIds = await notifee.getTriggerNotificationIds();

    // Only manage our own notifications (task-* and bill-*)
    const managedScheduledIds = new Set(
      scheduledIds.filter((id) => id.startsWith("task-") || id.startsWith("bill-"))
    );

    // ── 3. Diff and apply ─────────────────────────────────────────────────

    const { scheduleNotifeeReminder, cancelNotifeeReminder } = await import("./notifeeService");

    let scheduledCount = 0;
    let cancelledCount = 0;

    // Cancel notifications that shouldn't exist
    for (const id of managedScheduledIds) {
      if (!desired.has(id)) {
        await notifee.cancelNotification(id).catch(() => {});
        cancelledCount++;
      }
    }

    // Schedule notifications that are missing
    for (const [id, notif] of desired) {
      if (!managedScheduledIds.has(id)) {
        await scheduleNotifeeReminder(
          notif.entityId,
          notif.title,
          notif.body,
          notif.trigger,
          notif.type,
          notif.subtype
        );
        scheduledCount++;
      }
    }

    if (scheduledCount > 0 || cancelledCount > 0) {
      console.log(
        `[Reconciler] Reconciled: scheduled=${scheduledCount}, cancelled=${cancelledCount}, desired=${desired.size}, existing=${managedScheduledIds.size}`
      );
    }

    return { scheduled: scheduledCount, cancelled: cancelledCount };
  } catch (err) {
    console.error("[Reconciler] Error during reconciliation:", err);
    return { scheduled: 0, cancelled: 0 };
  }
}

/**
 * Quick cleanup: cancel ALL managed notifications.
 * Use sparingly — e.g., on full data reset.
 */
export async function cancelAllManagedNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const notifee = (await import("@notifee/react-native")).default;
    const scheduledIds = await notifee.getTriggerNotificationIds();
    const managed = scheduledIds.filter((id) => id.startsWith("task-") || id.startsWith("bill-"));
    for (const id of managed) {
      await notifee.cancelNotification(id).catch(() => {});
    }
    console.log(`[Reconciler] Cancelled all ${managed.length} managed notifications`);
  } catch (err) {
    console.error("[Reconciler] Error cancelling all notifications:", err);
  }
}
