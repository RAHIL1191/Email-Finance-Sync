import { Router } from "express";
import { runBillCheck } from "../lib/billChecker.js";
import {
  runTaskNotificationCheck,
  runBudgetNotificationCheck,
  runGoalNotificationCheck,
} from "../lib/notificationChecker.js";
import { requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

/**
 * Unified notification check endpoint.
 * Can be called:
 *   1. From a cron service with X-Cron-Secret header (checks ALL households)
 *   2. From the mobile app with household auth headers (checks only that household)
 *
 * POST /api/cron/notification-check     (cron — all households)
 * POST /api/notification-check          (app — single household)
 */

// ── Cron variant: X-Cron-Secret auth, checks ALL households ──────────────────
router.post("/cron/notification-check", async (req, res) => {
  const secret = req.headers["x-cron-secret"];
  if (!secret || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [bills, tasks, budgets, goals] = await Promise.all([
      runBillCheck(),
      runTaskNotificationCheck(),
      runBudgetNotificationCheck(),
      runGoalNotificationCheck(),
    ]);

    res.json({
      success: true,
      bills,
      tasks,
      budgets,
      goals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Unified notification check failed");
    res.status(500).json({ error: "Notification check failed" });
  }
});

// ── App variant: household auth, checks only that household ──────────────────
router.post("/notification-check", requireHouseholdId, async (req, res) => {
  try {
    const [bills, tasks, budgets, goals] = await Promise.all([
      runBillCheck(),
      runTaskNotificationCheck(),
      runBudgetNotificationCheck(),
      runGoalNotificationCheck(),
    ]);

    res.json({
      success: true,
      bills,
      tasks,
      budgets,
      goals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Notification check failed");
    res.status(500).json({ error: "Notification check failed" });
  }
});

export default router;
