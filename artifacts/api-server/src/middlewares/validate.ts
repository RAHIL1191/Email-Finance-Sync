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
 * Require X-Device-ID header. Attaches deviceId to res.locals.
 */
export function requireDeviceId(req: Request, res: Response, next: NextFunction) {
  const deviceId = req.headers["x-device-id"];
  if (!deviceId || typeof deviceId !== "string" || deviceId.trim().length === 0) {
    res.status(400).json({ error: "X-Device-ID header is required" });
    return;
  }
  res.locals.deviceId = deviceId.trim();
  next();
}
