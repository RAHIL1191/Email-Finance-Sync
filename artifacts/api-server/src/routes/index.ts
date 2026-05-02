import { Router, type IRouter } from "express";
import { strictRateLimit } from "../middlewares/security.js";
import { features } from "../config/features.js";
import healthRouter from "./health.js";
import configRouter from "./config.js";
import accountsRouter from "./accounts.js";
import transactionsRouter from "./transactions.js";
import billsRouter from "./bills.js";
import emailRouter from "./email.js";
import plaidRouter, { plaidLinkPageHandler } from "./plaid.js";

const router: IRouter = Router();

// Public routes (no auth)
router.use(healthRouter);
router.use(configRouter);

// Plaid Link popup page — must be registered before any household-auth middleware
// so browser-opened popups (which carry no custom headers) can reach it.
router.get("/plaid/link-page", plaidLinkPageHandler);

// Data CRUD routes
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(billsRouter);

// Feature-flagged: email sync (apply strict rate limit)
if (features.emailSync) {
  router.use(strictRateLimit, emailRouter);
} else {
  router.all("/email/*", (_req, res) => {
    res.status(403).json({ error: "Email sync feature is currently disabled." });
  });
}

// Feature-flagged: Plaid bank sync (apply strict rate limit)
if (features.plaidSync) {
  router.use(strictRateLimit, plaidRouter);
} else {
  router.all("/plaid/*", (_req, res) => {
    res.status(403).json({ error: "Plaid sync feature is currently disabled." });
  });
}

export default router;
