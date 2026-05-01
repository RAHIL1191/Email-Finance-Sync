import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  accountId: string;
  date: string;
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

interface AppContextType {
  transactions: Transaction[];
  accounts: Account[];
  bills: Bill[];
  emailSync: EmailSync;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, t: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (a: Omit<Account, "id">) => void;
  updateAccount: (id: string, a: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  addBill: (b: Omit<Bill, "id">) => void;
  updateBill: (id: string, b: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  markBillPaid: (id: string) => void;
  connectEmail: (email: string, appPassword: string) => Promise<{ success: boolean; error?: string }>;
  disconnectEmail: () => void;
  syncEmailTransactions: () => Promise<{ imported: number; error?: string }>;
  isSyncing: boolean;
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  transactions: "@fintrack/transactions",
  accounts: "@fintrack/accounts",
  bills: "@fintrack/bills",
  emailSync: "@fintrack/emailSync",
};

const SAMPLE_ACCOUNTS: Account[] = [
  {
    id: "acc1",
    name: "Main Checking",
    bank: "Chase Bank",
    balance: 4820.5,
    type: "checking",
    color: "#1a56db",
    lastFour: "4521",
  },
  {
    id: "acc2",
    name: "Savings",
    bank: "Chase Bank",
    balance: 12340.0,
    type: "savings",
    color: "#10b981",
    lastFour: "9834",
  },
  {
    id: "acc3",
    name: "Credit Card",
    bank: "Amex",
    balance: -1250.75,
    type: "credit",
    color: "#f59e0b",
    lastFour: "3301",
  },
];

const SAMPLE_TRANSACTIONS: Transaction[] = [
  {
    id: "t1",
    title: "Amazon Purchase",
    amount: 89.99,
    type: "expense",
    category: "Shopping",
    accountId: "acc1",
    date: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "t2",
    title: "Salary Deposit",
    amount: 3500.0,
    type: "income",
    category: "Income",
    accountId: "acc1",
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "t3",
    title: "Netflix Subscription",
    amount: 15.99,
    type: "expense",
    category: "Entertainment",
    accountId: "acc3",
    date: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "t4",
    title: "Whole Foods",
    amount: 127.4,
    type: "expense",
    category: "Groceries",
    accountId: "acc1",
    date: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: "t5",
    title: "Gas Station",
    amount: 55.0,
    type: "expense",
    category: "Transport",
    accountId: "acc1",
    date: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
];

const SAMPLE_BILLS: Bill[] = [
  {
    id: "b1",
    title: "Rent",
    amount: 2200,
    dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    category: "Housing",
    isPaid: false,
    isRecurring: true,
    frequency: "monthly",
    accountId: "acc1",
  },
  {
    id: "b2",
    title: "Electric Bill",
    amount: 145,
    dueDate: new Date(Date.now() + 10 * 86400000).toISOString(),
    category: "Utilities",
    isPaid: false,
    isRecurring: true,
    frequency: "monthly",
    accountId: "acc1",
  },
  {
    id: "b3",
    title: "Internet",
    amount: 79.99,
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    category: "Utilities",
    isPaid: false,
    isRecurring: true,
    frequency: "monthly",
  },
  {
    id: "b4",
    title: "Car Insurance",
    amount: 210,
    dueDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    category: "Insurance",
    isPaid: true,
    isRecurring: true,
    frequency: "monthly",
    accountId: "acc1",
  },
  {
    id: "b5",
    title: "Gym Membership",
    amount: 49.99,
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
    category: "Health",
    isPaid: false,
    isRecurring: true,
    frequency: "monthly",
  },
];

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "http://localhost:80";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [emailSync, setEmailSync] = useState<EmailSync>({
    email: "",
    appPassword: "",
    isConnected: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [txRaw, accRaw, billRaw, emailRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.transactions),
          AsyncStorage.getItem(STORAGE_KEYS.accounts),
          AsyncStorage.getItem(STORAGE_KEYS.bills),
          AsyncStorage.getItem(STORAGE_KEYS.emailSync),
        ]);
        setTransactions(txRaw ? JSON.parse(txRaw) : SAMPLE_TRANSACTIONS);
        setAccounts(accRaw ? JSON.parse(accRaw) : SAMPLE_ACCOUNTS);
        setBills(billRaw ? JSON.parse(billRaw) : SAMPLE_BILLS);
        if (emailRaw) setEmailSync(JSON.parse(emailRaw));
      } catch {}
      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  }, [transactions, initialized]);

  useEffect(() => {
    if (!initialized) return;
    AsyncStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
  }, [accounts, initialized]);

  useEffect(() => {
    if (!initialized) return;
    AsyncStorage.setItem(STORAGE_KEYS.bills, JSON.stringify(bills));
  }, [bills, initialized]);

  useEffect(() => {
    if (!initialized) return;
    AsyncStorage.setItem(STORAGE_KEYS.emailSync, JSON.stringify(emailSync));
  }, [emailSync, initialized]);

  const addTransaction = useCallback((t: Omit<Transaction, "id">) => {
    const newT: Transaction = { ...t, id: genId() };
    setTransactions((prev) => [newT, ...prev]);
  }, []);

  const updateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addAccount = useCallback((a: Omit<Account, "id">) => {
    setAccounts((prev) => [...prev, { ...a, id: genId() }]);
  }, []);

  const updateAccount = useCallback((id: string, updates: Partial<Account>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  }, []);

  const deleteAccount = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addBill = useCallback((b: Omit<Bill, "id">) => {
    setBills((prev) => [...prev, { ...b, id: genId() }]);
  }, []);

  const updateBill = useCallback((id: string, updates: Partial<Bill>) => {
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }, []);

  const deleteBill = useCallback((id: string) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const markBillPaid = useCallback(
    (id: string) => {
      const bill = bills.find((b) => b.id === id);
      if (!bill) return;
      setBills((prev) => prev.map((b) => (b.id === id ? { ...b, isPaid: true } : b)));
      addTransaction({
        title: bill.title,
        amount: bill.amount,
        type: "expense",
        category: bill.category,
        accountId: bill.accountId || accounts[0]?.id || "acc1",
        date: new Date().toISOString(),
        note: "Bill payment",
      });
    },
    [bills, accounts, addTransaction]
  );

  const connectEmail = useCallback(async (email: string, appPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${getApiBase()}/api/email/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, appPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Connection failed" };
      }
      setEmailSync({
        email,
        appPassword,
        isConnected: true,
        lastSynced: undefined,
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: "Network error. Make sure the app is connected." };
    }
  }, []);

  const disconnectEmail = useCallback(() => {
    setEmailSync({ email: "", appPassword: "", isConnected: false });
  }, []);

  const syncEmailTransactions = useCallback(async (): Promise<{ imported: number; error?: string }> => {
    if (!emailSync.isConnected || !emailSync.email || !emailSync.appPassword) {
      return { imported: 0, error: "Email not connected" };
    }

    setIsSyncing(true);
    try {
      const res = await fetch(`${getApiBase()}/api/email/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailSync.email,
          appPassword: emailSync.appPassword,
          daysBack: 30,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setIsSyncing(false);
        return { imported: 0, error: data.error || "Sync failed" };
      }

      const defaultAccountId = accounts[0]?.id || "acc1";
      let imported = 0;

      if (data.transactions && Array.isArray(data.transactions)) {
        const newTxs: Transaction[] = data.transactions.map((t: any) => ({
          id: genId(),
          title: t.title || "Transaction",
          amount: t.amount,
          type: t.type,
          category: t.category || "Other",
          accountId: defaultAccountId,
          date: t.date || new Date().toISOString(),
          fromEmail: true,
          bank: t.bank || "Bank",
        }));

        // Deduplicate against existing transactions
        setTransactions((prev) => {
          const existingKeys = new Set(
            prev.filter((t) => t.fromEmail).map((t) => `${t.amount}-${t.title}-${t.date.slice(0, 10)}`)
          );
          const fresh = newTxs.filter(
            (t) => !existingKeys.has(`${t.amount}-${t.title}-${t.date.slice(0, 10)}`)
          );
          imported = fresh.length;
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
    } catch (e: any) {
      setIsSyncing(false);
      return { imported: 0, error: "Network error during sync" };
    }
  }, [emailSync, accounts]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthTx = transactions.filter((t) => t.date >= monthStart);
  const monthlyIncome = thisMonthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = thisMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <AppContext.Provider
      value={{
        transactions,
        accounts,
        bills,
        emailSync,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addAccount,
        updateAccount,
        deleteAccount,
        addBill,
        updateBill,
        deleteBill,
        markBillPaid,
        connectEmail,
        disconnectEmail,
        syncEmailTransactions,
        isSyncing,
        totalBalance,
        monthlyIncome,
        monthlyExpense,
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
