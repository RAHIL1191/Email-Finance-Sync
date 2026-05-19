import { Router } from "express";
import { db, pushTokensTable } from "@workspace/db";
import { requireHouseholdId } from "../middlewares/validate.js";
import { z } from "zod";

const router = Router();

const PushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]).optional(),
});

router.post("/push-token", requireHouseholdId, async (req, res) => {
  const parsed = PushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    return;
  }

  const { token, platform } = parsed.data;
  const { householdId, deviceId } = res.locals;

  try {
    await db
      .insert(pushTokensTable)
      .values({ householdId, deviceId, token, platform, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [pushTokensTable.householdId, pushTokensTable.deviceId],
        set: { token, platform, updatedAt: new Date() },
      });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to register push token");
    res.status(500).json({ error: "Failed to register push token" });
  }
});

export default router;
