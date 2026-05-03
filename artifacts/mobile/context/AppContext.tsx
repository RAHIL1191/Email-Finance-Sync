import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface Transaction {
  id: string;
  title: string;
  merchant?: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  accountId: string;
  date: string;
  /** "plaid" | "email" | "manual" */
  source?: "plaid" | "email" | "manual";
  /** @deprecated use source === "email" */
  fromEmail?: boolean;
  bank?: string;
  note?: string;
}

export interface Account {
  id: string;
  name: string;
  bank: string;
  balance: number;
  type: "checking" | "savings" | "credit" | "investment";
  color: string;
  lastFour?: string;
  currency?: string;
  /** When false, this account is excluded from net worth. Defaults to true. */
  includeInNetworth?: boolean;
  /** Whether this is a joint account shared with another person */
  isJoint?: boolean;
  /** Set when this account was imported via Plaid */
  plaidItemId?: string;
  plaidAccountId?: string;
}

export interface Bill {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  category: string;
  isPaid: boolean;
  isRecurring: boolean;
  frequency?: "weekly" | "monthly" | "yearly";
  accountId?: string;
}

export interface EmailSync {
  email: string;
  appPassword: string;
  isConnected: boolean;
  lastSynced?: string;
  lastEmailsScanned?: number;
  lastImported?: number;
}

export interface PlaidItem {
  itemId: string;
  bankName: string;
  bankColor: string;
  connectedAt: string;
  lastSynced?: string;
  lastImported?: number;
  accountIds: string[];
}

export interface PlaidSync {
  items: PlaidItem[];
}

