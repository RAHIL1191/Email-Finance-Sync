import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Account,
  PLAID_BANKS,
  PlaidItem,
  getApiBase,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

type Step = "search" | "opening" | "accounts" | "importing" | "success" | "error";

interface DiscoveredAccount {
  plaidAccountId: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  lastFour: string;
  selected: boolean;
}

interface ServerTransaction {
  plaidTransactionId: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  accountId: string;
  bank: string;
}

const ACCOUNT_COLORS: Record<string, string> = {
  checking: "#3b82f6",
  savings: "#10b981",
  credit: "#f59e0b",
  investment: "#8b5cf6",
};

// Opens Plaid Link by injecting a full-screen iframe overlay into the DOM.
// This avoids popup-blocking and cross-origin postMessage issues inside Replit's iframe preview.
function openPlaidIframe(
  linkToken: string,
  apiBase: string
): Promise<{ publicToken: string; metadata: unknown }> {
  return new Promise((resolve, reject) => {
    const url = `${apiBase}/api/plaid/link-page?token=${encodeURIComponent(linkToken)}`;

    // Create full-screen overlay iframe
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("allow", "fullscreen");
    Object.assign(iframe.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      border: "none",
      zIndex: "2147483647",
      background: "rgba(0,0,0,0.5)",
    });

    function onMessage(event: MessageEvent) {
      if (event.data?.type === "plaid_success") {
        cleanup();
        resolve({ publicToken: event.data.publicToken as string, metadata: event.data.metadata });
      } else if (event.data?.type === "plaid_exit") {
        cleanup();
        reject(new Error("exit"));
      }
    }

    function cleanup() {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }

    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
  });
}

