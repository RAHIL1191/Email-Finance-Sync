import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, tasksTable, insertTaskSchema, updateTaskSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/tasks — list tasks; optional ?since=ISO for incremental pull */
router.get("/tasks", async (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const rows = await db
      .select()
      .from(tasksTable)
      .where(
        since
          ? and(
              eq(tasksTable.householdId, res.locals.householdId),
              gte(tasksTable.updatedAt, new Date(since))
            )
          : eq(tasksTable.householdId, res.locals.householdId)
      );
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch tasks");
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

/** POST /api/tasks — create or upsert a task */
router.post("/tasks", validate(insertTaskSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db
      .insert(tasksTable)
      .values(payload)
      .onConflictDoUpdate({
        target: tasksTable.id,
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create task");
    res.status(500).json({ error: "Failed to create task" });
  }
});

/** PUT /api/tasks/:id — update a task */
router.put("/tasks/:id", validate(updateTaskSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(tasksTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(tasksTable.id, String(req.params.id)),
          eq(tasksTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update task");
    res.status(500).json({ error: "Failed to update task" });
  }
});

/** DELETE /api/tasks/:id — delete a task */
router.delete("/tasks/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(tasksTable)
      .where(
        and(
          eq(tasksTable.id, String(req.params.id)),
          eq(tasksTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete task");
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
