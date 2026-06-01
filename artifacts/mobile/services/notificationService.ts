import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { parseLocalDate, toLocalYMD } from "@/hooks/useLocalDate";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const NOTIF_IDS_KEY = "@fintrack/bill_notif_ids";
const NOTIF_PREFS_KEY = "notification_prefs";
const REMINDER_TIME_KEY = "@fintrack/reminder_time";
const TASK_DUE_IDS_KEY = "@fintrack/task_due_notif_ids";
const TASK_REMINDER_TIME_KEY = "@fintrack/task_reminder_time";
const BUDGET_NOTIF_FIRED_KEY = "@fintrack/budget_notif_fired";

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

async function getNotif() {
  if (Platform.OS === "web") return null;
  if (!_notifModule) {
    try {
      _notifModule = await import("expo-notifications");
      // NOTE: setNotificationHandler is registered at module-scope in _layout.tsx
      // so notifications display correctly even on cold-starts.
      // Channel creation is also handled there for Android.
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

interface TaskDueLike { id: string; title: string; dueDate: string; notes?: string; }

interface BudgetLike {
  id: string;
  name: string;
  amount: number;
  category?: string;
  type: "expense" | "income";
  period: "weekly" | "monthly" | "yearly";
  alertPct?: number;
}

interface TxLike {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
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

export async function getTaskReminderTime(): Promise<{ hour: number; minute: number }> {
  try {
    const raw = await AsyncStorage.getItem(TASK_REMINDER_TIME_KEY);
    if (raw) {
      const { hour, minute } = JSON.parse(raw);
      if (typeof hour === "number" && typeof minute === "number") return { hour, minute };
    }
  } catch {}
  return { hour: 8, minute: 0 };
}

export async function saveTaskReminderTime(hour: number, minute: number): Promise<void> {
  await AsyncStorage.setItem(TASK_REMINDER_TIME_KEY, JSON.stringify({ hour, minute }));
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
  const trigger = parseLocalDate(dueDateStr);
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

async function getTaskDueIds(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(TASK_DUE_IDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveTaskDueIds(ids: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(TASK_DUE_IDS_KEY, JSON.stringify(ids));
}

async function getBudgetFiredMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(BUDGET_NOTIF_FIRED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveBudgetFiredMap(m: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(BUDGET_NOTIF_FIRED_KEY, JSON.stringify(m));
}

function getPeriodKey(period: string): string {
  const now = new Date();
  if (period === "monthly") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (period === "weekly") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return `${d.getFullYear()}-W${toLocalYMD(d)}`;
  }
  return `${now.getFullYear()}`;
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  if (period === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "weekly") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
  return new Date(now.getFullYear(), 0, 1);
}

// ─── Public API ───────────────────────────────────────────────────────────────

import { scheduleNotifeeReminder, cancelNotifeeReminder } from "./notifeeService";

// Helper to safely fetch currently scheduled trigger IDs from Notifee without web runtime issues
async function getNotifeeScheduledIds(): Promise<Set<string>> {
  if (Platform.OS === "web") return new Set();
  try {
    const notifee = (await import("@notifee/react-native")).default;
    const ids = await notifee.getTriggerNotificationIds();
    return new Set(ids);
  } catch {
    return new Set();
  }
}

async function cancelIdsForBill(billId: string): Promise<void> {
  await cancelNotifeeReminder(billId, "bill", "upcoming").catch(() => {});
  await cancelNotifeeReminder(billId, "bill", "overdue").catch(() => {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Schedule upcoming (3 days before) and/or overdue (1 day after) notifications for a bill. */
export async function scheduleBillNotifications(bill: BillLike): Promise<void> {
  if (Platform.OS === "web") return;
  if (bill.isPaid) { await cancelBillNotifications(bill.id); return; }

  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const prefs = await getPrefs();
    const { hour, minute } = await getReminderTime();
    const ids = await getStoredIds();
    const billIds: BillNotifIds = {};

    await cancelIdsForBill(bill.id);

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
        await scheduleNotifeeReminder(
          bill.id,
          "📅 Bill Due Soon",
          `${bill.title} — $${bill.amount.toFixed(2)} is due in ${remindOffset} day${remindOffset !== 1 ? "s" : ""}.`,
          triggerDate,
          "bill",
          "upcoming"
        );
        billIds.upcoming = `bill-upcoming-${bill.id}`;
      }
    }

    // Overdue: 1 day after due date
    if (prefs.bill_overdue !== false) {
      const triggerDate = buildTriggerDate(bill.dueDate, 1, hour, minute);
      if (triggerDate) {
        await scheduleNotifeeReminder(
          bill.id,
          "⚠️ Bill Overdue",
          `${bill.title} — $${bill.amount.toFixed(2)} was due yesterday. Please pay now.`,
          triggerDate,
          "bill",
          "overdue"
        );
        billIds.overdue = `bill-overdue-${bill.id}`;
      }
    }

    ids[bill.id] = billIds;
    await saveStoredIds(ids);
  } catch (err) {
    console.error("[NotificationService] Error scheduling bill notifications:", err);
  }
}

/** Cancel all scheduled notifications for a specific bill. */
export async function cancelBillNotifications(billId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const ids = await getStoredIds();
    await cancelIdsForBill(billId);
    if (ids[billId]) {
      delete ids[billId];
      await saveStoredIds(ids);
    }
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

interface TaskLike { id: string; title: string; reminderDate: string; reminderFrequency?: "once" | "daily" | "weekly" | "monthly"; notes?: string; }

/** Schedule a one-time reminder notification for a task. */
export async function scheduleTaskReminder(task: TaskLike): Promise<void> {
  console.log("[NotificationService] scheduleTaskReminder CALLED for task:", task.title, "frequency:", task.reminderFrequency);
  if (Platform.OS === "web") return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) {
      console.log("[NotificationService] scheduleTaskReminder FAILED: Permission not granted.");
      return;
    }
    const prefs = await getPrefs();
    console.log("[NotificationService] Current notification preferences:", prefs);
    if (prefs.task_reminders === false) {
      console.log("[NotificationService] scheduleTaskReminder SKIPPED: task_reminders pref is explicitly false.");
      await cancelNotifeeReminder(task.id, "task").catch(() => {});
      return;
    }
    const triggerDate = new Date(task.reminderDate);
    triggerDate.setSeconds(0, 0);
    console.log("[NotificationService] Trigger Date parsed (seconds reset to 0):", triggerDate.toISOString(), "timestamp:", triggerDate.getTime());
    console.log("[NotificationService] Current Time:", new Date().toISOString(), "timestamp:", Date.now());
    
    const isPast = triggerDate.getTime() <= Date.now();
    if (isPast && (!task.reminderFrequency || task.reminderFrequency === "once")) {
      console.log("[NotificationService] scheduleTaskReminder SKIPPED: triggerDate is in the PAST or NOW for one-time reminder.");
      return;
    }
    
    console.log("[NotificationService] Canceling existing reminder for task:", task.id);
    await cancelNotifeeReminder(task.id, "task").catch(() => {});
    
    console.log("[NotificationService] Scheduling notification via Notifee exact alarm...");
    await scheduleNotifeeReminder(
      task.id,
      `⏰ Task Reminder: ${task.title}`,
      task.notes || "Don't forget your upcoming task!",
      triggerDate,
      "task"
    );
    console.log("[NotificationService] scheduleTaskReminder SUCCESS!");
  } catch (err) {
    console.error("[NotificationService] Error scheduling task reminder:", err);
  }
}

/** Cancel a scheduled task reminder. */
export async function cancelTaskReminder(taskId: string): Promise<void> {
  if (Platform.OS === "web") return;
  await cancelNotifeeReminder(taskId, "task").catch(() => {});
}

/** Schedule a notification on the task's due date (fires at 8:00 AM on the due day). */
export async function scheduleTaskDueNotification(task: TaskDueLike): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const prefs = await getPrefs();
    const ids = await getTaskDueIds();
    if (prefs.task_due === false) {
      await cancelNotifeeReminder(task.id, "task", "due").catch(() => {});
      if (ids[task.id]) {
        delete ids[task.id];
        await saveTaskDueIds(ids);
      }
      return;
    }
    await cancelNotifeeReminder(task.id, "task", "due").catch(() => {});
    const { hour, minute } = await getTaskReminderTime();
    const triggerDate = parseLocalDate(task.dueDate);
    triggerDate.setHours(hour, minute, 0, 0);
    if (triggerDate.getTime() <= Date.now()) return;
    
    await scheduleNotifeeReminder(
      task.id,
      `📋 Task Due Today: ${task.title}`,
      task.notes || "This task is due today.",
      triggerDate,
      "task",
      "due"
    );
    ids[task.id] = `task-due-${task.id}`;
    await saveTaskDueIds(ids);
  } catch (err) {
    console.error("[NotificationService] Error scheduling task due notification:", err);
  }
}

/** Cancel a scheduled task due-date notification. */
export async function cancelTaskDueNotification(taskId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const ids = await getTaskDueIds();
    await cancelNotifeeReminder(taskId, "task", "due").catch(() => {});
    if (ids[taskId]) {
      delete ids[taskId];
      await saveTaskDueIds(ids);
    }
  } catch {}
}

/** Reschedule all task notifications — requests permission if not yet granted (use from Notifications screen). */
export async function rescheduleAllTaskNotifications(
  tasks: Array<{ id: string; title: string; dueDate: string; reminderEnabled: boolean; reminderDate?: string; reminderFrequency?: "once" | "daily" | "weekly" | "monthly"; notes?: string; isCompleted: boolean }>
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    for (const task of tasks) {
      if (task.isCompleted) {
        await cancelTaskReminder(task.id);
        await cancelTaskDueNotification(task.id);
      } else {
        if (task.reminderEnabled && task.reminderDate) {
          await scheduleTaskReminder({ id: task.id, title: task.title, reminderDate: task.reminderDate, reminderFrequency: task.reminderFrequency, notes: task.notes });
        } else {
          await cancelTaskReminder(task.id);
        }
        await scheduleTaskDueNotification({ id: task.id, title: task.title, dueDate: task.dueDate, notes: task.notes });
      }
    }
  } catch {}
}

/** Called on app init: reschedule task notifications only if permission already granted. */
export async function setupTaskNotificationsOnInit(
  tasks: Array<{ id: string; title: string; dueDate: string; reminderEnabled: boolean; reminderDate?: string; reminderFrequency?: "once" | "daily" | "weekly" | "monthly"; notes?: string; isCompleted: boolean }>
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const N = await getNotif();
    if (!N) return;
    const { status } = await N.getPermissionsAsync();
    if (status !== "granted") return;

    // Fetch all currently scheduled Notifee trigger IDs to avoid duplicate scheduling
    const scheduledIds = await getNotifeeScheduledIds();
    const dueIds = await getTaskDueIds();

    for (const task of tasks) {
      if (!task.isCompleted) {
        const reminderId = `task-${task.id}`;
        
        // Only schedule task reminder if not already scheduled
        if (task.reminderEnabled && task.reminderDate && !scheduledIds.has(reminderId)) {
          await scheduleTaskReminder({ id: task.id, title: task.title, reminderDate: task.reminderDate, reminderFrequency: task.reminderFrequency, notes: task.notes });
        }
        
        // Only schedule due notification if not already scheduled
        const dueNotifId = dueIds[task.id] || `task-due-${task.id}`;
        if (!scheduledIds.has(dueNotifId)) {
          await scheduleTaskDueNotification({ id: task.id, title: task.title, dueDate: task.dueDate, notes: task.notes });
        }
      }
    }
  } catch {}
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

/** Fire a notification immediately (no scheduled trigger). */
export async function fireImmediateNotification(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  try {
    const { status } = await N.getPermissionsAsync();
    if (status !== "granted") return;
    await N.scheduleNotificationAsync({
      content: { title, body, sound: true, channelId: "default", data: { ...(data ?? {}), app: "fintrack" } } as any,
      trigger: null,
    });
  } catch {}
}

/** Check if a new expense transaction pushes any budget over its limit and fire an immediate notification. */
export async function checkBudgetAndNotify(
  allTxs: TxLike[],
  budgets: BudgetLike[]
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const prefs = await getPrefs();
    if (prefs.budget_over === false && prefs.budget_pct === false) return;
    const firedMap = await getBudgetFiredMap();
    let mapChanged = false;
    for (const budget of budgets) {
      if (budget.type !== "expense") continue;
      const periodStart = getPeriodStart(budget.period);
      const periodKey = getPeriodKey(budget.period);
      const overKey = `${budget.id}_${periodKey}_over`;
      const pctKey = `${budget.id}_${periodKey}_pct`;
      const catMatch = (txCat: string) => {
        if (!budget.category) return true;
        const a = txCat.toLowerCase(), b = budget.category.toLowerCase();
        return a.includes(b) || b.includes(a);
      };
      const spent = allTxs
        .filter((t) => {
          if (t.type !== "expense") return false;
          if (parseLocalDate(t.date).getTime() < periodStart.getTime()) return false;
          return catMatch(t.category);
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const pct = budget.amount > 0 ? spent / budget.amount : 0;
      const threshold = (budget.alertPct ?? 80) / 100;
      if (prefs.budget_over !== false) {
        if (pct >= 1 && !firedMap[overKey]) {
          const over = (spent - budget.amount).toFixed(2);
          await fireImmediateNotification(
            "\uD83D\uDEA8 Budget Exceeded",
            `Your "${budget.name}" budget is over by $${over}.`,
            { type: "budget_exceeded", budgetId: budget.id }
          );
          firedMap[overKey] = "fired";
          mapChanged = true;
        } else if (pct < 1 && firedMap[overKey]) {
          delete firedMap[overKey];
          mapChanged = true;
        }
      }
      if (prefs.budget_pct !== false) {
        if (pct >= threshold && pct < 1 && !firedMap[pctKey]) {
          const pctUsed = Math.round(pct * 100);
          await fireImmediateNotification(
            "\u26A0\uFE0F Budget Alert",
            `You've used ${pctUsed}% of your "${budget.name}" budget.`,
            { type: "budget_warning", budgetId: budget.id }
          );
          firedMap[pctKey] = "fired";
          mapChanged = true;
        } else if (pct < threshold && firedMap[pctKey]) {
          delete firedMap[pctKey];
          mapChanged = true;
        }
      }
    }
    if (mapChanged) await saveBudgetFiredMap(firedMap);
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

    // Fetch scheduled Notifee trigger IDs to skip rescheduling already set bills
    const scheduledIds = await getNotifeeScheduledIds();
    const billNotifMap = await getStoredIds();

    for (const bill of bills) {
      if (!bill.isPaid) {
        const storedIdsForBill = billNotifMap[bill.id];
        const hasUpcoming = storedIdsForBill?.upcoming && scheduledIds.has(storedIdsForBill.upcoming);
        const hasOverdue = storedIdsForBill?.overdue && scheduledIds.has(storedIdsForBill.overdue);
        
        if (!hasUpcoming || !hasOverdue) {
          await scheduleBillNotifications(bill);
        }
      } else {
        await cancelBillNotifications(bill.id);
      }
    }
  } catch {}
}
