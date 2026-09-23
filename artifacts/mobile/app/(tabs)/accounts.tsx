import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Defs, LinearGradient, Path, Rect, Stop, Svg } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";

import AddAccountModal from "@/components/AddAccountModal";
import ConfirmModal from "@/components/ConfirmModal";
import PlaidLinkModal from "@/components/PlaidLinkModal";
import {
  Account,
  PlaidItem,
  PLAID_BANKS,
  computeBalance,
  isIncludedInNetworth,
  isLiabilityAccount,
  getAccountGroupKey,
  getShortBankName,
  cleanCardDisplayName,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Bank Visual Styles & Gradients ───────────────────────────────────────────

export interface CardStyleMeta {
  gradient: [string, string];
  bankName: string;
  cardName: string;
  isCredit: boolean;
  categoryLabel: string;
}

export function getAccountCardMeta(account: Account): CardStyleMeta {
  const text = `${account.name || ""} ${account.bank || ""}`.toLowerCase();
  const group = getAccountGroupKey(account);
  const isMortgage = group === "mortgage" || text.includes("mortgage");
  const isCredit =
    !isMortgage &&
    (group === "credit" ||
    account.type === "credit" ||
    text.includes("credit") ||
    text.includes("card") ||
    text.includes("amex") ||
    text.includes("visa") ||
    text.includes("mastercard") ||
    text.includes("avion") ||
    text.includes("cobalt"));

  // Determine Bank / Issuer Name (strictly short names for all cards and accounts)
  let bankName = getShortBankName(account.bank, account.name);
  if (bankName === "Bank") {
    if (isMortgage) bankName = "Mortgage";
    else if (isCredit) bankName = "Credit Card";
    else bankName = account.type ? (account.type.charAt(0).toUpperCase() + account.type.slice(1)) : "Bank";
  }

  let network: string | undefined = undefined;
  if (isCredit) {
    if (text.includes("mastercard") || text.includes("mc")) network = "Mastercard";
    else if (text.includes("amex") || text.includes("american express")) network = "Amex";
    else if (text.includes("discover")) network = "Discover";
    else network = "Visa";
  }

  // Determine Card Display Name (avoid repeating bank name, remove raw/masked card numbers, show Visa/Mastercard instead of generic Credit Card)
  let cardName = cleanCardDisplayName(account.name, bankName, account.type, network);
  const lowerCard = cardName.toLowerCase();
  const lowerBank = bankName.toLowerCase();

  if (lowerCard === `rahil ${lowerBank}` || lowerCard === lowerBank) {
    if (isMortgage) cardName = "Mortgage Loan";
    else if (account.type === "savings") cardName = "High Interest Savings";
    else if (account.type === "checking") cardName = "Chequing";
    else if (isCredit) cardName = network || "Visa";
    else cardName = account.type ? (account.type.charAt(0).toUpperCase() + account.type.slice(1)) : "Main Account";
  } else if (lowerCard.startsWith(lowerBank) && cardName.length > bankName.length + 2) {
    cardName = cardName.slice(bankName.length).trim();
  }

  // Determine Category Label
  let categoryLabel = "Chequing";
  if (isMortgage) categoryLabel = "Mortgage";
  else if (isCredit) categoryLabel = "Credit Card";
  else if (group === "savings" || account.type === "savings") categoryLabel = "Savings";
  else if (group === "investment" || account.type === "investment") categoryLabel = "Investment";

  // Gradients matching reference image physical card design
  let gradient: [string, string];
  if (isMortgage) {
    gradient = ["#1E293B", "#334155"];
  } else if (text.includes("rbc") || text.includes("avion")) {
    // RBC Avion Infinite warm bronze/gold metallic gradient (Card 1 in image)
    gradient = ["#28201A", "#4E3A25"];
  } else if (text.includes("amex") || text.includes("cobalt")) {
    // Amex Cobalt deep obsidian gold-bronze metallic gradient (Card 2 in image)
    gradient = ["#1C1B19", "#3D3224"];
  } else if (isCredit) {
    // Luxury Credit Card - warm dark bronze / charcoal gold (Cards 1 & 2 in image)
    gradient = ["#221D17", "#443422"];
  } else if (text.includes("tangerine")) {
    // Tangerine emerald forest green gradient (Card 3 in image)
    gradient = ["#073E2E", "#0B6248"];
  } else if (text.includes("td")) {
    // TD deep pine green
    gradient = ["#063927", "#09543A"];
  } else if (text.includes("cibc") || text.includes("scotia")) {
    // CIBC / Scotiabank rich burgundy
    gradient = ["#3B0D18", "#6E1B2E"];
  } else if (text.includes("wealthsimple") || group === "investment" || text.includes("tfsa") || text.includes("non-registered")) {
    // Deep obsidian amethyst
    gradient = ["#1A1729", "#34224A"];
  } else {
    // Deep sapphire navy
    gradient = ["#151B27", "#232F42"];
  }

  return {
    bankName,
    cardName,
    gradient,
    isCredit,
    categoryLabel,
  };
}

// ── Realistic Gold EMV Card Chip ──────────────────────────────────────────────

function EmvChip() {
  return (
    <View style={styles.chipContainer}>
      <ExpoLinearGradient
        colors={["#E6C87C", "#C59B3F", "#A07928"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.chipInnerBorder}>
        <View style={styles.chipLineHorizontal} />
        <View style={styles.chipLineVertical} />
        <View style={styles.chipCenterPad} />
      </View>
    </View>
  );
}

// ── Screen 1: Luxury Bank Card ────────────────────────────────────────────────

function VibrantAccountCard({ account, onRelink }: { account: Account; onRelink?: (item: PlaidItem) => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { deleteAccount, transactions, plaidSync } = useApp();
  const liveBalance = computeBalance(account, transactions);
  const meta = getAccountCardMeta(account);
  const isCredit = meta.isCredit;

  const plaidItem = useMemo(() => {
    if (account.plaidItemId) {
      const match = plaidSync.items.find((i) => i.itemId === account.plaidItemId);
      if (match) return match;
    }
    const byAccId = plaidSync.items.find((i) => i.accountIds?.includes(account.id));
    if (byAccId) return byAccId;
    const byMap = plaidSync.items.find((i) => {
      if (!i.plaidAccountMap) return false;
      return (
        Object.values(i.plaidAccountMap).includes(account.id) ||
        (account.plaidAccountId && i.plaidAccountMap[account.plaidAccountId] === account.id)
      );
    });
    if (byMap) return byMap;
    if (account.bank) {
      return (
        plaidSync.items.find(
          (i) => i.bankName.toLowerCase() === account.bank.toLowerCase()
        ) || null
      );
    }
    return null;
  }, [account, plaidSync.items]);

  const cardErrorLabel = plaidItem?.needsRelogin
    ? "Needs reconnect"
    : plaidItem?.syncError
    ? (plaidItem.syncError.toLowerCase().includes("login") || plaidItem.syncError.toLowerCase().includes("reconnect")
        ? "Needs reconnect"
        : "Needs review")
    : null;

  // Credit limit calculation
  const limit = account.creditLimit || (isCredit ? 8000 : 0);
  const utilizationRatio = limit > 0 ? Math.min(1, Math.max(0.04, Math.abs(liveBalance) / limit)) : 0;

  return (
    <>
      <TouchableOpacity
        style={styles.cardContainer}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: "/account/[id]", params: { id: account.id } });
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowDeleteConfirm(true);
        }}
        activeOpacity={0.92}
      >
        {/* Dynamic Gradient Background */}
        <ExpoLinearGradient
          colors={meta.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Card Top Row: Bank Name + Gold EMV Chip */}
        <View style={styles.cardTopRow}>
          <Text style={styles.cardBankName} numberOfLines={1}>
            {meta.bankName}
          </Text>
          <EmvChip />
        </View>

        {/* Card Middle: Account Name + Large Balance */}
        <View style={styles.cardMiddle}>
          <Text style={styles.cardAccountName} numberOfLines={1}>
            {meta.cardName}
          </Text>
          <Text style={styles.cardBalance} numberOfLines={1}>
            ${Math.abs(liveBalance).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>

        {/* Card Bottom: Masked Number + Limit + Progress Bar */}
        <View style={styles.cardBottom}>
          <View style={styles.cardBottomInfoRow}>
            <Text style={styles.cardMaskedNumber}>
              •••• {account.lastFour || "4242"}
            </Text>
            {cardErrorLabel ? (
              <TouchableOpacity
                style={styles.cardNeedsReconnectBadge}
                activeOpacity={0.7}
                onPress={(e) => {
                  e.stopPropagation?.();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  if (plaidItem && onRelink) {
                    onRelink(plaidItem);
                  } else {
                    router.push({ pathname: "/account/[id]", params: { id: account.id } });
                  }
                }}
              >
                <Feather name="alert-triangle" size={11} color="#FBBF24" />
                <Text style={styles.cardNeedsReconnectText}>{cardErrorLabel}</Text>
              </TouchableOpacity>
            ) : isCredit && limit > 0 ? (
              <Text style={styles.cardLimitText}>
                Limit ${limit.toLocaleString("en-US")}
              </Text>
            ) : null}
          </View>

          {/* Credit limit utilization bar */}
          {isCredit && limit > 0 && (
            <View style={styles.cardProgressBarTrack}>
              <View
                style={[
                  styles.cardProgressBarFill,
                  cardErrorLabel ? { backgroundColor: "#F59E0B" } : null,
                  { width: `${Math.min(100, Math.max(6, utilizationRatio * 100))}%` },
                ]}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Account"
        message={`Remove "${account.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmDestructive
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteAccount(account.id);
        }}
      />
    </>
  );
}

// ── Email Connect Modal ───────────────────────────────────────────────────────

function EmailConnectModal({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connectEmail, emailSync } = useApp();
  const wasConnected = emailSync.isConnected;
  const [step, setStep] = useState<"form" | "loading" | "success" | "error">("form");
  const [email, setEmail] = useState(emailSync.email || "");
  const [appPassword, setAppPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handle = async () => {
    if (!email.includes("@")) { setErrorMsg("Please enter a valid email address."); return; }
    if (appPassword.length < 8) { setErrorMsg("Please enter your app password."); return; }
    setStep("loading"); setErrorMsg("");
    const result = await connectEmail(email.trim(), appPassword.trim());
    if (result.success) {
      setStep("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setErrorMsg(result.error || "Connection failed.");
      setStep("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };
  const isGmail = email.toLowerCase().includes("@gmail");

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.modalHeader, { paddingTop: 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{wasConnected ? "Update Email" : "Connect Email"}</Text>
          <View style={{ width: 22 }} />
        </View>
        <KeyboardAwareScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.emailIconLarge, { backgroundColor: colors.accent }]}>
            <Feather name="mail" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.modalHeadline, { color: colors.foreground }]}>{wasConnected ? "Update email connection" : "Sync bank email alerts"}</Text>
          <Text style={[styles.modalSubtext, { color: colors.mutedForeground }]}>
            {wasConnected ? "Enter new credentials to replace the existing connection." : "We read your bank transaction alert emails directly via IMAP and parse them into transactions."}
          </Text>
          {(step === "form" || step === "error") && (
            <View style={styles.formSection}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Email Address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: step === "error" ? colors.expense : colors.border }]}
                  placeholder="you@gmail.com" placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                  value={email} onChangeText={(v) => { setEmail(v); setStep("form"); setErrorMsg(""); }}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>App Password</Text>
                <View style={[styles.passwordRow, { backgroundColor: colors.card, borderColor: step === "error" ? colors.expense : colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.foreground }]}
                    placeholder="xxxx xxxx xxxx xxxx" placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
                    value={appPassword} onChangeText={(v) => { setAppPassword(v); setStep("form"); setErrorMsg(""); }}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.inputHint, { color: colors.mutedForeground }]}>Use an App Password, not your regular password</Text>
              </View>
              {errorMsg ? (
                <View style={[styles.errorBox, { backgroundColor: colors.expense + "15", borderColor: colors.expense + "40" }]}>
                  <Feather name="alert-circle" size={15} color={colors.expense} />
                  <Text style={[styles.errorText, { color: colors.expense }]}>{errorMsg}</Text>
                </View>
              ) : null}
              <TouchableOpacity style={[styles.connectBtn, { backgroundColor: colors.primary }]} onPress={handle}>
                <Feather name="link" size={16} color="#fff" />
                <Text style={styles.connectBtnText}>{wasConnected ? "Update Connection" : "Connect Email"}</Text>
              </TouchableOpacity>
              {isGmail && (
                <View style={[styles.instructionsBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.instructionsTitle, { color: colors.foreground }]}>How to get a Gmail App Password</Text>
                  {["1. Go to myaccount.google.com", "2. Click Security → 2-Step Verification", "3. App passwords → Create FinTrack", "4. Paste password above"].map((s) => (
                    <Text key={s} style={[styles.instructionsStep, { color: colors.mutedForeground }]}>{s}</Text>
                  ))}
                  <TouchableOpacity style={[styles.openLinkBtn, { borderColor: colors.primary }]} onPress={() => Linking.openURL("https://myaccount.google.com/apppasswords")}>
                    <Feather name="external-link" size={13} color={colors.primary} />
                    <Text style={[styles.openLinkText, { color: colors.primary }]}>Open Google App Passwords</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {step === "loading" && (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.foreground }]}>Testing connection...</Text>
            </View>
          )}
          {step === "success" && (
            <View style={styles.successState}>
              <View style={[styles.successIcon, { backgroundColor: colors.success + "18" }]}>
                <Feather name="check-circle" size={40} color={colors.success} />
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>{wasConnected ? "Updated!" : "Connected!"}</Text>
              <TouchableOpacity style={[styles.connectBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
                <Text style={styles.connectBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Connected Institutions Modal ──────────────────────────────────────────────

function ConnectedInstitutionsModal({
  visible,
  onClose,
  onRelink,
  onAddPlaid,
  onAddEmail,
}: {
  visible: boolean;
  onClose: () => void;
  onRelink: (item: PlaidItem) => void;
  onAddPlaid: () => void;
  onAddEmail: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { plaidSync, emailSync, disconnectEmail, syncEmailTransactions, updateEmailSyncSettings, wipeAllTransactions, isSyncing } = useApp();
  const [syncResult, setSyncResult] = useState<{ imported: number; error?: string } | null>(null);
  const [showEmailDisconnectConfirm, setShowEmailDisconnectConfirm] = useState(false);

  const handleEmailSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSyncResult(null);
    const result = await syncEmailTransactions();
    setSyncResult(result);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
        <View style={[styles.modalHeader, { paddingTop: (Platform.OS === "web" ? 20 : insets.top) + 16, borderBottomColor: "#E5E7EB" }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: "#111827" }]}>Connected Institutions</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {plaidSync.items.map((item) => (
            <View key={item.itemId} style={[styles.plaidPanel, { backgroundColor: "#FFFFFF", borderColor: item.bankColor + "40" }]}>
              <View style={styles.plaidPanelTop}>
                <View style={[styles.plaidIconBg, { backgroundColor: item.bankColor + "18" }]}>
                  <Feather name="link" size={16} color={item.bankColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.plaidBankName, { color: "#111827" }]}>{item.bankName}</Text>
                  <Text style={[styles.plaidSub, { color: "#6B7280" }]}>
                    {item.accountIds.length} account{item.accountIds.length !== 1 ? "s" : ""} linked
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {emailSync.isConnected && (
            <View style={[styles.plaidPanel, { backgroundColor: "#FFFFFF", borderColor: "#10B98150" }]}>
              <View style={styles.plaidPanelTop}>
                <View style={[styles.plaidIconBg, { backgroundColor: "#10B98118" }]}>
                  <Feather name="mail" size={16} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.plaidBankName, { color: "#111827" }]}>Email Sync</Text>
                  <Text style={[styles.plaidSub, { color: "#6B7280" }]} numberOfLines={1}>{emailSync.email}</Text>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.addInstRow, { backgroundColor: "#FFFFFF", borderColor: "#2563EB40" }]}
            onPress={onAddPlaid}
          >
            <View style={[styles.instIconBg, { backgroundColor: "#2563EB18" }]}>
              <Feather name="plus" size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.instRowTitle, { color: "#111827" }]}>Connect Another Bank</Text>
              <Text style={[styles.instRowSub, { color: "#6B7280" }]}>Via Plaid</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#2563EB" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Filter Options ────────────────────────────────────────────────────────────

const FILTERS = ["All", "Cards", "Savings", "Chequing", "Other"] as const;
type FilterType = (typeof FILTERS)[number];

// ── Main Accounts Screen ──────────────────────────────────────────────────────

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const {
    accounts,
    transactions,
    plaidSync,
    emailSync,
    userName,
    totalBalance,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<FilterType>("All");
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showPlaidModal, setShowPlaidModal] = useState(false);
  const [showEmailConnect, setShowEmailConnect] = useState(false);
  const [showInstitutions, setShowInstitutions] = useState(false);
  const [relinkItem, setRelinkItem] = useState<PlaidItem | null>(null);

  // Greeting based on hour
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning,";
    if (hour < 18) return "Good afternoon,";
    return "Good evening,";
  }, []);

  const displayName = userName || "Rahil";

  // Assets total: sum of all non-liability accounts included in net worth (chequing, savings, investments)
  const assetsTotal = useMemo(() => {
    return accounts
      .filter((a) => isIncludedInNetworth(a) && !isLiabilityAccount(a))
      .reduce((s, a) => s + computeBalance(a, transactions), 0);
  }, [accounts, transactions]);

  // Liabilities total: sum of all liability accounts included in net worth (credit cards, mortgages, loans)
  const liabilitiesTotal = useMemo(() => {
    return accounts
      .filter((a) => isIncludedInNetworth(a) && isLiabilityAccount(a))
      .reduce((s, a) => {
        const bal = computeBalance(a, transactions);
        return s + bal;
      }, 0);
  }, [accounts, transactions]);

  // Total balance (Net Worth) = Assets - Liabilities
  const netTotal = useMemo(() => {
    return assetsTotal - liabilitiesTotal;
  }, [assetsTotal, liabilitiesTotal]);

  // 7-day trend calculation
  const sevenDayTrend = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split("T")[0];

    const netChange = transactions
      .filter((t) => t.date >= dateStr && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer")
      .reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);

    return netChange;
  }, [transactions]);

  // ── Filtered Accounts ───────────────────────────────────────────────────────
  console.log("=== ACCOUNTS BREAKDOWN ===", JSON.stringify(accounts.map(a => ({
    name: a.name,
    type: a.type,
    group: getAccountGroupKey(a),
    balance: computeBalance(a, transactions),
    includeInNetworth: isIncludedInNetworth(a),
    isLiability: isLiabilityAccount(a),
  }))));
  const filteredAccounts = useMemo(() => {
    if (activeFilter === "All") return accounts;
    if (activeFilter === "Cards") {
      return accounts.filter((a) => {
        const group = getAccountGroupKey(a);
        const text = `${a.name || ""} ${a.bank || ""}`.toLowerCase();
        const isMortgage = group === "mortgage" || text.includes("mortgage");
        if (isMortgage) return false;
        return a.type === "credit" || group === "credit";
      });
    }
    if (activeFilter === "Savings") {
      return accounts.filter((a) => {
        const group = getAccountGroupKey(a);
        const text = `${a.name || ""} ${a.bank || ""}`.toLowerCase();
        return a.type === "savings" && group !== "mortgage" && !text.includes("mortgage");
      });
    }
    if (activeFilter === "Chequing") {
      return accounts.filter((a) => {
        const group = getAccountGroupKey(a);
        const text = `${a.name || ""} ${a.bank || ""}`.toLowerCase();
        return a.type === "checking" && group !== "mortgage" && !text.includes("mortgage");
      });
    }
    // "Other" -> includes Mortgages, Loans, Investments, and custom accounts
    return accounts.filter((a) => {
      const group = getAccountGroupKey(a);
      const text = `${a.name || ""} ${a.bank || ""}`.toLowerCase();
      const isMortgage = group === "mortgage" || text.includes("mortgage");
      if (isMortgage) return true;
      const isCard = a.type === "credit" || group === "credit";
      const isSav = a.type === "savings";
      const isChk = a.type === "checking";
      return !isCard && !isSav && !isChk;
    });
  }, [accounts, activeFilter]);

  // Sum of balances for currently visible (filtered) accounts.
  // For "Other" (mortgages + investments), liabilities are subtracted so the
  // result mirrors the net-worth formula: assets - liabilities.
  const filteredTotal = useMemo(() => {
    return filteredAccounts.reduce((s, a) => {
      const bal = computeBalance(a, transactions);
      if (activeFilter === "Other" && isLiabilityAccount(a)) {
        return s - bal; // mortgage/loan: subtract
      }
      return s + bal;
    }, 0);
  }, [filteredAccounts, transactions, activeFilter]);

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84,
        }}
      >
        {/* ── Header: Accounts Title & Circular Add (+) Button ── */}
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <Text style={styles.screenTitle}>Accounts</Text>
            <TouchableOpacity
              style={styles.headerAddBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAddChoice(true);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={20} color="#18181B" />
            </TouchableOpacity>
          </View>

          {/* ── Total balance directly below Accounts header ── */}
          <View style={styles.totalBalanceWrap}>
            <Text style={styles.totalBalanceLabel}>Total balance</Text>
            <Text style={[styles.totalBalanceAmount, netTotal < 0 && { color: "#DC2626" }]}>
              {netTotal < 0 ? "-" : ""}${Math.round(Math.abs(netTotal)).toLocaleString("en-US")}
            </Text>
          </View>
        </View>

        {/* ── Summary Cards: Assets & Liabilities — or Selected Filter Total ── */}
        {activeFilter === "All" ? (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Assets</Text>
              <Text style={styles.summaryAmount} numberOfLines={1} adjustsFontSizeToFit>
                ${Math.round(assetsTotal).toLocaleString("en-US")}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Liabilities</Text>
              <Text style={styles.summaryAmount} numberOfLines={1} adjustsFontSizeToFit>
                ${Math.round(Math.max(0, liabilitiesTotal)).toLocaleString("en-US")}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.summaryRow}>
            <View style={styles.selectedTotalCard}>
              <View style={styles.selectedTotalLeft}>
                <Text style={styles.summaryLabel}>
                  {activeFilter === "Cards"
                    ? "Credit Cards"
                    : activeFilter === "Other"
                    ? "Other net"
                    : activeFilter}{" total"}
                </Text>
                <Text
                  style={[
                    styles.selectedTotalAmount,
                    (activeFilter === "Cards" && filteredTotal !== 0) && { color: "#DC2626" },
                    (activeFilter === "Other" && filteredTotal < 0) && { color: "#DC2626" },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {(activeFilter === "Cards" && filteredTotal < 0) || (activeFilter === "Other" && filteredTotal < 0) ? "-" : ""}
                  ${Math.round(Math.abs(filteredTotal)).toLocaleString("en-US")}
                </Text>
              </View>
              <View style={styles.selectedTotalBadge}>
                <Text style={styles.selectedTotalBadgeText}>
                  {filteredAccounts.length} account{filteredAccounts.length !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Filter Chips Bar ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
        >
          {FILTERS.map((f) => {
            const isActive = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, isActive ? styles.filterPillActive : styles.filterPillInactive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveFilter(f);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterPillText, isActive ? styles.filterPillTextActive : styles.filterPillTextInactive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Account Cards List (Screen 1 Design) ── */}
        <View style={styles.cardsList}>
          {filteredAccounts.map((account) => (
            <VibrantAccountCard key={account.id} account={account} onRelink={setRelinkItem} />
          ))}

          {/* Empty State */}
          {filteredAccounts.length === 0 && (
            <View style={styles.emptyWrap}>
              <Feather name="credit-card" size={36} color="#9CA3AF" />
              <Text style={styles.emptyText}>
                No {activeFilter === "All" ? "" : activeFilter.toLowerCase() + " "}accounts found
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowAddChoice(true);
                }}
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyActionText}>Add Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Add Account Choice Modal (Connect Bank vs Manual) ── */}
      <Modal
        visible={showAddChoice}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddChoice(false)}
      >
        <TouchableOpacity
          style={styles.choiceModalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddChoice(false)}
        >
          <View style={[styles.choiceModalSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.choiceModalHandle} />
            <Text style={styles.choiceModalTitle}>Add an Account</Text>
            <Text style={styles.choiceModalSub}>Choose how you'd like to add or connect your account</Text>

            {/* Option 1: Connect Bank (Screen 6 Plaid) */}
            <TouchableOpacity
              style={styles.choiceCardPrimary}
              onPress={() => {
                setShowAddChoice(false);
                setTimeout(() => setShowPlaidModal(true), 200);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.choiceIconBgBlue}>
                <Feather name="link" size={22} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.choiceCardTitle}>Connect Your Bank</Text>
                  <View style={styles.choiceBadgeBlue}>
                    <Text style={styles.choiceBadgeTextBlue}>Automated</Text>
                  </View>
                </View>
                <Text style={styles.choiceCardDesc}>
                  Securely link RBC, TD, Scotiabank, BMO, CIBC, Tangerine & more via Plaid.
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="#2563EB" />
            </TouchableOpacity>

            {/* Option 2: Add Manual Account (Preserved!) */}
            <TouchableOpacity
              style={styles.choiceCardSecondary}
              onPress={() => {
                setShowAddChoice(false);
                setTimeout(() => setShowManualAdd(true), 200);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.choiceIconBgGreen}>
                <Feather name="edit-3" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.choiceCardTitle}>Add Manual Account</Text>
                  <View style={styles.choiceBadgeGreen}>
                    <Text style={styles.choiceBadgeTextGreen}>Custom</Text>
                  </View>
                </View>
                <Text style={styles.choiceCardDesc}>
                  Track cash, loans, mortgages, wallets, or any custom accounts manually.
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="#059669" />
            </TouchableOpacity>

            {/* Option 3: Connect Email Sync */}
            <TouchableOpacity
              style={styles.choiceCardSubtle}
              onPress={() => {
                setShowAddChoice(false);
                setTimeout(() => setShowEmailConnect(true), 200);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.choiceIconBgOrange}>
                <Feather name="mail" size={20} color="#EA580C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceCardTitleSubtle}>Sync Bank Email Alerts</Text>
                <Text style={styles.choiceCardDescSubtle}>
                  Auto-parse transaction alerts from your Gmail, Outlook, or iCloud inbox.
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Submodals ── */}
      <AddAccountModal
        visible={showManualAdd}
        onClose={() => setShowManualAdd(false)}
        onConnectBank={() => {
          setShowManualAdd(false);
          setTimeout(() => setShowPlaidModal(true), 250);
        }}
      />
      {showEmailConnect && <EmailConnectModal onClose={() => setShowEmailConnect(false)} />}
      {(showPlaidModal || relinkItem) && (
        <PlaidLinkModal
          onClose={() => { setShowPlaidModal(false); setRelinkItem(null); }}
          relinkItemId={relinkItem?.itemId}
          relinkBankName={relinkItem?.bankName}
        />
      )}
      <ConnectedInstitutionsModal
        visible={showInstitutions}
        onClose={() => setShowInstitutions(false)}
        onRelink={(item) => {
          setShowInstitutions(false);
          setTimeout(() => setRelinkItem(item), 350);
        }}
        onAddPlaid={() => {
          setShowInstitutions(false);
          setTimeout(() => setShowPlaidModal(true), 350);
        }}
        onAddEmail={() => {
          setShowInstitutions(false);
          setTimeout(() => setShowEmailConnect(true), 350);
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles (Matching Screen 1) ────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F4EF",
  },

  // Header Section
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 20 : 12,
    paddingBottom: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  screenTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.6,
    color: "#111827",
  },
  headerAddBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  totalBalanceWrap: {
    marginTop: 8,
    gap: 2,
  },
  totalBalanceLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  totalBalanceAmount: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.6,
    color: "#111827",
  },

  // Summary Row (Assets & Credit used)
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    marginBottom: 6,
  },
  summaryAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    letterSpacing: -0.5,
  },

  // Selected Filter Total Card (full-width when a filter is active)
  selectedTotalCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  selectedTotalLeft: {
    flex: 1,
    gap: 4,
  },
  selectedTotalAmount: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    letterSpacing: -0.6,
  },
  selectedTotalBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 12,
  },
  selectedTotalBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },

  // Filter Bar
  filterBar: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 16,
  },
  filterPill: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  filterPillActive: {
    backgroundColor: "#18181B",
  },
  filterPillInactive: {
    backgroundColor: "#ECE8DF",
  },
  filterPillText: {
    fontSize: 14,
  },
  filterPillTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  filterPillTextInactive: {
    fontFamily: "Inter_500Medium",
    color: "#1F2937",
  },

  // Cards List
  cardsList: {
    paddingHorizontal: 20,
    gap: 14,
  },

  // EMV Chip
  chipContainer: {
    width: 38,
    height: 26,
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255, 230, 150, 0.35)",
  },
  chipInnerBorder: {
    width: 30,
    height: 19,
    borderWidth: 0.6,
    borderColor: "rgba(100, 75, 20, 0.22)",
    borderRadius: 4,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  chipLineHorizontal: {
    position: "absolute",
    width: "100%",
    height: 0.6,
    backgroundColor: "rgba(100, 75, 20, 0.18)",
  },
  chipLineVertical: {
    position: "absolute",
    height: "100%",
    width: 0.6,
    backgroundColor: "rgba(100, 75, 20, 0.18)",
  },
  chipCenterPad: {
    width: 12,
    height: 8,
    borderRadius: 2,
    borderWidth: 0.6,
    borderColor: "rgba(100, 75, 20, 0.22)",
    backgroundColor: "rgba(255, 235, 170, 0.12)",
  },

  // Luxury Bank Card
  cardContainer: {
    borderRadius: 24,
    overflow: "hidden",
    padding: 22,
    minHeight: 185,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBankName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "rgba(255, 255, 255, 0.88)",
    letterSpacing: 0.4,
  },
  cardMiddle: {
    marginVertical: 14,
    gap: 4,
  },
  cardAccountName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255, 255, 255, 0.95)",
  },
  cardBalance: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.6,
  },
  cardBottom: {
    marginTop: "auto",
    gap: 8,
  },
  cardBottomInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMaskedNumber: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255, 255, 255, 0.75)",
    letterSpacing: 1,
  },
  cardLimitText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.75)",
  },
  cardNeedsReconnectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.45)",
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 10,
  },
  cardNeedsReconnectText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#FBBF24",
    letterSpacing: 0.2,
  },
  cardProgressBarTrack: {
    width: "100%",
    height: 3.5,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  cardProgressBarFill: {
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 2,
  },

  // Empty State
  emptyWrap: {
    padding: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#2563EB",
  },
  emptyActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },

  // Choice Modal Sheet
  choiceModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  choiceModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  choiceModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 16,
  },
  choiceModalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  choiceModalSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 20,
  },
  choiceCardPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    marginBottom: 12,
  },
  choiceIconBgBlue: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceCardTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  choiceCardDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#4B5563",
    marginTop: 3,
    lineHeight: 16,
  },
  choiceBadgeBlue: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  choiceBadgeTextBlue: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  choiceCardSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
    marginBottom: 12,
  },
  choiceIconBgGreen: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceBadgeGreen: {
    backgroundColor: "#059669",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  choiceBadgeTextGreen: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  choiceCardSubtle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  choiceIconBgOrange: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceCardTitleSubtle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  choiceCardDescSubtle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 1,
  },

  // Plaid panel styles
  plaidPanel: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  plaidPanelTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  plaidIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  plaidBankName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  plaidSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Institutions modal row
  addInstRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  instRowTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  instRowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  instIconBg: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  // Modals (email)
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalContent: { padding: 20, gap: 16 },
  emailIconLarge: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  modalHeadline: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  modalSubtext: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
  formSection: { gap: 14 },
  inputGroup: { gap: 7 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  passwordRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  passwordInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { padding: 4 },
  inputHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  connectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  connectBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  instructionsBox: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  instructionsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  instructionsStep: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  openLinkBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start", marginTop: 2 },
  openLinkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loadingState: { paddingVertical: 40, alignItems: "center", gap: 14 },
  loadingText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  successState: { paddingVertical: 20, alignItems: "center", gap: 14 },
  successIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
});
