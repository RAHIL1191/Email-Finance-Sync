import { db, pushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export async function sendPushToHousehold(
  householdId: string,
  message: PushMessage
): Promise<void> {
  const rows = await db
    .select()
    .from(pushTokensTable)
    .where(eq(pushTokensTable.householdId, householdId));

  if (rows.length === 0) return;

  const notifications = rows.map((r) => ({
    to: r.token,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: "default",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(notifications),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Expo push API error");
      return;
    }

    const result = await res.json() as { data: ExpoPushTicket[] };
    const tickets: ExpoPushTicket[] = Array.isArray(result.data) ? result.data : [result.data as any];

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === "error") {
        logger.warn({ ticket, token: rows[i]?.token }, "Push notification failed");
        if (ticket.details?.error === "DeviceNotRegistered" && rows[i]) {
          await db
            .delete(pushTokensTable)
            .where(eq(pushTokensTable.token, rows[i].token));
          logger.info({ token: rows[i].token }, "Removed stale push token");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to send push notifications");
  }
}
