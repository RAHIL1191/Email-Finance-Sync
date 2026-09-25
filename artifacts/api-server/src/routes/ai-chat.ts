import { Router } from "express";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { requireHouseholdId } from "../middlewares/validate.js";
import { z } from "zod";
import {
  getCategorySpendingTotal,
  queryTransactions,
  getNetWorthBreakdown,
  getMonthlyBudgetOverview,
  getBillsOverview,
  searchCheaperPrice
} from "../services/agentTools.js";

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

// Define standard OpenAI-style function schemas for OpenRouter
const tools = [
  {
    type: "function" as const,
    function: {
      name: "getCategorySpendingTotal",
      description: "Calculate the exact total spent in a given category over a date range.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "The spending category name (case-insensitive)." },
          startDate: { type: "string", description: "Optional start date in YYYY-MM-DD format." },
          endDate: { type: "string", description: "Optional end date in YYYY-MM-DD format." }
        },
        required: ["category"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "queryTransactions",
      description: "Query and filter detailed transaction history across all time.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional category filter." },
          startDate: { type: "string", description: "Optional start date (YYYY-MM-DD)." },
          endDate: { type: "string", description: "Optional end date (YYYY-MM-DD)." },
          minAmount: { type: "number", description: "Optional minimum amount." },
          maxAmount: { type: "number", description: "Optional maximum amount." },
          limit: { type: "number", description: "Optional max result limit (default 50)." }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "getNetWorthBreakdown",
      description: "Retrieve your up-to-date account balances, total assets, total liabilities, and net worth.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "getMonthlyBudgetOverview",
      description: "Retrieve budget limits compared against actual spent amount for each category in a given month.",
      parameters: {
        type: "object",
        properties: {
          monthKey: { type: "string", description: "Optional month filter in YYYY-MM format." }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "getBillsOverview",
      description: "Retrieve a list of upcoming or paid bills.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["paid", "unpaid"], description: "Optional filter for bill status." }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "searchCheaperPrice",
      description: "Compare your purchase price against cheaper retail price listings online to find savings.",
      parameters: {
        type: "object",
        properties: {
          productName: { type: "string", description: "The product name to search online." },
          purchasePrice: { type: "number", description: "The price you currently paid for comparison." }
        },
        required: ["productName", "purchasePrice"]
      }
    }
  }
];

/** POST /api/ai/chat — conversational financial assistant with agent tool calling */
router.post("/ai/chat", async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    return;
  }

  const { messages, financialContext } = parsed.data;
  const householdId = res.locals.householdId;

  const systemContent = [
    "You are a helpful personal finance assistant for FinTrack, a household budgeting app.",
    "Help users understand their spending, transactions, bills, accounts, and savings habits.",
    "Be friendly, concise, and mathematically exact based on the database data.",
    "You have access to powerful read-only tools to query the user's database and check cheaper prices online.",
    "If the user asks about their spending in specific categories, transactions, bills, or net worth, ALWAYS run the corresponding tool to get correct, live numbers instead of guessing.",
    "When amounts are involved, always format them with a currency sign.",
    financialContext
      ? `\n\nThe user's current basic local snapshot (use if no specific tool query is needed):\n${financialContext}`
      : "",
  ]
    .join(" ")
    .trim();

  try {
    const model = process.env.AI_MODEL ?? "meta-llama/llama-3.3-70b-instruct";
    
    // First completion call (LMM decides whether to call a tool)
    const completion = await openrouter.chat.completions.create({
      model,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemContent },
        ...messages,
      ],
      tools,
    });

    const choice = completion.choices[0];
    const message = choice?.message;

    // Check if the model requested one or more tool calls
    if (message?.tool_calls && message.tool_calls.length > 0) {
      req.log.info({ tool_calls: message.tool_calls.map((tc: any) => tc.function.name) }, "AI Agent executing tool calls");
      
      const secondMessages = [
        { role: "system", content: systemContent } as any,
        ...messages,
        message, // Include assistant's tool call request
      ];

      for (const call of message.tool_calls) {
        const { name, arguments: argsString } = (call as any).function;
        let args: any = {};
        try {
          args = JSON.parse(argsString);
        } catch {}

        let toolResult: any;
        try {
          switch (name) {
            case "getCategorySpendingTotal":
              toolResult = await getCategorySpendingTotal(householdId, args.category, args.startDate, args.endDate);
              break;
            case "queryTransactions":
              toolResult = await queryTransactions(householdId, args);
              break;
            case "getNetWorthBreakdown":
              toolResult = await getNetWorthBreakdown(householdId);
              break;
            case "getMonthlyBudgetOverview":
              toolResult = await getMonthlyBudgetOverview(householdId, args.monthKey);
              break;
            case "getBillsOverview":
              toolResult = await getBillsOverview(householdId, args.status);
              break;
            case "searchCheaperPrice":
              toolResult = await searchCheaperPrice(args.productName, args.purchasePrice);
              break;
            default:
              toolResult = { error: `Tool ${name} not found.` };
          }
        } catch (e: any) {
          req.log.error({ err: e, tool: name }, "AI Agent tool execution failed");
          toolResult = { error: `Failed to execute tool ${name}: ${e.message}` };
        }

        secondMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Complete the final request using the tool results context
      const secondCompletion = await openrouter.chat.completions.create({
        model,
        max_tokens: 1024,
        temperature: 0.7,
        messages: secondMessages,
      });

      const finalContent = secondCompletion.choices[0]?.message?.content ?? "";
      res.json({ content: finalContent });
      return;
    }

    const content = message?.content ?? "";
    res.json({ content });
  } catch (err) {
    req.log.error({ err }, "AI chat failed");
    res.status(500).json({ error: "AI chat request failed" });
  }
});

export default router;
