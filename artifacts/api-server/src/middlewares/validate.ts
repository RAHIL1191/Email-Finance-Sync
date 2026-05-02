import type { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Zod validation middleware factory.
 * Usage: router.post("/", validate(mySchema), handler)
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e: { path: (string | number)[]; message: string }) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      res.status(400).json({ error: "Validation failed", details: errors });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Require household identification.
 * Reads X-Household-ID first (shared family code), falls back to X-Device-ID
 * for backward compatibility. Attaches both to res.locals.
 *
 * Data isolation is scoped by householdId — all family devices sharing
 * the same code see the same transactions, accounts, and bills.
 * deviceId is kept for per-device attribution (who added what).
 */
export function requireHouseholdId(req: Request, res: Response, next: NextFunction) {
  const householdId = req.headers["x-household-id"] ?? req.headers["x-device-id"];
  const deviceId = req.headers["x-device-id"] ?? householdId;

  if (!householdId || typeof householdId !== "string" || householdId.trim().length === 0) {
    res.status(400).json({ error: "X-Household-ID header is required" });
    return;
  }

  res.locals.householdId = householdId.trim();
  res.locals.deviceId = typeof deviceId === "string" ? deviceId.trim() : householdId.trim();
  next();
}
