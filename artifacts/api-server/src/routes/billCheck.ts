import { Router } from "express";
import { runBillCheck } from "../lib/billChecker.js";

const router = Router();

router.post("/bills/check", async (req, res) => {
  const secret = req.headers["x-cron-secret"];
  if (!secret || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const result = await runBillCheck();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Bill check failed");
    res.status(500).json({ error: "Bill check failed" });
  }
});

export default router;
