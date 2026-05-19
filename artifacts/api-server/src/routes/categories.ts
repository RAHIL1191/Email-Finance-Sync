import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, categoriesTable, insertCategorySchema, updateCategorySchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/categories — list all categories for this household */
router.get("/categories", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.householdId, res.locals.householdId));
    res.json(rows);
  } catch (err: any) {
    // If table doesn't exist yet, return empty
    if (err?.cause?.code === "42P01" || /relation .* does not exist/.test(err?.message ?? "")) {
      res.json([]);
      return;
    }
    req.log.error({ err }, "Failed to fetch categories");
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

/** POST /api/categories — create a new category */
router.post("/categories", validate(insertCategorySchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
    };
    const [row] = await db.insert(categoriesTable).values(payload).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create category");
    res.status(500).json({ error: "Failed to create category" });
  }
});

/** PUT /api/categories/:id — update a category */
router.put("/categories/:id", validate(updateCategorySchema), async (req, res) => {
  try {
    const [row] = await db
      .update(categoriesTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(categoriesTable.id, String(req.params.id)),
          eq(categoriesTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update category");
    res.status(500).json({ error: "Failed to update category" });
  }
});

/** DELETE /api/categories/:id — delete a category and its subcategories */
router.delete("/categories/:id", async (req, res) => {
  try {
    // Delete subcategories first
    await db
      .delete(categoriesTable)
      .where(
        and(
          eq(categoriesTable.parentId, String(req.params.id)),
          eq(categoriesTable.householdId, res.locals.householdId)
        )
      );
    // Delete the category itself
    const [row] = await db
      .delete(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, String(req.params.id)),
          eq(categoriesTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete category");
    res.status(500).json({ error: "Failed to delete category" });
  }
});

/** POST /api/categories/seed — seed default categories for household */
router.post("/categories/seed", async (req, res) => {
  try {
    const householdId = res.locals.householdId;
    // Check if already seeded
    const existing = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.householdId, householdId), eq(categoriesTable.isDefault, true)));
    if (existing.length > 0) {
      res.json({ seeded: false, message: "Already seeded" });
      return;
    }

    const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

    const defaults = [
      { name: "Bills & Utilities", icon: "file-text", color: "#6366f1", type: "expense" as const, subs: ["Electricity", "Gas", "Internet", "Mobile", "Phone", "Sewage & Garbage", "Water"] },
      { name: "Drink & Dine", icon: "coffee", color: "#f97316", type: "expense" as const, subs: ["Restaurant", "Cafe", "Fast Food", "Bar", "Delivery"] },
      { name: "Education", icon: "book-open", color: "#8b5cf6", type: "expense" as const, subs: ["Tuition", "Books", "Courses", "Supplies"] },
      { name: "Entertainment", icon: "film", color: "#ec4899", type: "expense" as const, subs: ["Movies", "Games", "Streaming", "Events", "Music"] },
      { name: "Events", icon: "calendar", color: "#14b8a6", type: "expense" as const, subs: ["Wedding", "Birthday", "Party", "Festival"] },
      { name: "Family Care", icon: "users", color: "#f59e0b", type: "expense" as const, subs: ["Childcare", "Elder Care", "Family Activities"] },
      { name: "Fees & Charges", icon: "alert-circle", color: "#64748b", type: "expense" as const, subs: ["Bank Fees", "Late Fees", "Service Charges"] },
      { name: "Financial Services", icon: "dollar-sign", color: "#3b82f6", type: "expense" as const, subs: ["Advisory", "Tax Prep", "Accounting"] },
      { name: "Food & Grocery", icon: "shopping-cart", color: "#10b981", type: "expense" as const, subs: ["Groceries", "Snacks", "Organic", "Meat & Seafood"] },
      { name: "Gifts & Donations", icon: "gift", color: "#e11d48", type: "expense" as const, subs: ["Charity", "Gifts", "Donations"] },
      { name: "Health & Fitness", icon: "heart", color: "#ef4444", type: "expense" as const, subs: ["Gym", "Pharmacy", "Doctor", "Dental", "Vision"] },
      { name: "House", icon: "home", color: "#7c3aed", type: "expense" as const, subs: ["Rent", "Mortgage", "Maintenance", "Furniture", "Appliances"] },
      { name: "Insurance", icon: "shield", color: "#475569", type: "expense" as const, subs: ["Health", "Auto", "Home", "Life"] },
      { name: "Investments", icon: "trending-up", color: "#059669", type: "income" as const, subs: ["Stocks", "Bonds", "Crypto", "Mutual Funds"] },
      { name: "Kids Care", icon: "smile", color: "#f472b6", type: "expense" as const, subs: ["School", "Toys", "Clothing", "Activities"] },
      { name: "Loan & Debts", icon: "credit-card", color: "#dc2626", type: "expense" as const, subs: ["Student Loan", "Car Loan", "Credit Card", "Personal Loan"] },
      { name: "Misc Expenses", icon: "more-horizontal", color: "#fbbf24", type: "expense" as const, subs: ["Other", "Uncategorized"] },
      { name: "Office & Business", icon: "briefcase", color: "#0284c7", type: "expense" as const, subs: ["Supplies", "Software", "Equipment", "Travel"] },
      { name: "Others", icon: "grid", color: "#94a3b8", type: "both" as const, subs: [] },
      { name: "Personal Care", icon: "scissors", color: "#db2777", type: "expense" as const, subs: ["Salon", "Spa", "Skincare", "Cosmetics"] },
      { name: "Pet Care", icon: "github", color: "#84cc16", type: "expense" as const, subs: ["Food", "Vet", "Grooming", "Supplies"] },
      { name: "Refunds", icon: "rotate-ccw", color: "#22c55e", type: "income" as const, subs: [] },
      { name: "Shopping", icon: "shopping-bag", color: "#a855f7", type: "expense" as const, subs: ["Clothing", "Electronics", "Online", "Home Decor"] },
      { name: "Taxes", icon: "percent", color: "#78716c", type: "expense" as const, subs: ["Income Tax", "Property Tax", "Sales Tax"] },
      { name: "Transfer", icon: "repeat", color: "#6b7280", type: "both" as const, subs: [] },
      { name: "Transport", icon: "navigation", color: "#0ea5e9", type: "expense" as const, subs: ["Gas", "Parking", "Public Transit", "Ride Share", "Car Maintenance"] },
      { name: "Travel & Vacation", icon: "map", color: "#f59e0b", type: "expense" as const, subs: ["Flights", "Hotels", "Activities", "Food", "Transport"] },
      // Income categories
      { name: "Salary", icon: "briefcase", color: "#10b981", type: "income" as const, subs: [] },
      { name: "Freelance", icon: "cpu", color: "#06b6d4", type: "income" as const, subs: [] },
      { name: "Business", icon: "bar-chart-2", color: "#8b5cf6", type: "income" as const, subs: [] },
      { name: "Gift Received", icon: "gift", color: "#f43f5e", type: "income" as const, subs: [] },
    ];

    const rows: any[] = [];
    for (const cat of defaults) {
      const catId = genId();
      rows.push({
        id: catId,
        householdId,
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        iconType: "icon",
        color: cat.color,
        parentId: null,
        isDefault: true,
      });
      for (const sub of cat.subs) {
        rows.push({
          id: genId(),
          householdId,
          name: sub,
          type: cat.type,
          icon: cat.icon,
          iconType: "icon",
          color: cat.color,
          parentId: catId,
          isDefault: true,
        });
      }
    }

    await db.insert(categoriesTable).values(rows);
    res.status(201).json({ seeded: true, count: rows.length });
  } catch (err: any) {
    // If table doesn't exist, create it hint
    if (err?.cause?.code === "42P01" || /relation .* does not exist/.test(err?.message ?? "")) {
      res.status(500).json({ error: "Categories table not yet migrated. Run migrations first." });
      return;
    }
    req.log.error({ err }, "Failed to seed categories");
    res.status(500).json({ error: "Failed to seed categories" });
  }
});

export default router;