interface AppContextType {
  transactions: Transaction[];
  accounts: Account[];
  bills: Bill[];
  emailSync: EmailSync;
  plaidSync: PlaidSync;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, t: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (a: Omit<Account, "id"> & { forceCreate?: boolean }) => string;
  remapEmailTransactions: (bankPattern: string, accountId: string) => void;
  updateAccount: (id: string, a: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  addBill: (b: Omit<Bill, "id">) => void;
  updateBill: (id: string, b: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  markBillPaid: (id: string) => void;
  connectEmail: (email: string, appPassword: string) => Promise<{ success: boolean; error?: string }>;
  disconnectEmail: () => void;
  resetEmailTransactions: () => void;
  syncEmailTransactions: () => Promise<{ imported: number; error?: string }>;
  connectPlaid: (item: PlaidItem, newAccounts: Omit<Account, "id">[], initialTransactions: Omit<Transaction, "id">[]) => Promise<{ imported: number }>;
  syncPlaidTransactions: (itemId: string) => Promise<{ imported: number; error?: string }>;
  disconnectPlaid: (itemId: string) => void;
  isSyncing: boolean;
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  deviceId: string;
  householdId: string;
  changeHouseholdId: (code: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  transactions: "@fintrack/transactions",
  accounts: "@fintrack/accounts",
  bills: "@fintrack/bills",
  emailSync: "@fintrack/emailSync",
  plaidSync: "@fintrack/plaidSync",
  deviceId: "@fintrack/deviceId",
  householdId: "@fintrack/householdId",
};

const SAMPLE_ACCOUNTS: Account[] = [
  { id: "acc1", name: "Main Checking", bank: "Chase Bank", balance: 4820.5, type: "checking", color: "#1a56db", lastFour: "4521" },
  { id: "acc2", name: "Savings", bank: "Chase Bank", balance: 12340.0, type: "savings", color: "#10b981", lastFour: "9834" },
  { id: "acc3", name: "Credit Card", bank: "Amex", balance: -1250.75, type: "credit", color: "#f59e0b", lastFour: "3301" },
];

const SAMPLE_TRANSACTIONS: Transaction[] = [
  { id: "t1", title: "Amazon Purchase", amount: 89.99, type: "expense", category: "Shopping", accountId: "acc1", date: new Date(Date.now() - 86400000).toISOString(), source: "manual" },
  { id: "t2", title: "Salary Deposit", amount: 3500.0, type: "income", category: "Income", accountId: "acc1", date: new Date(Date.now() - 2 * 86400000).toISOString(), source: "manual" },
  { id: "t3", title: "Netflix Subscription", amount: 15.99, type: "expense", category: "Entertainment", accountId: "acc3", date: new Date(Date.now() - 3 * 86400000).toISOString(), source: "manual" },
  { id: "t4", title: "Whole Foods", amount: 127.4, type: "expense", category: "Groceries", accountId: "acc1", date: new Date(Date.now() - 4 * 86400000).toISOString(), source: "manual" },
  { id: "t5", title: "Gas Station", amount: 55.0, type: "expense", category: "Transport", accountId: "acc1", date: new Date(Date.now() - 8 * 86400000).toISOString(), source: "manual" },
];

const SAMPLE_BILLS: Bill[] = [
  { id: "b1", title: "Rent", amount: 2200, dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), category: "Housing", isPaid: false, isRecurring: true, frequency: "monthly", accountId: "acc1" },
  { id: "b2", title: "Electric Bill", amount: 145, dueDate: new Date(Date.now() + 10 * 86400000).toISOString(), category: "Utilities", isPaid: false, isRecurring: true, frequency: "monthly", accountId: "acc1" },
  { id: "b3", title: "Internet", amount: 79.99, dueDate: new Date(Date.now() + 3 * 86400000).toISOString(), category: "Utilities", isPaid: false, isRecurring: true, frequency: "monthly" },
  { id: "b4", title: "Car Insurance", amount: 210, dueDate: new Date(Date.now() - 2 * 86400000).toISOString(), category: "Insurance", isPaid: true, isRecurring: true, frequency: "monthly", accountId: "acc1" },
  { id: "b5", title: "Gym Membership", amount: 49.99, dueDate: new Date(Date.now() + 15 * 86400000).toISOString(), category: "Health", isPaid: false, isRecurring: true, frequency: "monthly" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function generateDeviceId() {
  return "dev_" + genId() + "_" + Date.now().toString(36);
}

const HOUSEHOLD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateHouseholdCode(): string {
  return Array.from(
    { length: 6 },
    () => HOUSEHOLD_CHARS[Math.floor(Math.random() * HOUSEHOLD_CHARS.length)]
  ).join("");
}

export function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "http://localhost:80";
}

async function apiCall(
  path: string,
  method: string,
  householdId: string,
  deviceId: string,
  body?: unknown
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${getApiBase()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Household-ID": householdId,
        "X-Device-ID": deviceId,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}

/** Canonical dedup key shared across all sync sources */
function dedupKey(t: { amount: number; title: string; date: string }) {
  return `${t.amount}-${t.title.toLowerCase().trim()}-${t.date.slice(0, 10)}`;
}

/** Find the best matching account for a bank name and optional last-4 digits */
function findAccountMatch(
  accounts: Account[],
  bank: string,
  lastFour?: string
): Account | undefined {
  const bankLower = bank.trim().toLowerCase();
  const bankMatches = (a: Account) =>
    a.bank.toLowerCase().includes(bankLower) || bankLower.includes(a.bank.toLowerCase());
  if (lastFour) {
    const strict = accounts.find((a) => a.lastFour === lastFour && bankMatches(a));
    if (strict) return strict;
  }
  if (lastFour) {
    const byLastFour = accounts.find((a) => a.lastFour === lastFour);
    if (byLastFour) return byLastFour;
  }
  return accounts.find(bankMatches);
}

function remapEmailTransactionsForAccount(
  transactions: Transaction[],
  account: Account
): Transaction[] {
  if (!account.bank && !account.lastFour) return transactions;
  const bankLower = account.bank.trim().toLowerCase();
  return transactions.map((t) => {
    if (t.source !== "email") return t;
    const tb = (t.bank ?? "").toLowerCase();
    const tm = (t.merchant ?? t.title ?? "").toLowerCase();
    const matchesBank = !!account.bank && (tb.includes(bankLower) || bankLower.includes(tb) || tm.includes(bankLower));
    const matchesLastFour =
      !!account.lastFour &&
      (t.note?.includes(account.lastFour) ||
        t.title.includes(account.lastFour) ||
        t.merchant?.includes(account.lastFour));
    return matchesBank || matchesLastFour ? { ...t, accountId: account.id } : t;
  });
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [emailSync, setEmailSync] = useState<EmailSync>({ email: "", appPassword: "", isConnected: false });
  const [plaidSync, setPlaidSync] = useState<PlaidSync>({ items: [] });
  const [isSyncing, setIsSyncing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [householdId, setHouseholdId] = useState<string>("");
  const deviceIdRef = useRef<string>("");
  const householdIdRef = useRef<string>("");
  const accountsRef = useRef<Account[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [txRaw, accRaw, billRaw, emailRaw, plaidRaw, storedDeviceId, storedHouseholdId] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.transactions),
            AsyncStorage.getItem(STORAGE_KEYS.accounts),
            AsyncStorage.getItem(STORAGE_KEYS.bills),
            AsyncStorage.getItem(STORAGE_KEYS.emailSync),
            AsyncStorage.getItem(STORAGE_KEYS.plaidSync),
            AsyncStorage.getItem(STORAGE_KEYS.deviceId),
            AsyncStorage.getItem(STORAGE_KEYS.householdId),
          ]);

        const dId = storedDeviceId || generateDeviceId();
        if (!storedDeviceId) await AsyncStorage.setItem(STORAGE_KEYS.deviceId, dId);
        deviceIdRef.current = dId;
        setDeviceId(dId);

        const hId = storedHouseholdId || generateHouseholdCode();
        if (!storedHouseholdId) await AsyncStorage.setItem(STORAGE_KEYS.householdId, hId);
        householdIdRef.current = hId;
        setHouseholdId(hId);

        const MOCK_ACCOUNT_IDS = new Set(["acc1", "acc2", "acc3"]);
        const MOCK_TX_IDS = new Set(["t1", "t2", "t3", "t4", "t5"]);

        let parsedAccounts: Account[] = accRaw ? JSON.parse(accRaw) : [];
        let parsedTx: Transaction[] = txRaw ? JSON.parse(txRaw) : [];
        let parsedBills: Bill[] = billRaw ? JSON.parse(billRaw) : [];

        // Always strip mock accounts and their manual transactions
        const hasMockAccounts = parsedAccounts.some((a) => MOCK_ACCOUNT_IDS.has(a.id));
        if (hasMockAccounts) {
          parsedAccounts = parsedAccounts.filter((a) => !MOCK_ACCOUNT_IDS.has(a.id));
        }
        // Always strip mock transactions by ID and any manual tx linked to mock accounts
        parsedTx = parsedTx.filter(
          (t) => !MOCK_TX_IDS.has(t.id) && !(MOCK_ACCOUNT_IDS.has(t.accountId ?? "") && t.source === "manual")
        );

        // Always strip mock bills by ID (independent of whether mock accounts still exist)
        const MOCK_BILL_IDS = new Set(["b1", "b2", "b3", "b4", "b5"]);
        parsedBills = parsedBills.filter((b) => !MOCK_BILL_IDS.has(b.id));

        // Build a set of valid account IDs for stale-reference cleanup
        const validAccountIds = new Set(parsedAccounts.map((a) => a.id));

        // Auto-remap email transactions: remap if unmatched OR if accountId points to
        // a deleted/mock account that no longer exists in the list
        const remappedTx = parsedTx.map((t) => {
          if (t.source !== "email") return t;
          const accountMissing = !t.accountId || !validAccountIds.has(t.accountId);
          if (!accountMissing) return t;
          const lastFour = t.note?.match(/\b\d{4}\b/)?.[0];
          const match =
            (t.bank ? findAccountMatch(parsedAccounts, t.bank, lastFour) : undefined) ||
            (lastFour ? parsedAccounts.find((a) => a.lastFour === lastFour) : undefined);
          return match ? { ...t, accountId: match.id } : t;
        });

        setTransactions(remappedTx);
        setAccounts(parsedAccounts);
        setBills(parsedBills);
        if (emailRaw) setEmailSync(JSON.parse(emailRaw));
        if (plaidRaw) setPlaidSync(JSON.parse(plaidRaw));
      } catch {}
      setInitialized(true);
    })();
  }, []);

  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions)); }, [transactions, initialized]);
  useEffect(() => {
    if (initialized) AsyncStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
    accountsRef.current = accounts;
  }, [accounts, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.bills, JSON.stringify(bills)); }, [bills, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.emailSync, JSON.stringify(emailSync)); }, [emailSync, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.plaidSync, JSON.stringify(plaidSync)); }, [plaidSync, initialized]);

  const changeHouseholdId = useCallback(async (code: string) => {
    const normalized = code.trim().toUpperCase();
    householdIdRef.current = normalized;
    setHouseholdId(normalized);
    await AsyncStorage.setItem(STORAGE_KEYS.householdId, normalized);
    setTransactions([]);
    setAccounts([]);
    setBills([]);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.transactions),
      AsyncStorage.removeItem(STORAGE_KEYS.accounts),
      AsyncStorage.removeItem(STORAGE_KEYS.bills),
    ]);
  }, []);

  // ── CRUD: Transactions ────────────────────────────────────────────────────
  const addTransaction = useCallback((t: Omit<Transaction, "id">) => {
    const newT: Transaction = { ...t, id: genId() };
    setTransactions((prev) => [newT, ...prev]);
    apiCall("/api/transactions", "POST", householdIdRef.current, deviceIdRef.current, newT);
  }, []);

  const updateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    apiCall(`/api/transactions/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    apiCall(`/api/transactions/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Accounts ────────────────────────────────────────────────────────
  const addAccount = useCallback((a: Omit<Account, "id"> & { forceCreate?: boolean }): string => {
    // Dedup: if lastFour + bank already matches an existing account, return its ID
    if (!a.forceCreate && a.lastFour && a.bank) {
      const existing = findAccountMatch(accountsRef.current, a.bank, a.lastFour);
      if (existing) {
        if (existing.bank) {
          setTransactions((prev) => remapEmailTransactionsForAccount(prev, existing));
        }
        return existing.id;
      }
    }
    const newA: Account = { ...a, id: genId() };
    setAccounts((prev) => [...prev, newA]);
    apiCall("/api/accounts", "POST", householdIdRef.current, deviceIdRef.current, newA);
    // Auto-remap any email transactions whose bank matches this new account
    if (newA.bank) {
      setTransactions((prev) => remapEmailTransactionsForAccount(prev, newA));
    }
    return newA.id;
  }, []);

  const remapEmailTransactions = useCallback((bankPattern: string, accountId: string) => {
    if (!bankPattern.trim()) return;
    const pattern = bankPattern.trim().toLowerCase();
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.source !== "email" || !t.bank) return t;
        const tb = t.bank.toLowerCase();
        const matches = tb.includes(pattern) || pattern.includes(tb);
        return matches ? { ...t, accountId } : t;
      })
    );
  }, []);

  const updateAccount = useCallback((id: string, updates: Partial<Account>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    apiCall(`/api/accounts/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteAccount = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    apiCall(`/api/accounts/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Bills ───────────────────────────────────────────────────────────
  const addBill = useCallback((b: Omit<Bill, "id">) => {
    const newB: Bill = { ...b, id: genId() };
    setBills((prev) => [...prev, newB]);
    apiCall("/api/bills", "POST", householdIdRef.current, deviceIdRef.current, newB);
  }, []);

  const updateBill = useCallback((id: string, updates: Partial<Bill>) => {
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
    apiCall(`/api/bills/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteBill = useCallback((id: string) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
    apiCall(`/api/bills/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  const markBillPaid = useCallback(
    (id: string) => {
      const bill = bills.find((b) => b.id === id);
      if (!bill) return;
      setBills((prev) => prev.map((b) => (b.id === id ? { ...b, isPaid: true } : b)));
      apiCall(`/api/bills/${id}/pay`, "POST", householdIdRef.current, deviceIdRef.current);
      addTransaction({
        title: bill.title,
        amount: bill.amount,
        type: "expense",
        category: bill.category,
        accountId: bill.accountId || accounts[0]?.id || "acc1",
        date: new Date().toISOString(),
        note: "Bill payment",
        source: "manual",
      });
    },
    [bills, accounts, addTransaction]
  );

  // ── Email sync ────────────────────────────────────────────────────────────
  const connectEmail = useCallback(
    async (email: string, appPassword: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`${getApiBase()}/api/email/test`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Household-ID": householdIdRef.current,
            "X-Device-ID": deviceIdRef.current,
          },
          body: JSON.stringify({ email, appPassword }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error || "Connection failed" };
        setEmailSync({ email, appPassword, isConnected: true, lastSynced: undefined });
        return { success: true };
      } catch {
        return { success: false, error: "Network error. Make sure the app is connected." };
      }
    },
    []
  );

  const disconnectEmail = useCallback(() => {
    setEmailSync({ email: "", appPassword: "", isConnected: false });
  }, []);

  const resetEmailTransactions = useCallback(() => {
    setTransactions((prev) => prev.filter((t) => t.source !== "email"));
  }, []);

  const syncEmailTransactions = useCallback(async (): Promise<{ imported: number; error?: string }> => {
    if (!emailSync.isConnected || !emailSync.email || !emailSync.appPassword) {
      return { imported: 0, error: "Email not connected" };
    }
    setIsSyncing(true);
    try {
      const res = await fetch(`${getApiBase()}/api/email/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdIdRef.current,
          "X-Device-ID": deviceIdRef.current,
        },
        body: JSON.stringify({ email: emailSync.email, appPassword: emailSync.appPassword, daysBack: 30 }),
      });
      const data = await res.json();
      if (!res.ok) { setIsSyncing(false); return { imported: 0, error: data.error || "Sync failed" }; }

      const currentAccounts = accountsRef.current;
      const defaultAccountId = currentAccounts[0]?.id || "";
      let imported = 0;

      if (data.transactions && Array.isArray(data.transactions)) {
        const newTxs: Transaction[] = data.transactions.map((t: any) => {
          // Match transaction to best account by lastFour + bank, then bank only
          const matched = t.bank
            ? findAccountMatch(currentAccounts, t.bank, t.lastFour ?? undefined)
            : undefined;
          const merchant = t.merchant || t.title || "Transaction";
          return {
            id: genId(),
            title: merchant,
            merchant,
            amount: t.amount,
            type: t.type,
            category: t.category || "Other",
            accountId: matched?.id ?? defaultAccountId,
            date: t.date || new Date().toISOString(),
            source: "email" as const,
            fromEmail: true,
            bank: t.bank || "Bank",
            note: [t.lastFour ? `ending in ${t.lastFour}` : ""].filter(Boolean).join(" · ") || undefined,
          };
        });
        setTransactions((prev) => {
          // Dedup against ALL existing transactions regardless of source
          const existingKeys = new Set(prev.map(dedupKey));
          const fresh = newTxs.filter((t) => !existingKeys.has(dedupKey(t)));
          imported = fresh.length;
          if (fresh.length > 0) {
            apiCall("/api/transactions/bulk", "POST", householdIdRef.current, deviceIdRef.current, { transactions: fresh });
          }
          return [...fresh, ...prev];
        });
      }

      setEmailSync((prev) => ({
        ...prev,
        lastSynced: new Date().toISOString(),
        lastEmailsScanned: data.emailsScanned,
        lastImported: data.transactionsFound,
      }));
      setIsSyncing(false);
      return { imported };
    } catch {
      setIsSyncing(false);
      return { imported: 0, error: "Network error during sync" };
    }
  }, [emailSync, accounts]);

  // ── Plaid sync ────────────────────────────────────────────────────────────

  const connectPlaid = useCallback(
    async (
      item: PlaidItem,
      newAccounts: Omit<Account, "id">[],
      initialTransactions: Omit<Transaction, "id">[]
    ): Promise<{ imported: number }> => {
      const current = accountsRef.current;

      // Dedup: for each incoming Plaid account, check if it already exists locally
      // by plaidAccountId first, then by lastFour + bank name match
      const plaidAccMap: Record<string, string> = {};
      const toCreate: Account[] = [];
      const toMerge: { id: string; updates: Partial<Account> }[] = [];

      for (const a of newAccounts) {
        // 1. Exact plaidAccountId match — already synced
        if (a.plaidAccountId) {
          const byPlaidId = current.find((e) => e.plaidAccountId === a.plaidAccountId);
          if (byPlaidId) {
            plaidAccMap[a.plaidAccountId] = byPlaidId.id;
            continue;
          }
        }
        // 2. lastFour + bank name match — manual account that should be linked
        if (a.lastFour && a.bank) {
          const existing = findAccountMatch(current, a.bank, a.lastFour);
          if (existing && !existing.plaidAccountId) {
            plaidAccMap[a.plaidAccountId ?? ""] = existing.id;
            toMerge.push({
              id: existing.id,
              updates: { plaidAccountId: a.plaidAccountId, plaidItemId: item.itemId },
            });
            continue;
          }
        }
        // 3. New account — create it
        const created: Account = { ...a, id: genId() };
        toCreate.push(created);
        if (a.plaidAccountId) plaidAccMap[a.plaidAccountId] = created.id;
      }

      if (toCreate.length > 0) {
        setAccounts((prev) => [...prev, ...toCreate]);
        toCreate.forEach((a) =>
          apiCall("/api/accounts", "POST", householdIdRef.current, deviceIdRef.current, a)
        );
      }
      if (toMerge.length > 0) {
        setAccounts((prev) =>
          prev.map((a) => {
            const upd = toMerge.find((u) => u.id === a.id);
            return upd ? { ...a, ...upd.updates } : a;
          })
        );
        toMerge.forEach(({ id, updates }) =>
          apiCall(`/api/accounts/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates)
        );
      }

      // All real account IDs involved in this item (newly created + merged existing)
      const allItemAccountIds = [
        ...toCreate.map((a) => a.id),
        ...toMerge.map((m) => m.id),
      ];

      let imported = 0;
      const fallbackId = toCreate[0]?.id ?? toMerge[0]?.id ?? current[0]?.id ?? "";
      const txsToAdd: Transaction[] = initialTransactions.map((t) => ({
        ...t,
        id: genId(),
        accountId: (t.accountId && plaidAccMap[t.accountId]) || fallbackId || t.accountId,
        source: "plaid" as const,
      }));

      setTransactions((prev) => {
        const existingKeys = new Set(prev.map(dedupKey));
        const fresh = txsToAdd.filter((t) => !existingKeys.has(dedupKey(t)));
        imported = fresh.length;
        return [...fresh, ...prev];
      });

      // Register item with accountIds
      const registeredItem: PlaidItem = {
        ...item,
        accountIds: allItemAccountIds,
        lastSynced: new Date().toISOString(),
        lastImported: imported,
      };
      setPlaidSync((prev) => ({ items: [...prev.items, registeredItem] }));

      return { imported };
    },
    []
  );

  const syncPlaidTransactions = useCallback(
    async (itemId: string): Promise<{ imported: number; error?: string }> => {
      const item = plaidSync.items.find((i) => i.itemId === itemId);
      if (!item) return { imported: 0, error: "Bank not found" };

      setIsSyncing(true);

      try {
        const res = await apiCall(
          `/api/plaid/sync/${itemId}`,
          "POST",
          householdIdRef.current,
          deviceIdRef.current
        );

        if (!res) {
          setIsSyncing(false);
          return { imported: 0, error: "Network error. Could not reach server." };
        }

        const data = await res.json();

        if (!res.ok) {
          setIsSyncing(false);
          return { imported: 0, error: data.error ?? "Sync failed" };
        }

        // Build map of plaidAccountId → local account id
        const plaidAccounts = accounts.filter((a) => item.accountIds.includes(a.id));
        const plaidAccMap: Record<string, string> = {};
        plaidAccounts.forEach((a) => {
          if (a.plaidAccountId) plaidAccMap[a.plaidAccountId] = a.id;
        });

        let imported = 0;
        if (Array.isArray(data.transactions) && data.transactions.length > 0) {
          const newTxs: Transaction[] = (data.transactions as any[]).map((t) => ({
            id: genId(),
            title: t.title,
            amount: t.amount,
            type: t.type as "income" | "expense",
            category: t.category ?? "Other",
            accountId: plaidAccMap[t.accountId] ?? plaidAccounts[0]?.id ?? t.accountId,
            date: t.date,
            source: "plaid" as const,
            bank: t.bank,
          }));

          setTransactions((prev) => {
            const existingKeys = new Set(prev.map(dedupKey));
            const fresh = newTxs.filter((t) => !existingKeys.has(dedupKey(t)));
            imported = fresh.length;
            if (fresh.length > 0) {
              apiCall(
                "/api/transactions/bulk",
                "POST",
                householdIdRef.current,
                deviceIdRef.current,
                { transactions: fresh }
              );
            }
            return [...fresh, ...prev];
          });
        }

        setPlaidSync((prev) => ({
          items: prev.items.map((i) =>
            i.itemId === itemId
              ? { ...i, lastSynced: new Date().toISOString(), lastImported: imported }
              : i
          ),
        }));
        setIsSyncing(false);
        return { imported };
      } catch {
        setIsSyncing(false);
        return { imported: 0, error: "Sync failed unexpectedly" };
      }
    },
    [plaidSync, accounts]
  );

  const disconnectPlaid = useCallback((itemId: string) => {
    const item = plaidSync.items.find((i) => i.itemId === itemId);
    if (item) {
      setAccounts((prev) => prev.filter((a) => !item.accountIds.includes(a.id)));
      setTransactions((prev) =>
        prev.filter((t) => !item.accountIds.includes(t.accountId) || t.source !== "plaid")
      );
    }
    setPlaidSync((prev) => ({ items: prev.items.filter((i) => i.itemId !== itemId) }));
    // Best-effort: remove access token from server
    apiCall(
      `/api/plaid/disconnect/${itemId}`,
      "DELETE",
      householdIdRef.current,
      deviceIdRef.current
    );
  }, [plaidSync]);

  // ── Computed values ───────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthTx = transactions.filter((t) => t.date >= monthStart);
  const monthlyIncome = thisMonthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = thisMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const totalBalance = accounts
    .filter((a) => a.includeInNetworth !== false)
    .reduce((s, a) => s + a.balance, 0);

  return (
    <AppContext.Provider
      value={{
        transactions, accounts, bills, emailSync, plaidSync,
        addTransaction, updateTransaction, deleteTransaction,
        addAccount, remapEmailTransactions, updateAccount, deleteAccount,
        addBill, updateBill, deleteBill, markBillPaid,
        connectEmail, disconnectEmail, resetEmailTransactions, syncEmailTransactions,
        connectPlaid, syncPlaidTransactions, disconnectPlaid,
        isSyncing, totalBalance, monthlyIncome, monthlyExpense,
        deviceId, householdId, changeHouseholdId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// ── Mock Plaid data generators ────────────────────────────────────────────────

const MOCK_TX_TEMPLATES = [
  { title: "Starbucks", amount: 6.75, type: "expense" as const, category: "Food" },
  { title: "Uber", amount: 14.50, type: "expense" as const, category: "Transport" },
  { title: "Spotify", amount: 9.99, type: "expense" as const, category: "Entertainment" },
  { title: "Target", amount: 43.21, type: "expense" as const, category: "Shopping" },
  { title: "Chipotle", amount: 12.80, type: "expense" as const, category: "Food" },
  { title: "Shell Gas", amount: 48.00, type: "expense" as const, category: "Transport" },
  { title: "CVS Pharmacy", amount: 22.35, type: "expense" as const, category: "Health" },
  { title: "Direct Deposit", amount: 2200.00, type: "income" as const, category: "Income" },
  { title: "Venmo Payment", amount: 50.00, type: "income" as const, category: "Income" },
  { title: "Whole Foods", amount: 87.64, type: "expense" as const, category: "Groceries" },
];

export function generateMockPlaidTransactions(
  linkedAccounts: Account[],
  since: Date
): Transaction[] {
  if (linkedAccounts.length === 0) return [];
  const now = Date.now();
  const sinceMs = since.getTime();
  const windowMs = now - sinceMs;
  if (windowMs <= 0) return [];

  // Generate 2–5 transactions randomly in the window
  const count = 2 + Math.floor(Math.random() * 4);
  const txs: Transaction[] = [];
  const used = new Set<number>();

  for (let i = 0; i < count; i++) {
    let tplIdx: number;
    do { tplIdx = Math.floor(Math.random() * MOCK_TX_TEMPLATES.length); } while (used.has(tplIdx));
    used.add(tplIdx);

    const tpl = MOCK_TX_TEMPLATES[tplIdx];
    const date = new Date(sinceMs + Math.random() * windowMs).toISOString();
    const acc = linkedAccounts[Math.floor(Math.random() * linkedAccounts.length)];

    txs.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title: tpl.title,
      amount: tpl.amount,
      type: tpl.type,
      category: tpl.category,
      accountId: acc.id,
      date,
      source: "plaid",
      bank: acc.bank,
    });
  }
  return txs;
}

// ── Bank catalog (used by PlaidLinkModal) ─────────────────────────────────────

export const PLAID_BANKS = [
  { id: "rbc", name: "RBC Royal Bank", color: "#003168", icon: "🦁", accountTypes: ["checking", "savings", "credit", "investment"] },
  { id: "td", name: "TD Canada Trust", color: "#34A853", icon: "🍀", accountTypes: ["checking", "savings", "credit", "investment"] },
  { id: "scotiabank", name: "Scotiabank", color: "#EC111A", icon: "🏦", accountTypes: ["checking", "savings", "credit"] },
  { id: "bmo", name: "BMO Bank of Montreal", color: "#0079C1", icon: "💙", accountTypes: ["checking", "savings", "credit", "investment"] },
  { id: "cibc", name: "CIBC", color: "#C41F3E", icon: "🏛", accountTypes: ["checking", "savings", "credit"] },
  { id: "national", name: "National Bank", color: "#EA1D2C", icon: "🇨🇦", accountTypes: ["checking", "savings", "credit"] },
  { id: "tangerine", name: "Tangerine", color: "#FF6A00", icon: "🍊", accountTypes: ["checking", "savings"] },
  { id: "simplii", name: "Simplii Financial", color: "#E4002B", icon: "🔴", accountTypes: ["checking", "savings"] },
  { id: "eqbank", name: "EQ Bank", color: "#00B388", icon: "💚", accountTypes: ["savings"] },
  { id: "atb", name: "ATB Financial", color: "#004B87", icon: "🏔", accountTypes: ["checking", "savings", "credit"] },
  { id: "desjardins", name: "Desjardins", color: "#009A44", icon: "🌿", accountTypes: ["checking", "savings", "credit"] },
  { id: "questrade", name: "Questrade", color: "#E8181C", icon: "📈", accountTypes: ["investment"] },
];

/** Generate mock accounts for a bank after "linking" */
export function generateMockPlaidAccounts(bankId: string, bank: typeof PLAID_BANKS[0]): Array<{
  plaidAccountId: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  lastFour: string;
}> {
  const lastFourGen = () => String(Math.floor(1000 + Math.random() * 9000));
  return bank.accountTypes.map((type) => ({
    plaidAccountId: `${bankId}_${type}_${Math.random().toString(36).slice(2, 8)}`,
    name: type === "checking" ? `${bank.name} Checking`
      : type === "savings" ? `${bank.name} Savings`
      : type === "credit" ? `${bank.name} Credit Card`
      : `${bank.name} Investment`,
    type: type as "checking" | "savings" | "credit" | "investment",
    balance: type === "credit"
      ? -(Math.floor(Math.random() * 3000 + 200))
      : type === "investment"
      ? Math.floor(Math.random() * 50000 + 10000)
      : Math.floor(Math.random() * 8000 + 500),
    lastFour: lastFourGen(),
  }));
}
