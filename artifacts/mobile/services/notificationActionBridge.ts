import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const PENDING_ACTIONS_KEY = "@fintrack/pending_notif_actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingNotifAction {
  action: "complete" | "snooze";
  entityType: "task" | "bill";
  entityId: string;
  snoozeDate?: string; // ISO string — only for snooze actions
  title?: string; // original notification title — for rescheduling snooze
  body?: string; // original notification body — for rescheduling snooze
  timestamp: string; // ISO string — when the action was taken
}

// ─── Queue an action (called from background handler in index.js) ────────────

export async function queueNotifAction(action: PendingNotifAction): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    const actions: PendingNotifAction[] = raw ? JSON.parse(raw) : [];

    // Deduplicate: remove any existing action for the same entity
    const filtered = actions.filter(
      (a) => !(a.entityId === action.entityId && a.entityType === action.entityType && a.action === action.action)
    );
    filtered.push(action);

    await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(filtered));
    console.log(`[NotifActionBridge] Queued ${action.action} for ${action.entityType} ${action.entityId}`);
  } catch (err) {
    console.error("[NotifActionBridge] Error queuing action:", err);
  }
}

// ─── Consume all pending actions (called from AppContext on init/foreground) ──

export async function consumePendingNotifActions(): Promise<PendingNotifAction[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    if (!raw) return [];

    const actions: PendingNotifAction[] = JSON.parse(raw);

    // Clear the queue after reading
    await AsyncStorage.removeItem(PENDING_ACTIONS_KEY);

    console.log(`[NotifActionBridge] Consumed ${actions.length} pending action(s)`);
    return actions;
  } catch (err) {
    console.error("[NotifActionBridge] Error consuming actions:", err);
    return [];
  }
}

// ─── Check if there are pending actions (non-destructive peek) ───────────────

export async function hasPendingNotifActions(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    if (!raw) return false;
    const actions: PendingNotifAction[] = JSON.parse(raw);
    return actions.length > 0;
  } catch {
    return false;
  }
}
