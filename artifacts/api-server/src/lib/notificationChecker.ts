import { db, tasksTable, budgetsTable, goalsTable, transactionsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendPushToHousehold } from "./pushNotifications.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Date columns store plain "YYYY-MM-DD" strings representing the household's
// LOCAL calendar day. Previously every "today" / period boundary was computed
// in UTC (via toISOString()), which misfired alerts by up to a full day for
// non-UTC households — e.g. 8pm EDT was already "tomorrow" on the server,
// so a bill/task due locally today got an "overdue" push in the evening and
// "due today" pushes landed hours early.
//
// All such logic now resolves in HOUSEHOLD_TIMEZONE (env-configurable; the
// default covers the primary Montreal household). A per-household timezone
// column is the correct long-term home for this once multi-household ships.
const HOUSEHOLD_TZ = process.env.HOUSEHOLD_TIMEZONE || "America/Toronto";

/** "YYYY-MM-DD" for a Date, in the household timezone. */
function toDateStr(d: Date, tz: string = HOUSEHOLD_TZ): string {
  // en-CA renders YYYY-MM-DD, matching our date columns exactly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Local calendar parts for a Date (weekday follows Date#getDay: 0 = Sunday). */
function localParts(d: Date, tz: string = HOUSEHOLD_TZ) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    monthIndex: Number(get("month")) - 1,
    day: Number(get("day")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

/** Sunday-anchored week start as "YYYY-MM-DD", in the household timezone. */
function localWeekStartStr(d: Date = new Date(), tz: string = HOUSEHOLD_TZ): string {
  const p = localParts(d, tz);
  // Pure calendar arithmetic on extracted parts — timezone already resolved.
  const anchor = new Date(Date.UTC(p.year, p.monthIndex, p.day));
  anchor.setUTCDate(anchor.getUTCDate() - p.weekday);
  return anchor.toISOString().slice(0, 10);
}

function getPeriodKey(period: string): string {
  const p = localParts(new Date());
  if (period === "monthly") return `${p.year}-${String(p.monthIndex + 1).padStart(2, "0")}`;
  if (period === "weekly") return `${p.year}-W${localWeekStartStr()}`;
  return `${p.year}`;
}

/** Period start boundary as "YYYY-MM-DD" for string date-column comparisons. */
function getPeriodStartStr(period: string): string {
  const p = localParts(new Date());
  if (period === "monthly") return `${p.year}-${String(p.monthIndex + 1).padStart(2, "0")}-01`;
  if (period === "weekly") return localWeekStartStr();
  return `${p.year}-01-01`;
}

/** Normalize a stored date column (accepts "YYYY-MM-DD" or full ISO strings). */
function storedDateStr(value: unknown): string {
  // IMPORTANT: never re-parse stored date-only values through `new Date()` —
  // that reads them as UTC midnight and re-shifts the day in local time.
  return String(value ?? "").slice(0, 10);
}

// ─── Task Notification Check ─────────────────────────────────────────────────

export async function runTaskNotificationCheck(): Promise<{ checked: number; notified: number }> {
  const todayStr = toDateStr(new Date());
  let notified = 0;

  // Fetch all incomplete tasks with dueDate on or before today (household-local)
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.isCompleted, false),
        lte(tasksTable.dueDate, todayStr)
      )
    );

  for (const task of tasks) {
    try {
      const dueStr = storedDateStr(task.dueDate);

      let targetState: string;
      if (dueStr === todayStr) {
        targetState = "due_today";
      } else if (dueStr < todayStr) {
        targetState = "overdue";
      } else {
        continue;
      }

      // Only notify on state transition (idempotent)
      if (task.lastNotifState === targetState) continue;

      // Atomic state update — only if state actually changed
      const updated = await db
        .update(tasksTable)
        .set({ lastNotifState: targetState, updatedAt: new Date() })
        .where(
          and(
            eq(tasksTable.id, task.id),
            sql`(${tasksTable.lastNotifState} IS DISTINCT FROM ${targetState})`
          )
        )
        .returning();

      if (updated.length === 0) continue;

      const messages: Record<string, { title: string; body: string }> = {
        due_today: {
          title: "📋 Task Due Today",
          body: `${task.title} is due today.${task.notes ? ` — ${task.notes}` : ""}`,
        },
        overdue: {
          title: "⚠️ Task Overdue",
          body: `${task.title} was due on ${dueStr}.${task.notes ? ` — ${task.notes}` : ""}`,
        },
      };

      await sendPushToHousehold(task.householdId, {
        ...messages[targetState],
        data: {
          entityId: task.id,
          type: "task",
          subtype: targetState === "due_today" ? "due" : "overdue",
          app: "fintrack",
        },
      });

      notified++;
      logger.info({ taskId: task.id, state: targetState }, "Task notification sent");
    } catch (err) {
      logger.error({ err, taskId: task.id }, "Error processing task in notification checker");
    }
  }

  return { checked: tasks.length, notified };
}

// ─── Budget Notification Check ───────────────────────────────────────────────

