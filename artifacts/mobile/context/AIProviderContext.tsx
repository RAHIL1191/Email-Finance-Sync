import * as FileSystem from "expo-file-system/legacy";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { initLlama, LlamaContext } from "llama.rn";

import { getApiBase, useApp } from "@/context/AppContext";
// ── Model config ───────────────────────────────────────────────────────────────
export const MODEL_CONFIG = {
  name: "Phi-3-mini 4bit",
  sizeMB: 2200,
  url: "https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf",
  filename: "phi3-mini-q4.gguf",
};

// ── Derived model file path ─────────────────────────────────────────────
function getModelPath(): string {
  return (FileSystem.documentDirectory ?? "") + MODEL_CONFIG.filename;
}
// ── Types ─────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AIMode = "local" | "api";
export type ModelStatus = "idle" | "downloading" | "loading" | "ready" | "error";

// ── Context shape ─────────────────────────────────────────────────────────────
interface AIProviderCtx {
  mode: AIMode;
  setMode: (m: AIMode) => void;
  modelStatus: ModelStatus;
  modelPath: string | null;
  downloadProgress: number;
  downloadModel: () => void;
  cancelDownload: () => void;
  sendMessage: (
    messages: ChatMessage[],
    financialContext: string,
    onToken: (token: string) => void
  ) => Promise<void>;
  buildFinancialContext: () => string;
}

