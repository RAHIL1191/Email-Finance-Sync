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
  generateMockPlaidAccounts,
  generateMockPlaidTransactions,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

type Step = "search" | "bank" | "credentials" | "connecting" | "accounts" | "success";

interface DiscoveredAccount {
  plaidAccountId: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  lastFour: string;
  selected: boolean;
}

const ACCOUNT_COLORS: Record<string, string> = {
  checking: "#3b82f6",
  savings: "#10b981",
  credit: "#f59e0b",
  investment: "#8b5cf6",
};

export default function PlaidLinkModal({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connectPlaid } = useApp();

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [selectedBank, setSelectedBank] = useState<typeof PLAID_BANKS[0] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credError, setCredError] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredAccount[]>([]);
  const [importResult, setImportResult] = useState<{ accounts: number; transactions: number } | null>(null);
  const [connectingMsg, setConnectingMsg] = useState("Connecting to your bank…");

  const filteredBanks = query.trim()
    ? PLAID_BANKS.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    : PLAID_BANKS;

  const handleBankSelect = (bank: typeof PLAID_BANKS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBank(bank);
    setUsername("");
    setPassword("");
    setCredError("");
    setStep("credentials");
  };

  const handleConnect = async () => {
    if (!username.trim()) { setCredError("Please enter your username."); return; }
    if (password.length < 4) { setCredError("Please enter your password."); return; }
    setCredError("");
    setStep("connecting");

    const msgs = [
      "Connecting to your bank…",
      "Verifying credentials…",
      "Discovering accounts…",
      "Loading recent transactions…",
    ];
    for (let i = 0; i < msgs.length; i++) {
      await new Promise((r) => setTimeout(r, 700));
      setConnectingMsg(msgs[i]);
    }

    // Generate mock discovered accounts
    const raw = generateMockPlaidAccounts(selectedBank!.id, selectedBank!);
    setDiscovered(raw.map((a) => ({ ...a, selected: true })));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep("accounts");
  };

  const toggleAccount = (plaidAccountId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDiscovered((prev) =>
      prev.map((a) => a.plaidAccountId === plaidAccountId ? { ...a, selected: !a.selected } : a)
    );
  };

  const handleImport = async () => {
    const selected = discovered.filter((a) => a.selected);
    if (selected.length === 0) { return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("connecting");
    setConnectingMsg("Importing transactions…");

    await new Promise((r) => setTimeout(r, 1200));

    const itemId = `plaid_${selectedBank!.id}_${Date.now().toString(36)}`;
    const newAccounts: Omit<Account, "id">[] = selected.map((a) => ({
      name: a.name,
      bank: selectedBank!.name,
      balance: a.balance,
      type: a.type,
      color: ACCOUNT_COLORS[a.type] || selectedBank!.color,
      lastFour: a.lastFour,
      plaidItemId: itemId,
      plaidAccountId: a.plaidAccountId,
    }));

    // Generate initial transactions (30 days back)
    const tempAccForGen = selected.map((a) => ({
      id: a.plaidAccountId,
      name: a.name,
      bank: selectedBank!.name,
      balance: a.balance,
      type: a.type,
      color: selectedBank!.color,
      lastFour: a.lastFour,
    }));
    const since = new Date(Date.now() - 30 * 86400000);
    // Generate more initial transactions (8–14)
    const initialTxCount = 8 + Math.floor(Math.random() * 7);
    let allTxs: ReturnType<typeof generateMockPlaidTransactions> = [];
    for (let i = 0; i < 3; i++) {
      const batch = generateMockPlaidTransactions(tempAccForGen as any, since);
      allTxs = [...allTxs, ...batch];
    }
    // Use plaidAccountId as temporary accountId — connectPlaid will remap
    const initialTxs = allTxs.slice(0, initialTxCount).map((t) => ({
      ...t,
      accountId: t.accountId, // will be remapped by connectPlaid
    }));

    const item: PlaidItem = {
      itemId,
      bankName: selectedBank!.name,
      bankColor: selectedBank!.color,
      connectedAt: new Date().toISOString(),
      accountIds: [],
    };

    const { imported } = await connectPlaid(item, newAccounts, initialTxs as any);
    setImportResult({ accounts: selected.length, transactions: imported });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep("success");
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top + 16;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
          {step !== "connecting" ? (
            <TouchableOpacity
              onPress={() => {
                if (step === "search" || step === "success") { onClose(); return; }
                if (step === "credentials") { setStep("search"); return; }
                if (step === "accounts") { setStep("credentials"); return; }
                onClose();
              }}
            >
              <Feather name={step === "search" || step === "success" ? "x" : "arrow-left"} size={22} color={colors.foreground} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {step === "search" && "Connect a Bank"}
            {step === "credentials" && selectedBank?.name}
            {step === "connecting" && "Linking…"}
            {step === "accounts" && "Select Accounts"}
            {step === "success" && "All Done!"}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* ── Step: Search / bank list ── */}
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
          </>
        )}

        {/* ── Step: Credentials ── */}
        {step === "credentials" && selectedBank && (
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <View style={[styles.bankHero, { backgroundColor: selectedBank.color + "15" }]}>
              <Text style={styles.bankHeroEmoji}>{selectedBank.icon}</Text>
              <Text style={[styles.bankHeroName, { color: selectedBank.color }]}>{selectedBank.name}</Text>
            </View>

            <Text style={[styles.formHeadline, { color: colors.foreground }]}>Sign in to {selectedBank.name}</Text>
            <Text style={[styles.formSub, { color: colors.mutedForeground }]}>
              Your credentials are used only once to link your accounts and are never stored.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Username or Email</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: credError ? colors.expense : colors.border, color: colors.foreground }]}
                placeholder="Enter username"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={(v) => { setUsername(v); setCredError(""); }}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Password</Text>
              <View style={[styles.pwRow, { backgroundColor: colors.card, borderColor: credError ? colors.expense : colors.border }]}>
                <TextInput
                  style={[styles.pwInput, { color: colors.foreground }]}
                  placeholder="Enter password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setCredError(""); }}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            {credError ? (
              <View style={[styles.errBox, { backgroundColor: colors.expense + "12", borderColor: colors.expense + "40" }]}>
                <Feather name="alert-circle" size={14} color={colors.expense} />
                <Text style={[styles.errText, { color: colors.expense }]}>{credError}</Text>
              </View>
            ) : null}

            <View style={[styles.secureNote, { backgroundColor: colors.muted }]}>
              <Feather name="lock" size={13} color={colors.mutedForeground} />
              <Text style={[styles.secureNoteText, { color: colors.mutedForeground }]}>
                256-bit encrypted · Read-only access · Credentials never stored
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: selectedBank.color }]}
              onPress={handleConnect}
            >
              <Feather name="link" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Link {selectedBank.name}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── Step: Connecting / loading ── */}
        {step === "connecting" && (
          <View style={styles.loadingWrap}>
            <View style={[styles.loadingIcon, { backgroundColor: selectedBank ? selectedBank.color + "18" : colors.accent }]}>
              <ActivityIndicator size="large" color={selectedBank?.color || colors.primary} />
            </View>
            <Text style={[styles.loadingTitle, { color: colors.foreground }]}>{connectingMsg}</Text>
            <Text style={[styles.loadingSub, { color: colors.mutedForeground }]}>
              This usually takes just a few seconds
            </Text>
          </View>
        )}

        {/* ── Step: Account selection ── */}
        {step === "accounts" && (
          <>
            <Text style={[styles.acctSubtitle, { color: colors.mutedForeground }]}>
              Choose which accounts to import
            </Text>
            <ScrollView contentContainerStyle={styles.acctList}>
              {discovered.map((a) => (
                <TouchableOpacity
                  key={a.plaidAccountId}
                  style={[styles.acctRow, { backgroundColor: colors.card, borderColor: a.selected ? (ACCOUNT_COLORS[a.type] || colors.primary) : colors.border }]}
                  onPress={() => toggleAccount(a.plaidAccountId)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.acctIconWrap, { backgroundColor: (ACCOUNT_COLORS[a.type] || colors.primary) + "18" }]}>
                    <Feather
                      name={a.type === "credit" ? "credit-card" : a.type === "investment" ? "trending-up" : a.type === "savings" ? "dollar-sign" : "credit-card"}
                      size={18}
                      color={ACCOUNT_COLORS[a.type] || colors.primary}
                    />
                  </View>
                  <View style={styles.acctInfo}>
                    <Text style={[styles.acctName, { color: colors.foreground }]}>{a.name}</Text>
                    <Text style={[styles.acctMeta, { color: colors.mutedForeground }]}>
                      •••• {a.lastFour} · {a.type.charAt(0).toUpperCase() + a.type.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.acctRight}>
                    <Text style={[styles.acctBalance, { color: a.balance < 0 ? colors.expense : colors.foreground }]}>
                      {a.balance < 0 ? "-" : ""}${Math.abs(a.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <View style={[styles.checkbox, { borderColor: a.selected ? (ACCOUNT_COLORS[a.type] || colors.primary) : colors.border, backgroundColor: a.selected ? (ACCOUNT_COLORS[a.type] || colors.primary) : "transparent" }]}>
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
                style={[styles.primaryBtn, { backgroundColor: selectedBank?.color || colors.primary, flex: 0, paddingHorizontal: 28 }]}
                onPress={handleImport}
                disabled={discovered.filter((a) => a.selected).length === 0}
              >
                <Text style={styles.primaryBtnText}>Import</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step: Success ── */}
        {step === "success" && importResult && (
          <View style={styles.successWrap}>
            <View style={[styles.successIcon, { backgroundColor: "#10b98118" }]}>
              <Feather name="check-circle" size={48} color="#10b981" />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Bank Linked!</Text>
            <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
              Imported {importResult.accounts} account{importResult.accounts !== 1 ? "s" : ""} and {importResult.transactions} transaction{importResult.transactions !== 1 ? "s" : ""} from {selectedBank?.name}.
            </Text>

            <View style={[styles.successStats, { backgroundColor: colors.card }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: selectedBank?.color || colors.primary }]}>{importResult.accounts}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Accounts</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: selectedBank?.color || colors.primary }]}>{importResult.transactions}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Transactions</Text>
              </View>
            </View>

            <View style={[styles.dedupNote, { backgroundColor: colors.muted }]}>
              <Feather name="shield" size={13} color={colors.mutedForeground} />
              <Text style={[styles.dedupText, { color: colors.mutedForeground }]}>
                Duplicate prevention is active — Plaid and email sync will never import the same transaction twice.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: selectedBank?.color || colors.primary }]}
              onPress={onClose}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
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
  formScroll: { padding: 20, gap: 14 },
  bankHero: {
    alignSelf: "center",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 18,
    gap: 6,
    marginBottom: 4,
  },
  bankHeroEmoji: { fontSize: 36 },
  bankHeroName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  formHeadline: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  formSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, textAlign: "center" },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  pwRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  pwInput: { flex: 1, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { padding: 4 },
  errBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderRadius: 10, borderWidth: 1 },
  errText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  secureNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 11,
    borderRadius: 10,
  },
  secureNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 13,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 32 },
  loadingIcon: { width: 90, height: 90, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  loadingTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  loadingSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  acctSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 12, paddingBottom: 4 },
  acctList: { padding: 16, gap: 10 },
  acctRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, gap: 12, borderWidth: 1.5 },
  acctIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  acctInfo: { flex: 1, gap: 3 },
  acctName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  acctMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  acctRight: { alignItems: "flex-end", gap: 8 },
  acctBalance: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  acctFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderTopWidth: 1 },
  acctFooterNote: { fontSize: 13, fontFamily: "Inter_400Regular" },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 },
  successIcon: { width: 96, height: 96, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
  successStats: { flexDirection: "row", borderRadius: 16, padding: 20, gap: 0, alignSelf: "stretch", justifyContent: "center" },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statNum: { fontSize: 28, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, marginHorizontal: 16 },
  dedupNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, alignSelf: "stretch" },
  dedupText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