export default function PlaidLinkModal({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connectPlaid, deviceId, householdId } = useApp();

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [selectedBank, setSelectedBank] = useState<(typeof PLAID_BANKS)[0] | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [connectingMsg, setConnectingMsg] = useState("Connecting to your bank…");
  const [discovered, setDiscovered] = useState<DiscoveredAccount[]>([]);
  const [serverTransactions, setServerTransactions] = useState<ServerTransaction[]>([]);
  const [importResult, setImportResult] = useState<{ accounts: number; transactions: number } | null>(null);
  const [plaidItemId, setPlaidItemId] = useState("");
  const filteredBanks = query.trim()
    ? PLAID_BANKS.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    : PLAID_BANKS;

  // ── Bank selection → create link token → open Plaid Link popup ───────────
  const handleBankSelect = async (bank: (typeof PLAID_BANKS)[0]) => {
    if (Platform.OS !== "web") {
      setErrorMsg("Bank linking via Plaid is available in the web version of the app.");
      setSelectedBank(bank);
      setStep("error");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBank(bank);
    setErrorMsg("");
    setStep("opening");
    setConnectingMsg("Opening secure bank link…");

    const apiBase = getApiBase();

    try {
      // 1. Get link token from server
      const tokenRes = await fetch(`${apiBase}/api/plaid/create-link-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdId,
          "X-Device-ID": deviceId,
        },
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        setErrorMsg(tokenData.error ?? "Failed to start bank link.");
        setStep("error");
        return;
      }

      const linkToken = tokenData.link_token as string;

      // 2. Open Plaid Link as a full-screen iframe overlay
      const { publicToken } = await openPlaidIframe(linkToken, apiBase);
      await handlePublicToken(publicToken, bank);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "exit") {
        // User closed the popup without completing — go back to search
        setStep("search");
        return;
      }
      setErrorMsg(msg);
      setStep("error");
    }
  };

  // ── Exchange public token → real accounts + transactions ──────────────────
  const handlePublicToken = async (publicToken: string, bank: (typeof PLAID_BANKS)[0]) => {
    setStep("opening");
    let msgIdx = 0;
    const msgs = ["Importing your accounts…", "Loading recent transactions…", "Almost done…"];
    setConnectingMsg(msgs[0]);
    const msgTimer = setInterval(() => {
      msgIdx = (msgIdx + 1) % msgs.length;
      setConnectingMsg(msgs[msgIdx]);
    }, 1400);

    try {
      const res = await fetch(`${getApiBase()}/api/plaid/exchange-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdId,
          "X-Device-ID": deviceId,
        },
        body: JSON.stringify({
          public_token: publicToken,
          bank_name: bank.name,
          bank_color: bank.color,
        }),
      });

      clearInterval(msgTimer);
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to link bank account.");
        setStep("error");
        return;
      }

      setPlaidItemId(data.itemId as string);

      const accts: DiscoveredAccount[] = (
        data.accounts as Array<{
          plaidAccountId: string;
          name: string;
          type: "checking" | "savings" | "credit" | "investment";
          balance: number;
          lastFour: string;
        }>
      ).map((a) => ({ ...a, selected: true }));

      setDiscovered(accts);
      setServerTransactions(data.transactions as ServerTransaction[]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("accounts");
    } catch {
      clearInterval(msgTimer);
      setErrorMsg("Network error during account import.");
      setStep("error");
    }
  };

  const toggleAccount = (plaidAccountId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDiscovered((prev) =>
      prev.map((a) => (a.plaidAccountId === plaidAccountId ? { ...a, selected: !a.selected } : a))
    );
  };

  // ── Confirm account selection → add to app ────────────────────────────────
  const handleImport = async () => {
    const selected = discovered.filter((a) => a.selected);
    if (selected.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("importing");
    setConnectingMsg("Saving accounts…");

    const newAccounts: Omit<Account, "id">[] = selected.map((a) => ({
      name: a.name,
      bank: selectedBank!.name,
      balance: a.balance,
      type: a.type,
      color: ACCOUNT_COLORS[a.type] ?? selectedBank!.color,
      lastFour: a.lastFour,
      plaidItemId,
      plaidAccountId: a.plaidAccountId,
    }));

    const selectedPlaidIds = new Set(selected.map((a) => a.plaidAccountId));
    const initialTxs = serverTransactions
      .filter((t) => selectedPlaidIds.has(t.accountId))
      .map((t) => ({
        title: t.title,
        amount: t.amount,
        type: t.type,
        category: t.category,
        accountId: t.accountId,
        date: t.date,
        bank: t.bank,
        source: "plaid" as const,
      }));

    const item: PlaidItem = {
      itemId: plaidItemId,
      bankName: selectedBank!.name,
      bankColor: selectedBank!.color,
      connectedAt: new Date().toISOString(),
      accountIds: [],
    };

    const { imported } = await connectPlaid(item, newAccounts, initialTxs);
    setImportResult({ accounts: selected.length, transactions: imported });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep("success");
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top + 16;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>

        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
          {step !== "opening" && step !== "importing" ? (
            <TouchableOpacity
              onPress={() => {
                if (step === "search" || step === "success") { onClose(); return; }
                setStep("search");
              }}
            >
              <Feather
                name={step === "search" || step === "success" ? "x" : "arrow-left"}
                size={22}
                color={colors.foreground}
              />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {step === "search" && "Connect a Bank"}
            {step === "opening" && "Linking…"}
            {step === "accounts" && "Select Accounts"}
            {step === "importing" && "Importing…"}
            {step === "success" && "All Done!"}
            {step === "error" && "Connection Failed"}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* ── Search / bank list ── */}
        {step === "search" && (
          <>
            <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search your bank…"
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.bankList}>
              {filteredBanks.map((bank) => (
                <TouchableOpacity
                  key={bank.id}
                  style={[styles.bankRow, { backgroundColor: colors.card }]}
                  onPress={() => handleBankSelect(bank)}
                >
                  <View style={[styles.bankIconWrap, { backgroundColor: bank.color + "18" }]}>
                    <Text style={styles.bankEmoji}>{bank.icon}</Text>
                  </View>
                  <Text style={[styles.bankName, { color: colors.foreground }]}>{bank.name}</Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
              {filteredBanks.length === 0 && (
                <View style={styles.noResults}>
                  <Feather name="search" size={28} color={colors.mutedForeground} />
                  <Text style={[styles.noResultsText, { color: colors.mutedForeground }]}>No banks found</Text>
                </View>
              )}
            </ScrollView>

            <View style={[styles.poweredBy, { borderTopColor: colors.border }]}>
              <Feather name="lock" size={12} color={colors.mutedForeground} />
              <Text style={[styles.poweredByText, { color: colors.mutedForeground }]}>
                Powered by Plaid · Bank-level encryption · Read-only access
              </Text>
            </View>
          </>
        )}

        {/* ── Opening / importing spinner ── */}
        {(step === "opening" || step === "importing") && (
          <View style={styles.loadingWrap}>
            <View style={[styles.loadingIcon, { backgroundColor: (selectedBank?.color ?? colors.primary) + "18" }]}>
              <ActivityIndicator size="large" color={selectedBank?.color ?? colors.primary} />
            </View>
            <Text style={[styles.loadingTitle, { color: colors.foreground }]}>{connectingMsg}</Text>
            <Text style={[styles.loadingSub, { color: colors.mutedForeground }]}>
              This usually takes just a few seconds
            </Text>
          </View>
        )}

        {/* ── Account selection ── */}
        {step === "accounts" && (
          <>
            <Text style={[styles.acctSubtitle, { color: colors.mutedForeground }]}>
              Choose which accounts to import
            </Text>
            <ScrollView contentContainerStyle={styles.acctList}>
              {discovered.map((a) => (
                <TouchableOpacity
                  key={a.plaidAccountId}
                  style={[
                    styles.acctRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: a.selected
                        ? (ACCOUNT_COLORS[a.type] ?? colors.primary)
                        : colors.border,
                    },
                  ]}
                  onPress={() => toggleAccount(a.plaidAccountId)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.acctIconWrap, { backgroundColor: (ACCOUNT_COLORS[a.type] ?? colors.primary) + "18" }]}>
                    <Feather
                      name={
                        a.type === "credit"
                          ? "credit-card"
                          : a.type === "investment"
                          ? "trending-up"
                          : a.type === "savings"
                          ? "dollar-sign"
                          : "credit-card"
                      }
                      size={18}
                      color={ACCOUNT_COLORS[a.type] ?? colors.primary}
                    />
                  </View>
                  <View style={styles.acctInfo}>
                    <Text style={[styles.acctName, { color: colors.foreground }]}>{a.name}</Text>
                    <Text style={[styles.acctMeta, { color: colors.mutedForeground }]}>
                      {a.lastFour ? `•••• ${a.lastFour} · ` : ""}
                      {a.type.charAt(0).toUpperCase() + a.type.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.acctRight}>
                    <Text style={[styles.acctBalance, { color: a.balance < 0 ? colors.expense : colors.foreground }]}>
                      {a.balance < 0 ? "-" : ""}$
                      {Math.abs(a.balance).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: a.selected ? (ACCOUNT_COLORS[a.type] ?? colors.primary) : colors.border,
                          backgroundColor: a.selected ? (ACCOUNT_COLORS[a.type] ?? colors.primary) : "transparent",
                        },
                      ]}
                    >
                      {a.selected && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={[styles.acctFooter, { borderTopColor: colors.border }]}>
              <Text style={[styles.acctFooterNote, { color: colors.mutedForeground }]}>
                {discovered.filter((a) => a.selected).length} of {discovered.length} selected
              </Text>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: selectedBank?.color ?? colors.primary,
                    flex: 0,
                    paddingHorizontal: 28,
                    opacity: discovered.filter((a) => a.selected).length === 0 ? 0.4 : 1,
                  },
                ]}
                onPress={handleImport}
                disabled={discovered.filter((a) => a.selected).length === 0}
              >
                <Text style={styles.primaryBtnText}>Import</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Success ── */}
        {step === "success" && importResult && (
          <View style={styles.centeredWrap}>
            <View style={[styles.bigIcon, { backgroundColor: "#10b98118" }]}>
              <Feather name="check-circle" size={48} color="#10b981" />
            </View>
            <Text style={[styles.bigTitle, { color: colors.foreground }]}>Bank Linked!</Text>
            <Text style={[styles.bigSub, { color: colors.mutedForeground }]}>
              Imported {importResult.accounts} account{importResult.accounts !== 1 ? "s" : ""} and{" "}
              {importResult.transactions} real transaction{importResult.transactions !== 1 ? "s" : ""} from{" "}
              {selectedBank?.name}.
            </Text>
            <View style={[styles.statsRow, { backgroundColor: colors.card }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: selectedBank?.color ?? colors.primary }]}>
                  {importResult.accounts}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Accounts</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: selectedBank?.color ?? colors.primary }]}>
                  {importResult.transactions}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Transactions</Text>
              </View>
            </View>
            <View style={[styles.infoNote, { backgroundColor: colors.muted }]}>
              <Feather name="shield" size={13} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Duplicate prevention active — Plaid and email sync will never import the same transaction twice.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: selectedBank?.color ?? colors.primary, alignSelf: "stretch" }]}
              onPress={onClose}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Error ── */}
        {step === "error" && (
          <View style={styles.centeredWrap}>
            <View style={[styles.bigIcon, { backgroundColor: colors.expense + "15" }]}>
              <Feather name="alert-circle" size={44} color={colors.expense} />
            </View>
            <Text style={[styles.bigTitle, { color: colors.foreground }]}>Connection Failed</Text>
            <View style={[styles.errBox, { backgroundColor: colors.expense + "10", borderColor: colors.expense + "30" }]}>
              <Text style={[styles.errText, { color: colors.foreground }]}>{errorMsg}</Text>
            </View>
            {(errorMsg.includes("PLAID_CLIENT_ID") || errorMsg.includes("PLAID_SECRET")) && (
              <View style={[styles.infoNote, { backgroundColor: colors.muted }]}>
                <Feather name="info" size={13} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                  Get your free API keys at dashboard.plaid.com and add them as PLAID_CLIENT_ID and PLAID_SECRET in the environment secrets panel.
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, alignSelf: "stretch" }]}
              onPress={() => setStep("search")}
            >
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  bankList: { padding: 16, gap: 10 },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  bankIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  bankEmoji: { fontSize: 22 },
  bankName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  noResults: { paddingTop: 40, alignItems: "center", gap: 10 },
  noResultsText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  poweredBy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 14,
    borderTopWidth: 1,
  },
  poweredByText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 32 },
  loadingIcon: { width: 90, height: 90, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  loadingTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  loadingSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  acctSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  acctList: { padding: 16, gap: 10 },
  acctRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    gap: 12,
    borderWidth: 1.5,
  },
  acctIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  acctInfo: { flex: 1, gap: 3 },
  acctName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  acctMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  acctRight: { alignItems: "flex-end", gap: 8 },
  acctBalance: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  acctFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderTopWidth: 1,
  },
  acctFooterNote: { fontSize: 13, fontFamily: "Inter_400Regular" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 13,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  centeredWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 },
  bigIcon: { width: 96, height: 96, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  bigTitle: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  bigSub: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
  statsRow: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 20,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statNum: { fontSize: 28, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, marginHorizontal: 16 },
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    alignSelf: "stretch",
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  errBox: { borderWidth: 1, borderRadius: 12, padding: 14, alignSelf: "stretch" },
  errText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
});