export async function runBudgetNotificationCheck(): Promise<{ checked: number; notified: number }> {
  let notified = 0;

  const budgets = await db
    .select()
    .from(budgetsTable)
    .where(eq(budgetsTable.type, "expense"));

  for (const budget of budgets) {
    try {
      const periodKey = getPeriodKey(budget.period);
      const periodStart = getPeriodStartStr(budget.period);
      const todayStr = toDateStr(new Date());

      // Strict category matching: trimmed, case-insensitive exact equality.
      // The previous LIKE '%category%' substring match absorbed unrelated
      // categories (e.g. "Food" also matching "Fast Food" / "Seafood") and
      // inflated spend totals, producing false 80%/exceeded alerts.
      const catFilter = budget.category
        ? sql`LOWER(TRIM(${transactionsTable.category})) = LOWER(TRIM(${budget.category}))`
        : sql`1=1`;

      const [result] = await db
        .select({
          total: sql<number>`COALESCE(SUM(ABS(${transactionsTable.amount})), 0)`.as("total"),
        })
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.householdId, budget.householdId),
            eq(transactionsTable.type, "expense"),
            sql`${transactionsTable.date} >= ${periodStart}`,
            sql`${transactionsTable.date} <= ${todayStr}`,
            catFilter
          )
        );

      const spent = Number(result?.total ?? 0);
      const pct = budget.amount > 0 ? spent / budget.amount : 0;
      const threshold = 0.8; // 80% default

      let targetState: string | null = null;

      if (pct >= 1) {
        targetState = `exceeded_${periodKey}`;
      } else if (pct >= threshold) {
        targetState = `warning_${periodKey}`;
      }

      if (!targetState) {
        // Reset state if spending dropped below threshold (e.g., refund)
        if (budget.lastNotifState && budget.lastNotifState.includes(periodKey)) {
          await db
            .update(budgetsTable)
            .set({ lastNotifState: null, updatedAt: new Date() })
            .where(eq(budgetsTable.id, budget.id));
        }
        continue;
      }

      // Only notify on state transition
      if (budget.lastNotifState === targetState) continue;

      const updated = await db
        .update(budgetsTable)
        .set({ lastNotifState: targetState, updatedAt: new Date() })
        .where(
          and(
            eq(budgetsTable.id, budget.id),
            sql`(${budgetsTable.lastNotifState} IS DISTINCT FROM ${targetState})`
          )
        )
        .returning();

      if (updated.length === 0) continue;

      if (targetState.startsWith("exceeded")) {
        const over = (spent - budget.amount).toFixed(2);
        await sendPushToHousehold(budget.householdId, {
          title: "🚨 Budget Exceeded",
          body: `Your "${budget.name}" budget is over by $${over}.`,
          data: { entityId: budget.id, type: "budget_exceeded", app: "fintrack" },
        });
      } else {
        const pctUsed = Math.round(pct * 100);
        await sendPushToHousehold(budget.householdId, {
          title: "⚠️ Budget Alert",
          body: `You've used ${pctUsed}% of your "${budget.name}" budget ($${budget.amount}).`,
          data: { entityId: budget.id, type: "budget_warning", app: "fintrack" },
        });
      }

      notified++;
      logger.info({ budgetId: budget.id, state: targetState }, "Budget notification sent");
    } catch (err) {
      logger.error({ err, budgetId: budget.id }, "Error processing budget in notification checker");
    }
  }

  return { checked: budgets.length, notified };
}

// ─── Goal Notification Check ─────────────────────────────────────────────────

export async function runGoalNotificationCheck(): Promise<{ checked: number; notified: number }> {
  let notified = 0;

  const todayStr = toDateStr(new Date());
  const sevenDaysStr = toDateStr(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  // Goals with a target date within the next 7 days that haven't reached their target
  const goals = await db
    .select()
    .from(goalsTable)
    .where(
      and(
        sql`${goalsTable.targetDate} IS NOT NULL`,
        sql`${goalsTable.targetDate} >= ${todayStr}`,
        sql`${goalsTable.targetDate} <= ${sevenDaysStr}`,
        sql`${goalsTable.currentAmount} < ${goalsTable.targetAmount}`
      )
    );

  for (const goal of goals) {
    try {
      const targetState = "approaching";

      if (goal.lastNotifState === targetState) continue;

      const updated = await db
        .update(goalsTable)
        .set({ lastNotifState: targetState, updatedAt: new Date() })
        .where(
          and(
            eq(goalsTable.id, goal.id),
            sql`(${goalsTable.lastNotifState} IS DISTINCT FROM ${targetState})`
          )
        )
        .returning();

      if (updated.length === 0) continue;

      const remaining = (goal.targetAmount - goal.currentAmount).toFixed(2);
      await sendPushToHousehold(goal.householdId, {
        title: "🎯 Goal Deadline Approaching",
        body: `"${goal.name}" target date is ${goal.targetDate}. $${remaining} still needed.`,
        data: { entityId: goal.id, type: "goal_approaching", app: "fintrack" },
      });

      notified++;
      logger.info({ goalId: goal.id }, "Goal notification sent");
    } catch (err) {
      logger.error({ err, goalId: goal.id }, "Error processing goal in notification checker");
    }
  }

  return { checked: goals.length, notified };
}
