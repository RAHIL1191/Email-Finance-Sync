import app from "./app.js";
import { logger } from "./lib/logger.js";
import { runBillCheck } from "./lib/billChecker.js";
import {
  runTaskNotificationCheck,
  runBudgetNotificationCheck,
  runGoalNotificationCheck,
} from "./lib/notificationChecker.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Background notification scheduler ──────────────────────────────────
  // Runs every 15 minutes, even when no mobile client is connected.
  // Validates entity state in DB, sends Expo push notifications on state
  // transitions only (idempotent via lastNotifState column).
  const FIFTEEN_MINUTES = 15 * 60 * 1000;

  const runNotificationCheck = async () => {
    try {
      const [bills, tasks, budgets, goals] = await Promise.all([
        runBillCheck(),
        runTaskNotificationCheck(),
        runBudgetNotificationCheck(),
        runGoalNotificationCheck(),
      ]);

      const totalNotified =
        bills.notified + tasks.notified + budgets.notified + goals.notified;

      if (totalNotified > 0) {
        logger.info(
          { bills, tasks, budgets, goals },
          `Notification check complete: ${totalNotified} notification(s) sent`
        );
      }
    } catch (err) {
      logger.error({ err }, "Background notification check failed");
    }
  };

  // Run once after a 30-second startup delay (let DB connections warm up)
  setTimeout(runNotificationCheck, 30_000);

  // Then every 15 minutes
  setInterval(runNotificationCheck, FIFTEEN_MINUTES);

  logger.info("Background notification scheduler started (every 15 minutes)");
});
