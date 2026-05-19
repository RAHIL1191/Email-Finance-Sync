import * as FileSystem from "expo-file-system/src/legacy/FileSystem";
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
  const { transactions, accounts, bills, monthlyIncome, monthlyExpense, householdId, deviceId } = useApp();

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
          "You are a helpful personal finance assistant. Answer concisely." +
          "\n\nUser financial data:\n" + financialContext;
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

        await llamaCtxRef.current.completion(
          { prompt, n_predict: 512, temperature: 0.7, stop: [END, USR] },
          (data: { token: string }) => { onToken(data.token); }
        );
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
    [mode, householdId, deviceId]
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