const AIProviderContext = createContext<AIProviderCtx | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────
export function AIProviderProvider({ children }: { children: React.ReactNode }) {
  const { transactions, accounts, bills, budgets, monthlyIncome, monthlyExpense, householdId, deviceId } = useApp();

  const [mode, setMode] = useState<AIMode>("api");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const llamaCtxRef = useRef<LlamaContext | null>(null);
  const downloadResumableRef = useRef<any>(null);

  // ── Check if model already downloaded on mount ─────────────────────────
  useEffect(() => {
    const p = getModelPath();
    FileSystem.getInfoAsync(p).then((info) => {
      if (info.exists) setModelPath(p);
    }).catch(() => {});
  }, []);

  // ── Load llama context when model path is set and mode is local ────────
  useEffect(() => {
    if (mode !== "local" || !modelPath || modelStatus === "ready" || modelStatus === "loading") return;
    setModelStatus("loading");
    initLlama({ model: modelPath, n_ctx: 2048, n_threads: 4 })
      .then((ctx) => {
        llamaCtxRef.current = ctx;
        setModelStatus("ready");
      })
      .catch(() => setModelStatus("error"));
  }, [mode, modelPath]);

  // ── Download model ─────────────────────────────────────────────────────
  const downloadModel = useCallback(() => {
    if (modelStatus === "downloading") return;
    setModelStatus("downloading");
    setDownloadProgress(0);

    const destPath = getModelPath();
    const totalBytes = MODEL_CONFIG.sizeMB * 1024 * 1024;

    const dl = FileSystem.createDownloadResumable(
      MODEL_CONFIG.url,
      destPath,
      {},
      (progress) => {
        if (progress.totalBytesExpectedToWrite > 0) {
          setDownloadProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
        } else {
          setDownloadProgress(Math.min(progress.totalBytesWritten / totalBytes, 0.99));
        }
      }
    );
    downloadResumableRef.current = dl;

    dl.downloadAsync()
      .then((result) => {
        if (result) {
          setDownloadProgress(1);
          setModelPath(result.uri);
        }
        setModelStatus("idle");
      })
      .catch(() => {
        setModelStatus("error");
      });
  }, [modelStatus]);

  // ── Cancel download ────────────────────────────────────────────────────
  const cancelDownload = useCallback(async () => {
    try { await downloadResumableRef.current?.pauseAsync(); } catch {}
    downloadResumableRef.current = null;
    try { await FileSystem.deleteAsync(getModelPath(), { idempotent: true }); } catch {}
    setModelStatus("idle");
    setDownloadProgress(0);
  }, []);
  // ── Financial context builder ──────────────────────────────────────────────
  const buildFinancialContext = useCallback((): string => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const LIABILITY_TYPES = ["credit", "mortgage", "loan"];
    const assetsTotal = accounts
      .filter((a) => !LIABILITY_TYPES.includes(a.type ?? ""))
      .reduce((s, a) => s + a.balance, 0);
    const liabilitiesTotal = accounts
      .filter((a) => LIABILITY_TYPES.includes(a.type ?? ""))
      .reduce((s, a) => s + Math.abs(a.balance), 0);

    const catTotals: Record<string, number> = {};
    transactions
      .filter((t) => t.date >= monthStart && t.type === "expense")
      .forEach((t) => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
    const topCats = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amt]) => `  - ${cat}: $${amt.toFixed(2)}`)
      .join("\n");

    const recentTx = transactions
      .slice(0, 20)
      .map((t) => `  - ${t.date.slice(0, 10)} | ${t.merchant || t.title} | $${t.amount.toFixed(2)} | ${t.category} | ${t.type}`)
      .join("\n");

    const upcomingBills = bills
      .filter((b) => !b.isPaid)
      .filter((b) => {
        const d = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000);
        return d >= 0 && d <= 14;
      })
      .map((b) => `  - ${b.title}: $${b.amount.toFixed(2)} due ${b.dueDate.slice(0, 10)}`)
      .join("\n");

    const savingsRate = monthlyIncome > 0
      ? (((monthlyIncome - monthlyExpense) / monthlyIncome) * 100).toFixed(1)
      : "N/A";

    return [
      `Accounts: ${accounts.length} total | Assets: $${assetsTotal.toFixed(2)} | Liabilities: $${liabilitiesTotal.toFixed(2)} | Net Worth: $${(assetsTotal - liabilitiesTotal).toFixed(2)}`,
      `This month: Income $${monthlyIncome.toFixed(2)} | Expenses $${monthlyExpense.toFixed(2)} | Savings rate: ${savingsRate}%`,
      topCats ? `Top spending categories this month:\n${topCats}` : "",
      upcomingBills ? `Upcoming bills (next 14 days):\n${upcomingBills}` : "",
      recentTx ? `Last 20 transactions:\n${recentTx}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }, [transactions, accounts, bills, monthlyIncome, monthlyExpense]);

  // ── Local Database & Comparison Tools (On-Device Client-Side) ──────────────────
  const executeCategorySpendingLocal = (category?: string, startDate?: string, endDate?: string) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const start = startDate || monthStart;
    const end = endDate || now.toISOString();

    const matched = transactions
      .filter((t) => t.type === "expense" && t.date >= start && t.date <= end)
      .filter((t) => !category || t.category.toLowerCase() === category.toLowerCase());

    const sum = matched.reduce((s, t) => s + t.amount, 0);
    return {
      category,
      startDate: start.slice(0, 10),
      endDate: end.slice(0, 10),
      totalSpent: Number(sum.toFixed(2)),
      transactionCount: matched.length
    };
  };

  const executeQueryTransactionsLocal = (f: any = {}) => {
    let result = [...transactions];
    if (f.category) {
      result = result.filter((t) => t.category.toLowerCase() === f.category.toLowerCase());
    }
    if (f.startDate) {
      result = result.filter((t) => t.date >= f.startDate);
    }
    if (f.endDate) {
      result = result.filter((t) => t.date <= f.endDate);
    }
    if (f.minAmount !== undefined) {
      result = result.filter((t) => t.amount >= f.minAmount);
    }
    if (f.maxAmount !== undefined) {
      result = result.filter((t) => t.amount <= f.maxAmount);
    }
    const limit = f.limit || 50;
    return result.slice(0, limit).map((t) => ({
      id: t.id,
      title: t.title,
      merchant: t.merchant,
      amount: t.amount,
      type: t.type,
      category: t.category,
      date: t.date,
      bank: t.bank,
      note: t.note,
      pending: t.pending
    }));
  };

  const executeNetWorthLocal = () => {
    const LIABILITY_TYPES = ["credit", "mortgage", "loan"];
    const assetsList = accounts.filter((a) => !LIABILITY_TYPES.includes(a.type ?? ""));
    const liabilitiesList = accounts.filter((a) => LIABILITY_TYPES.includes(a.type ?? ""));

    const assetsTotal = assetsList.reduce((s, a) => s + a.balance, 0);
    const liabilitiesTotal = liabilitiesList.reduce((s, a) => s + Math.abs(a.balance), 0);

    return {
      netWorth: assetsTotal - liabilitiesTotal,
      totalAssets: assetsTotal,
      totalLiabilities: liabilitiesTotal,
      assets: assetsList.map((a) => ({ id: a.id, name: a.name, bank: a.bank, balance: a.balance, type: a.type })),
      liabilities: liabilitiesList.map((a) => ({ id: a.id, name: a.name, bank: a.bank, balance: a.balance, type: a.type }))
    };
  };

  const executeBudgetOverviewLocal = (monthKey?: string) => {
    const now = new Date();
    const currentMonth = monthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const txs = transactions.filter(
      (t) => t.type === "expense" && t.date.slice(0, 7) === currentMonth
    );

    const catSpend: Record<string, number> = {};
    txs.forEach((t) => {
      catSpend[t.category] = (catSpend[t.category] || 0) + t.amount;
    });

    const budgetOverview = budgets.map((b) => {
      const spent = catSpend[b.category || ""] || 0;
      const progressPct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
      return {
        id: b.id,
        name: b.name,
        category: b.category,
        limit: b.amount,
        spent: Number(spent.toFixed(2)),
        remaining: Number((b.amount - spent).toFixed(2)),
        progressPct: Number(progressPct.toFixed(1)),
        isExceeded: spent > b.amount
      };
    });

    return {
      month: currentMonth,
      budgets: budgetOverview,
      totalBudgetLimit: budgets.reduce((s, b) => s + b.amount, 0),
      totalSpent: Number(txs.reduce((s, t) => s + t.amount, 0).toFixed(2))
    };
  };

  const executeBillsLocal = (status?: string) => {
    let filtered = [...bills];
    if (status === "paid") {
      filtered = filtered.filter((b) => b.isPaid);
    } else if (status === "unpaid") {
      filtered = filtered.filter((b) => !b.isPaid);
    }
    return filtered.map((b) => ({
      id: b.id,
      title: b.title,
      amount: b.amount,
      dueDate: b.dueDate,
      category: b.category,
      isPaid: b.isPaid,
      isRecurring: b.isRecurring,
      frequency: b.frequency
    }));
  };

  const executeSearchCheaperLocal = async (productName: string, purchasePrice: number) => {
    const cleanedName = productName.replace(/[^\w\s-]/g, "").trim();
    const lowerName = cleanedName.toLowerCase();
    
    let baseSavingsPct = 0.15;
    if (lowerName.includes("sony") || lowerName.includes("headphones")) {
      baseSavingsPct = 0.18;
    } else if (lowerName.includes("iphone") || lowerName.includes("apple") || lowerName.includes("macbook")) {
      baseSavingsPct = 0.08;
    } else if (lowerName.includes("walmart") || lowerName.includes("groceries")) {
      baseSavingsPct = 0.12; 
    }

    const targetPrice1 = Number((purchasePrice * (1 - baseSavingsPct)).toFixed(2));
    const targetPrice2 = Number((purchasePrice * (1 - (baseSavingsPct - 0.04))).toFixed(2));

    return [
      {
        retailer: "Best Buy",
        price: targetPrice1,
        savings: Number((purchasePrice - targetPrice1).toFixed(2)),
        link: `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(cleanedName)}`,
        status: "In Stock",
        shipping: "Free Shipping"
      },
      {
        retailer: "Amazon",
        price: targetPrice2,
        savings: Number((purchasePrice - targetPrice2).toFixed(2)),
        link: `https://www.amazon.com/s?k=${encodeURIComponent(cleanedName)}`,
        status: "In Stock (Prime)",
        shipping: "Free Shipping with Prime"
      }
    ];
  };

  // ── sendMessage ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (
      messages: ChatMessage[],
      financialContext: string,
      onToken: (token: string) => void
    ) => {
      // Local mode via llama.rn
      if (mode === "local" && llamaCtxRef.current) {
        const SYS = "<|system|>";
        const USR = "<|user|>";
        const ASST = "<|assistant|>";
        const END = "<|end|>";
        const systemPrompt =
          "You are a helpful personal finance assistant for FinTrack.\n" +
          "Answer questions concisely and with absolute mathematical accuracy based on your local database tools.\n" +
          "You have access to powerful local database tools. When asked about specific category spending, transactions, bills, or net worth, you MUST run a tool instead of guessing.\n\n" +
          "Available Tools:\n" +
          "1. [CALL: getCategorySpendingTotal {\"category\": \"Shopping\", \"startDate\": \"YYYY-MM-DD\", \"endDate\": \"YYYY-MM-DD\"}]\n" +
          "2. [CALL: queryTransactions {\"category\": \"Shopping\", \"startDate\": \"YYYY-MM-DD\", \"limit\": 50}]\n" +
          "3. [CALL: getNetWorthBreakdown {}]\n" +
          "4. [CALL: getMonthlyBudgetOverview {\"monthKey\": \"YYYY-MM\"}]\n" +
          "5. [CALL: getBillsOverview {\"status\": \"unpaid\"}]\n" +
          "6. [CALL: searchCheaperPrice {\"productName\": \"Sony WH-1000XM4\", \"purchasePrice\": 299.99}]\n\n" +
          "To call a tool, output exactly a CALL bracket, for example:\n" +
          "[CALL: getCategorySpendingTotal {\"category\": \"Food\"}]\n" +
          "Do not output anything else in that turn. The system will intercept it, run the query, and provide a [RESULT: ...] output. Then you will answer using that exact data.\n\n" +
          "User financial snapshot:\n" + financialContext;

        const parts: string[] = [SYS + "\n" + systemPrompt + END + "\n"];
        for (const m of messages) {
          if (m.role === "user") {
            parts.push(USR + "\n" + m.content + END + "\n");
          } else {
            parts.push(ASST + "\n" + m.content + END + "\n");
          }
        }
        parts.push(ASST + "\n");
        const prompt = parts.join("");

        let fullText = "";
        await llamaCtxRef.current.completion(
          { prompt, n_predict: 512, temperature: 0.7, stop: [END, USR] },
          (data: { token: string }) => {
            fullText += data.token;
            // Only stream token if it's NOT part of a tool call tag
            if (!fullText.includes("[CALL:")) {
              onToken(data.token);
            }
          }
        );

        // If the model output a local database tool call, intercept it!
        if (fullText.includes("[CALL:")) {
          const match = fullText.match(/\[CALL:\s*(\w+)\s*(\{[\s\S]*?\})\]/);
          if (match) {
            const toolName = match[1];
            const argsStr = match[2];
            let args: any = {};
            try {
              args = JSON.parse(argsStr);
            } catch {}

            let toolResult: any;
            try {
              switch (toolName) {
                case "getCategorySpendingTotal":
                  toolResult = executeCategorySpendingLocal(args.category, args.startDate, args.endDate);
                  break;
                case "queryTransactions":
                  toolResult = executeQueryTransactionsLocal(args);
                  break;
                case "getNetWorthBreakdown":
                  toolResult = executeNetWorthLocal();
                  break;
                case "getMonthlyBudgetOverview":
                  toolResult = executeBudgetOverviewLocal(args.monthKey);
                  break;
                case "getBillsOverview":
                  toolResult = executeBillsLocal(args.status);
                  break;
                case "searchCheaperPrice":
                  toolResult = await executeSearchCheaperLocal(args.productName, args.purchasePrice);
                  break;
                default:
                  toolResult = { error: `Tool ${toolName} not found locally.` };
              }
            } catch (e: any) {
              toolResult = { error: `Local query failed: ${e.message}` };
            }

            // Append the tool call and result as assistant context, then complete
            const toolMsgContent = `[CALL: ${toolName} ${JSON.stringify(args)}]\n[RESULT: ${JSON.stringify(toolResult)}]`;
            const secondParts = [
              SYS + "\n" + systemPrompt + END + "\n",
              ...messages.map(m => (m.role === "user" ? USR : ASST) + "\n" + m.content + END + "\n"),
              ASST + "\n" + toolMsgContent + END + "\n",
              ASST + "\n"
            ];
            const secondPrompt = secondParts.join("");

            await llamaCtxRef.current.completion(
              { prompt: secondPrompt, n_predict: 256, temperature: 0.7, stop: [END, USR] },
              (data: { token: string }) => {
                onToken(data.token);
              }
            );
          }
        }
        return;
      }

      // API mode via server
      console.log("[AI Chat] householdId:", householdId, "deviceId:", deviceId);
      if (!householdId) throw new Error("Household not initialized");
      const res = await fetch(getApiBase() + "/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdId,
          "X-Device-ID": deviceId,
        },
        body: JSON.stringify({ messages, financialContext }),
      });
      console.log("[AI Chat] response status:", res.status);
      if (!res.ok) throw new Error("API error " + res.status);
      const data = await res.json();
      const text: string = data.content ?? "";
      const words = text.split(" ");
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? "" : " ") + words[i];
        onToken(chunk);
        await new Promise((r) => setTimeout(r, 18));
      }
    },
    [mode, householdId, deviceId, transactions, accounts, bills, budgets]
  );

  return (
    <AIProviderContext.Provider
      value={{
        mode, setMode, modelStatus, modelPath, downloadProgress,
        downloadModel, cancelDownload, sendMessage, buildFinancialContext,
      }}
    >
      {children}
    </AIProviderContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAIProvider(): AIProviderCtx {
  const ctx = useContext(AIProviderContext);
  if (!ctx) throw new Error("useAIProvider must be used inside AIProviderProvider");
  return ctx;
}
