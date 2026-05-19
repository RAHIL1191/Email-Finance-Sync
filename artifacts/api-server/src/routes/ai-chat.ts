import { Router } from "express";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { requireHouseholdId } from "../middlewares/validate.js";
import { z } from "zod";

const router = Router();
router.use(requireHouseholdId);

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  financialContext: z.string().optional().default(""),
});

/** POST /api/ai/chat — conversational financial assistant */
router.post("/ai/chat", async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    return;
  }

  const { messages, financialContext } = parsed.data;

  const systemContent = [
    "You are a helpful personal finance assistant for FinTrack, a household budgeting app.",
    "Help users understand their spending, transactions, bills, accounts, and savings habits.",
    "Be concise (2-4 sentences unless a list is more useful), friendly, and specific to their data.",
    "When amounts are involved, always use the currency the user provides.",
    financialContext
      ? `\n\nThe user's current financial snapshot:\n${financialContext}`
      : "",
  ]
    .join(" ")
    .trim();

  try {
    const model = process.env.AI_MODEL ?? "meta-llama/llama-3.3-70b-instruct";
    const completion = await openrouter.chat.completions.create({
      model,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemContent },
        ...messages,
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    res.json({ content });
  } catch (err) {
    req.log.error({ err }, "AI chat failed");
    res.status(500).json({ error: "AI chat request failed" });
  }
});

export default router;
