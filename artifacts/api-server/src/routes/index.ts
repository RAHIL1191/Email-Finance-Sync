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
import aiReviewRouter from "./ai-review.js";
import aiChatRouter from "./ai-chat.js";
import categoriesRouter from "./categories.js";
import categoryRulesRouter from "./categoryRules.js";

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
router.use(categoriesRouter);
router.use(categoryRulesRouter);

// AI features (rate-limited)
router.use(strictRateLimit, aiReviewRouter);
router.use(strictRateLimit, aiChatRouter);

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
