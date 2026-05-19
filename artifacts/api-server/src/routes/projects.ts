import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, projectsTable, insertProjectSchema, updateProjectSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/projects — list projects; optional ?since=ISO for incremental pull */
router.get("/projects", async (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const rows = await db
      .select()
      .from(projectsTable)
      .where(
        since
          ? and(
              eq(projectsTable.householdId, res.locals.householdId),
              gte(projectsTable.updatedAt, new Date(since))
            )
          : eq(projectsTable.householdId, res.locals.householdId)
      );
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch projects");
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

/** POST /api/projects — create or upsert a project */
router.post("/projects", validate(insertProjectSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db
      .insert(projectsTable)
      .values(payload)
      .onConflictDoUpdate({
        target: projectsTable.id,
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create project");
    res.status(500).json({ error: "Failed to create project" });
  }
});

/** PUT /api/projects/:id — update a project */
router.put("/projects/:id", validate(updateProjectSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(projectsTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(projectsTable.id, String(req.params.id)),
          eq(projectsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update project");
    res.status(500).json({ error: "Failed to update project" });
  }
});

/** DELETE /api/projects/:id — delete a project */
router.delete("/projects/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(projectsTable)
      .where(
        and(
          eq(projectsTable.id, String(req.params.id)),
          eq(projectsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete project");
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
