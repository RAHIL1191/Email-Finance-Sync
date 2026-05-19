import { db, billsTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendPushToHousehold } from "./pushNotifications.js";

type NotifState = "upcoming" | "due_unpaid" | "overdue" | "paid";

/** Advance dueDate by the bill's frequency for recurring bills */
function nextDueDate(dueDate: string, frequency: string | null): string {
  const d = new Date(dueDate);
  switch (frequency) {
    case "daily":      d.setDate(d.getDate() + 1); break;
    case "weekly":     d.setDate(d.getDate() + 7); break;
    case "biweekly":   d.setDate(d.getDate() + 14); break;
    case "monthly":    d.setMonth(d.getMonth() + 1); break;
    case "quarterly":  d.setMonth(d.getMonth() + 3); break;
    case "semiannual": d.setMonth(d.getMonth() + 6); break;
    case "yearly":     d.setFullYear(d.getFullYear() + 1); break;
    default:           d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString();
}

/** Returns midnight of a date as a comparable string YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runBillCheck(): Promise<{ checked: number; paid: number; notified: number }> {
  const today = new Date();
  const todayStr = toDateStr(today);

  // Window: D-2 to D+2 around today's date
  const windowStart = new Date(today); windowStart.setDate(today.getDate() - 2);
  const windowEnd   = new Date(today); windowEnd.setDate(today.getDate() + 2);
  const windowStartStr = toDateStr(windowStart);
  const windowEndStr   = toDateStr(windowEnd);

  // Fetch all unpaid bills whose dueDate falls in the ±2 day window
  const bills = await db
    .select()
    .from(billsTable)
    .where(
      and(
        eq(billsTable.isPaid, false),
        gte(billsTable.dueDate, windowStartStr),
        lte(billsTable.dueDate, windowEndStr)
      )
    );

  let paid = 0;
  let notified = 0;

  for (const bill of bills) {
    try {
      const dueStr = toDateStr(new Date(bill.dueDate));
      const diffDays = Math.round(
        (new Date(todayStr).getTime() - new Date(dueStr).getTime()) / 86400000
      );

      // Determine target notification state
      let targetState: NotifState;
      if (diffDays <= -1) {
        targetState = "upcoming";
      } else if (diffDays === 0) {
        // On due date: only alert after midday to give sync time (grace period)
        if (today.getHours() < 12) continue;
        targetState = "due_unpaid";
      } else {
        targetState = "overdue";
      }

      // Search for matching expense transaction: amount ±10%, in D-2 → today
      const low  = bill.amount * 0.90;
      const high = bill.amount * 1.10;
      const txSearchStart = toDateStr(windowStart);

      const matches = await db
        .select()
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.householdId, bill.householdId),
            eq(transactionsTable.type, "expense"),
            gte(transactionsTable.date, txSearchStart),
            lte(transactionsTable.date, todayStr),
            gte(transactionsTable.amount, low),
            lte(transactionsTable.amount, high)
          )
        )
        .limit(1);

      if (matches.length > 0) {
        const match = matches[0];

        // Atomic update: only mark paid if still unpaid (idempotency)
        const recurringUpdates = bill.isRecurring
          ? { isPaid: false as const, dueDate: nextDueDate(bill.dueDate, bill.frequency), lastNotifState: null }
          : { isPaid: true as const, lastNotifState: "paid" as const };

        const updated = await db
          .update(billsTable)
          .set({ ...recurringUpdates, updatedAt: new Date() })
          .where(
            and(
              eq(billsTable.id, bill.id),
              eq(billsTable.isPaid, false) // guard: only if still unpaid
            )
          )
          .returning();

        if (updated.length === 0) continue; // another process already updated

        // Tag the matched transaction
        await db
          .update(transactionsTable)
          .set({
            note: match.note
              ? `${match.note} | Auto-matched to bill: ${bill.title}`
              : `Auto-matched to bill: ${bill.title}`,
            updatedAt: new Date(),
          })
          .where(eq(transactionsTable.id, match.id));

        await sendPushToHousehold(bill.householdId, {
          title: "✅ Bill Payment Detected",
          body: `${bill.title} — $${bill.amount.toFixed(2)} matched and marked as paid.`,
          data: { billId: bill.id, type: "bill_paid" },
        });

        paid++;
        notified++;
        logger.info({ billId: bill.id, txId: match.id }, "Bill auto-marked paid");
        continue;
      }

      // No match found — notify only on state change
      if (bill.lastNotifState === targetState) continue;

      // Atomic state update
      const stateUpdated = await db
        .update(billsTable)
        .set({ lastNotifState: targetState, updatedAt: new Date() })
        .where(
          and(
            eq(billsTable.id, bill.id),
            sql`(${billsTable.lastNotifState} IS DISTINCT FROM ${targetState})`
          )
        )
        .returning();

      if (stateUpdated.length === 0) continue;

      const messages: Record<NotifState, { title: string; body: string }> = {
        upcoming:   { title: "📅 Bill Due Soon",   body: `${bill.title} — $${bill.amount.toFixed(2)} is due on ${dueStr}.` },
        due_unpaid: { title: "🔔 Bill Due Today",  body: `${bill.title} — $${bill.amount.toFixed(2)} is due today. No payment detected yet.` },
        overdue:    { title: "⚠️ Bill Overdue",    body: `${bill.title} — $${bill.amount.toFixed(2)} was due on ${dueStr}. No payment found.` },
        paid:       { title: "✅ Bill Paid",        body: `${bill.title} payment detected.` },
      };

      await sendPushToHousehold(bill.householdId, {
        ...messages[targetState],
        data: { billId: bill.id, type: `bill_${targetState}` },
      });

      notified++;
    } catch (err) {
      logger.error({ err, billId: bill.id }, "Error processing bill in checker");
    }
  }

  return { checked: bills.length, paid, notified };
}
