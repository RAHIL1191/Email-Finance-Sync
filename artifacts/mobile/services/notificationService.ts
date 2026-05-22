import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const NOTIF_IDS_KEY = "@fintrack/bill_notif_ids";
const NOTIF_PREFS_KEY = "notification_prefs";
const REMINDER_TIME_KEY = "@fintrack/reminder_time";

// ─── Local Bill type (mirrors AppContext.Bill — avoids circular import) ────────

interface BillLike {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
  remindDays?: string;
}

// ─── Lazy expo-notifications import + handler init ────────────────────────────

let _notifModule: typeof import("expo-notifications") | null = null;
let _handlerSet = false;

async function getNotif() {
  if (Platform.OS === "web") return null;
  if (!_notifModule) {
    try {
      _notifModule = await import("expo-notifications");
      if (!_handlerSet) {
        _handlerSet = true;
        _notifModule.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
      }
    } catch {
      _notifModule = null;
    }
  }
  return _notifModule;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillNotifIds {
  upcoming?: string;
  overdue?: string;
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  const N = await getNotif();
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await N.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

// ─── Reminder time ────────────────────────────────────────────────────────────

export async function getReminderTime(): Promise<{ hour: number; minute: number }> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_TIME_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { hour: 8, minute: 11 };
}

export async function saveReminderTime(hour: number, minute: number): Promise<void> {
  await AsyncStorage.setItem(REMINDER_TIME_KEY, JSON.stringify({ hour, minute }));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getStoredIds(): Promise<Record<string, BillNotifIds>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_IDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveStoredIds(ids: Record<string, BillNotifIds>): Promise<void> {
  await AsyncStorage.setItem(NOTIF_IDS_KEY, JSON.stringify(ids));
}

async function getPrefs(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Returns a Date for `offsetDays` relative to `dueDateStr` at `hour:minute`, or null if it's in the past. */
function buildTriggerDate(
  dueDateStr: string,
  offsetDays: number,
  hour: number,
  minute: number
): Date | null {
  const trigger = new Date(dueDateStr);
  trigger.setDate(trigger.getDate() + offsetDays);
  trigger.setHours(hour, minute, 0, 0);
  return trigger.getTime() > Date.now() ? trigger : null;
}

async function cancelIds(ids: BillNotifIds): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  if (ids.upcoming) await N.cancelScheduledNotificationAsync(ids.upcoming).catch(() => {});
  if (ids.overdue)  await N.cancelScheduledNotificationAsync(ids.overdue).catch(() => {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Schedule upcoming (3 days before) and/or overdue (1 day after) notifications for a bill. */
export async function scheduleBillNotifications(bill: BillLike): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  if (bill.isPaid) { await cancelBillNotifications(bill.id); return; }

  try {
    const prefs = await getPrefs();
    const { hour, minute } = await getReminderTime();
    const ids = await getStoredIds();
    const billIds: BillNotifIds = {};

    if (ids[bill.id]) await cancelIds(ids[bill.id]);

    // Upcoming: remindDays before due date (default 3)
    // Handles both numeric strings ("3") and text format ("5 days before", "1 week before", "2 weeks before")
    const parseRemindDays = (val?: string): number => {
      if (!val) return 3;
      const weeksMatch = val.match(/(\d+)\s+weeks?/i);
      if (weeksMatch) return parseInt(weeksMatch[1]) * 7;
      const daysMatch = val.match(/(\d+)/);
      return daysMatch ? Math.max(1, parseInt(daysMatch[1])) : 3;
    };
    const remindOffset = parseRemindDays(bill.remindDays);
    if (prefs.bill_upcoming !== false) {
      const triggerDate = buildTriggerDate(bill.dueDate, -remindOffset, hour, minute);
      if (triggerDate) {
        const id = await N.scheduleNotificationAsync({
          content: {
            title: "📅 Bill Due Soon",
            body: `${bill.title} — $${bill.amount.toFixed(2)} is due in ${remindOffset} day${remindOffset !== 1 ? "s" : ""}.`,
            sound: true,
            data: { billId: bill.id, type: "upcoming" },
          },
          trigger: { date: triggerDate } as any,
        });
        billIds.upcoming = id;
      }
    }

    // Overdue: 1 day after due date
    if (prefs.bill_overdue !== false) {
      const triggerDate = buildTriggerDate(bill.dueDate, 1, hour, minute);
      if (triggerDate) {
        const id = await N.scheduleNotificationAsync({
          content: {
            title: "⚠️ Bill Overdue",
            body: `${bill.title} — $${bill.amount.toFixed(2)} was due yesterday. Please pay now.`,
            sound: true,
            data: { billId: bill.id, type: "overdue" },
          },
          trigger: { date: triggerDate } as any,
        });
        billIds.overdue = id;
      }
    }

    ids[bill.id] = billIds;
    await saveStoredIds(ids);
  } catch {}
}

/** Cancel all scheduled notifications for a specific bill. */
export async function cancelBillNotifications(billId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const ids = await getStoredIds();
    if (!ids[billId]) return;
    await cancelIds(ids[billId]);
    delete ids[billId];
    await saveStoredIds(ids);
  } catch {}
}

/** Reschedule all bills — requests permission if not yet granted (use from Notifications screen). */
export async function rescheduleAllBillNotifications(bills: BillLike[]): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    for (const bill of bills) {
      if (!bill.isPaid) await scheduleBillNotifications(bill);
      else await cancelBillNotifications(bill.id);
    }
  } catch {}
}

// ─── Task notifications ───────────────────────────────────────────────────────

interface TaskLike { id: string; title: string; reminderDate: string; notes?: string; }

/** Schedule a one-time reminder notification for a task. */
export async function scheduleTaskReminder(task: TaskLike): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  try {
    const triggerDate = new Date(task.reminderDate);
    if (triggerDate.getTime() <= Date.now()) return;
    await N.cancelScheduledNotificationAsync(`task-${task.id}`).catch(() => {});
    await N.scheduleNotificationAsync({
      identifier: `task-${task.id}`,
      content: {
        title: `⏰ Task Reminder: ${task.title}`,
        body: task.notes || "Don't forget your upcoming task!",
        sound: true,
        data: { taskId: task.id, type: "task" },
      },
      trigger: { date: triggerDate } as any,
    });
  } catch {}
}

/** Cancel a scheduled task reminder. */
export async function cancelTaskReminder(taskId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const N = await getNotif();
  if (!N) return;
  try { await N.cancelScheduledNotificationAsync(`task-${taskId}`).catch(() => {}); } catch {}
}

/** Register this device's Expo push token with the api-server for server-initiated notifications. */
export async function registerPushTokenWithServer(
  apiBase: string,
  householdId: string,
  deviceId: string
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const N = await getNotif();
    if (!N) return;
    const { status } = await N.getPermissionsAsync();
    if (status !== "granted") return;
    const tokenData = await N.getExpoPushTokenAsync();
    const token = tokenData.data;
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await fetch(`${apiBase}/api/push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Household-ID": householdId,
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({ token, platform }),
    });
  } catch {}
}

/** Called on app init: reschedules only if permission already granted — no dialog at startup. */
export async function setupNotificationsOnInit(bills: BillLike[]): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const N = await getNotif();
    if (!N) return;
    const { status } = await N.getPermissionsAsync();
    if (status !== "granted") return;
    for (const bill of bills) {
      if (!bill.isPaid) await scheduleBillNotifications(bill);
      else await cancelBillNotifications(bill.id);
    }
  } catch {}
}
