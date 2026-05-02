import { Router } from "express";
import { features } from "../config/features.js";

const router = Router();

/**
 * GET /api/config/features
 * Returns the current feature flag configuration.
 * This endpoint is intentionally public so the mobile app
 * can read flags before any authentication.
 */
router.get("/config/features", (_req, res) => {
  res.json({ features });
});

export default router;
