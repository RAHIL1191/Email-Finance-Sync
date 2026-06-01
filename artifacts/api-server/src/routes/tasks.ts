import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, tasksTable, insertTaskSchema, updateTaskSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";
import crypto from "crypto";

const router = Router();

router.use(requireHouseholdId);

function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNaturalDate(str: string): Date | null {
  const now = new Date();
  str = str.trim().toLowerCase();

  if (str === "today") {
    return now;
  }
  if (str === "tomorrow") {
    const d = new Date(now);
    d.setDate(now.getDate() + 1);
    return d;
  }

  // Weekdays lookup
  const weekdays: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6
  };

  if (str in weekdays) {
    const targetDay = weekdays[str];
    const currentDay = now.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) {
      diff += 7; // Next week's weekday if today or already passed
    }
    const d = new Date(now);
    d.setDate(now.getDate() + diff);
    return d;
  }

  // Try standard Date parsing
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return d;
  }

  // Check for formats like "june 15" or "15 june" without year
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthDayMatch = str.match(/([a-z]{3,})\s+(\d{1,2})/i);
  if (monthDayMatch) {
    const mStr = monthDayMatch[1].substring(0, 3);
    const mIndex = months.indexOf(mStr);
    const day = parseInt(monthDayMatch[2], 10);
    if (mIndex !== -1 && day >= 1 && day <= 31) {
      const d = new Date(now.getFullYear(), mIndex, day);
      if (d < now) {
        d.setFullYear(now.getFullYear() + 1);
      }
      return d;
    }
  }

  return null;
}

function parseYodaCommand(command: string): { title: string; dueDate: Date; repeat: "once" | "daily" | "weekly" | "monthly" } | null {
  const cmd = command.trim();
  const cmdLower = cmd.toLowerCase();
  
  let trigger = "";
  if (cmdLower.startsWith("yoda add task")) {
    trigger = "yoda add task";
  } else if (cmdLower.startsWith("add task")) {
    trigger = "add task";
  } else {
    return null;
  }

  let content = cmd.slice(trigger.length).trim();
  if (!content) return null;

  let repeat: "once" | "daily" | "weekly" | "monthly" = "once";
  const repeatRegex = /\brepeat\s+(once|daily|weekly|monthly)\b/i;
  const repeatMatch = content.match(repeatRegex);
  if (repeatMatch) {
    repeat = repeatMatch[1].toLowerCase() as any;
    content = content.replace(repeatRegex, "").trim();
  } else {
    const simpleRepeatRegex = /\b(daily|weekly|monthly)\b/i;
    const simpleRepeatMatch = content.match(simpleRepeatRegex);
    if (simpleRepeatMatch) {
      repeat = simpleRepeatMatch[1].toLowerCase() as any;
      content = content.replace(simpleRepeatRegex, "").trim();
    }
  }

  let dueDate = new Date();
  const dateRegex = /\b(on|due|for)\s+(.+)$/i;
  const dateMatch = content.match(dateRegex);
  if (dateMatch) {
    const dateStr = dateMatch[2].trim().toLowerCase();
    const titlePart = content.slice(0, dateMatch.index).trim();
    const parsedDate = parseNaturalDate(dateStr);
    if (parsedDate) {
      dueDate = parsedDate;
      content = titlePart;
    }
  } else {
    const endWordsRegex = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b$/i;
    const endWordsMatch = content.match(endWordsRegex);
    if (endWordsMatch) {
      const dateStr = endWordsMatch[1].trim().toLowerCase();
      const titlePart = content.slice(0, endWordsMatch.index).trim();
      const parsedDate = parseNaturalDate(dateStr);
      if (parsedDate) {
        dueDate = parsedDate;
        content = titlePart;
      }
    }
  }

  return {
    title: content.trim(),
    dueDate,
    repeat,
  };
}

router.post("/tasks/yoda", async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      res.status(400).json({ error: "Missing command" });
      return;
    }

    const parsed = parseYodaCommand(command);
    if (!parsed) {
      res.status(400).json({ error: "Invalid Yoda command format. Must start with 'yoda add task' or 'add task'" });
      return;
    }

    const payload = {
      id: crypto.randomUUID(),
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId || "siri-voice-agent",
      title: parsed.title,
      category: "Reminder",
      dueDate: toLocalYMD(parsed.dueDate),
      priority: "medium",
      isCompleted: false,
      reminderEnabled: parsed.repeat !== "once",
      reminderDate: parsed.repeat !== "once" ? parsed.dueDate.toISOString() : null,
      reminderFrequency: parsed.repeat !== "once" ? parsed.repeat : null,
    };

    const [row] = await db
      .insert(tasksTable)
      .values(payload)
      .returning();

    res.status(201).json({ success: true, task: row });
  } catch (err) {
    req.log.error({ err }, "Failed to process Yoda voice command");
    res.status(500).json({ error: "Failed to process Yoda voice command" });
  }
});

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
