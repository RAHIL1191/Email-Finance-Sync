import { Router } from "express";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { requireHouseholdId } from "../middlewares/validate.js";
import { z } from "zod";

const router = Router();

router.use(requireHouseholdId);

const ReviewRequestSchema = z.object({
  transactions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      merchant: z.string().optional(),
      amount: z.number(),
      type: z.enum(["income", "expense"]),
      category: z.string(),
      date: z.string(),
      bank: z.string().optional(),
      note: z.string().optional(),
    })
  ),
  thresholdAmount: z.number().optional().default(50),
  currency: z.string().optional().default("CAD"),
  windowDays: z.number().optional().default(90),
});

/** POST /api/ai/review — analyze recent transactions above a threshold */
router.post("/ai/review", async (req, res) => {
  const parsed = ReviewRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    return;
  }

  const { transactions, thresholdAmount, currency, windowDays } = parsed.data;

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const bigExpenses = transactions
    .filter((t) => t.type === "expense" && t.amount >= thresholdAmount && t.date >= cutoff)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);

  if (bigExpenses.length === 0) {
    res.json({
      summary: `No expenses over ${currency} $${thresholdAmount} found in the last ${windowDays} days.`,
      reviews: [],
      overallScore: null,
    });
    return;
  }

  const totalSpend = bigExpenses.reduce((s, t) => s + t.amount, 0);
  const txList = bigExpenses
    .map(
      (t, i) =>
        `${i + 1}. ${t.merchant || t.title} — ${currency} $${t.amount.toFixed(2)} on ${t.date} (${t.category}${t.bank ? `, ${t.bank}` : ""})`
    )
    .join("\n");

  const prompt = `You are a personal finance advisor reviewing a Canadian household's recent transactions. Analyze these ${bigExpenses.length} larger purchases (over ${currency} $${thresholdAmount}) from the past ${windowDays} days totalling ${currency} $${totalSpend.toFixed(2)}.

Transactions:
${txList}

For each transaction, provide:
- A short verdict: "Good spend", "Reasonable", "Worth reviewing", or "Consider cutting"
- A 1-sentence reason (be specific, practical, and friendly — not preachy)
- A deal score out of 10 (10 = excellent value, 1 = poor value)

Then provide:
- A 2-3 sentence overall spending summary with your top actionable tip
- An overall score out of 10

Respond ONLY with valid JSON in this exact format:
{
  "reviews": [
    { "id": "<transaction_id>", "verdict": "...", "reason": "...", "score": <number> }
  ],
  "summary": "...",
  "overallScore": <number>,
  "topTip": "..."
}`;

  try {
    const model = process.env.AI_MODEL ?? "meta-llama/llama-3.3-70b-instruct";
    const completion = await openrouter.chat.completions.create({
      model,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ raw }, "AI response did not contain JSON");
      res.status(502).json({ error: "AI returned an unexpected response format" });
      return;
    }

    let parsed2: { reviews: any[]; summary: string; overallScore: number; topTip?: string };
    try {
      parsed2 = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      req.log.error({ raw, parseErr }, "Failed to parse AI JSON");
      res.status(502).json({ error: "Could not parse AI response" });
      return;
    }

    const reviewMap = new Map(parsed2.reviews.map((r: any) => [r.id, r]));

    const enrichedReviews = bigExpenses.map((t) => {
      const review = reviewMap.get(t.id) as any;
      return {
        transaction: t,
        verdict: review?.verdict ?? "Reasonable",
        reason: review?.reason ?? "",
        score: review?.score ?? 5,
      };
    });

    res.json({
      summary: parsed2.summary ?? "",
      topTip: parsed2.topTip ?? "",
      overallScore: parsed2.overallScore ?? null,
      reviews: enrichedReviews,
      thresholdAmount,
      currency,
      windowDays,
      totalSpend,
    });
  } catch (err) {
    req.log.error({ err }, "AI review failed");
    res.status(500).json({ error: "AI review request failed" });
  }
});

export default router;
