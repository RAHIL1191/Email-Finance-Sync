import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Circle, Defs, LinearGradient, Path, Rect, Stop, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Account,
  PLAID_BANKS,
  PlaidItem,
  getApiBase,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const PlaidSDK: {
  create: (cfg: { token: string }) => void;
  open: (cfg: {
    onSuccess: (s: { publicToken: string | null }) => void;
    onExit: (e: { error?: { displayMessage?: string; errorMessage?: string } | null }) => void;
  }) => void;
} | null = Platform.OS !== "web" ? require("react-native-plaid-link-sdk") : null;

export type Step =
  | "search"            // Screen 6: Connect your bank
  | "connecting"        // Screen 7: Connecting to your bank (radar + 3-step checklist)
  | "accounts"          // Discovered accounts picker
  | "importing"         // Saving accounts to app
  | "success"           // Screen 8: Success!
  | "error_login"       // Screen 9: Login failed
  | "error_rate_limit"  // Screen 10: Rate limit exceeded
  | "error";            // Generic error

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
  checking: "#2563eb",
  savings: "#059669",
  credit: "#d97706",
  investment: "#7c3aed",
};

// ── Canadian Popular Banks Data (Screen 6) ───────────────────────────────────

export const POPULAR_BANKS = [
  {
    id: "rbc",
    name: "RBC",
    fullName: "Royal Bank of Canada",
    color: "#0051A5",
    badgeBg: "#0051A5",
    badgeText: "RBC",
    badgeColor: "#FDE047",
    accountTypes: ["checking", "savings", "credit", "investment"],
  },
  {
    id: "td",
    name: "TD",
    fullName: "TD Canada Trust",
    color: "#008A00",
    badgeBg: "#008A00",
    badgeText: "TD",
    badgeColor: "#FFFFFF",
    accountTypes: ["checking", "savings", "credit"],
  },
  {
    id: "scotia",
    name: "Scotiabank",
    fullName: "Scotiabank",
    color: "#ED0722",
    badgeBg: "#ED0722",
    badgeText: "S",
    badgeColor: "#FFFFFF",
    accountTypes: ["checking", "savings", "credit"],
  },
  {
    id: "bmo",
    name: "BMO",
    fullName: "Bank of Montreal",
    color: "#0079C1",
    badgeBg: "#0079C1",
    badgeText: "BMO",
    badgeColor: "#FFFFFF",
    accountTypes: ["checking", "savings", "credit"],
  },
  {
    id: "cibc",
    name: "CIBC",
    fullName: "CIBC",
    color: "#990024",
    badgeBg: "#990024",
    badgeText: "CIBC",
    badgeColor: "#FFFFFF",
    accountTypes: ["checking", "savings", "credit"],
  },
  {
    id: "tangerine",
    name: "Tangerine",
    fullName: "Tangerine",
    color: "#F37023",
    badgeBg: "#F37023",
    badgeText: "T",
    badgeColor: "#FFFFFF",
    accountTypes: ["checking", "savings", "credit"],
  },
];

export const OTHER_BANKS = [
  { id: "vancity", name: "VanCity", sub: "VanCity Credit Union", color: "#E02B20", badge: "V" },
  { id: "nbc", name: "National Bank", sub: "National Bank of Canada", color: "#E51937", badge: "NBC" },
  { id: "atb", name: "ATB Financial", sub: "Alberta Treasury Branches", color: "#0085CA", badge: "ATB" },
  { id: "simplii", name: "Simplii Financial", sub: "Simplii Financial", color: "#FF4E00", badge: "SF" },
  { id: "wealthsimple", name: "Wealthsimple", sub: "Wealthsimple Investments", color: "#323232", badge: "W" },
  { id: "eq", name: "EQ Bank", sub: "Equitable Bank", color: "#B5121B", badge: "EQ" },
];

// ── Web Plaid iframe loader ──────────────────────────────────────────────────

function openPlaidIframe(
  linkToken: string,
  apiBase: string
): Promise<{ publicToken: string; metadata: unknown }> {
  return new Promise((resolve, reject) => {
    const url = `${apiBase}/api/plaid/link-page?token=${encodeURIComponent(linkToken)}`;
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
        reject(new Error(event.data?.error?.errorMessage || "exit"));
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

// ── Authentic Plaid Header Component ─────────────────────────────────────────

function PlaidHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.plaidHeader}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.backBtn}
      >
        <Feather name="arrow-left" size={20} color="#111827" />
      </TouchableOpacity>

      {/* Plaid Emblem & Name */}
      <View style={styles.plaidBrandWrap}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="4" width="4" height="4" rx="1" fill="#111827" />
          <Rect x="10" y="4" width="4" height="4" rx="1" fill="#111827" />
          <Rect x="16" y="4" width="4" height="4" rx="1" fill="#111827" />
          <Rect x="4" y="10" width="4" height="4" rx="1" fill="#111827" />
          <Rect x="16" y="10" width="4" height="4" rx="1" fill="#111827" />
          <Rect x="4" y="16" width="4" height="4" rx="1" fill="#111827" />
          <Rect x="10" y="16" width="4" height="4" rx="1" fill="#111827" />
          <Rect x="16" y="16" width="4" height="4" rx="1" fill="#111827" />
        </Svg>
        <Text style={styles.plaidBrandText}>PLAID</Text>
      </View>

      <View style={{ width: 24 }} />
    </View>
  );
}

// ── Main PlaidLinkModal Component ─────────────────────────────────────────────

export default function PlaidLinkModal({
  onClose,
  relinkItemId,
  relinkBankName,
  onOpenManual,
}: {
  onClose: () => void;
  relinkItemId?: string;
  relinkBankName?: string;
  onOpenManual?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { connectPlaid, syncPlaidTransactions, deviceId, householdId } = useApp();

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [discovered, setDiscovered] = useState<DiscoveredAccount[]>([]);
  const [serverTransactions, setServerTransactions] = useState<ServerTransaction[]>([]);
  const [plaidItemId, setPlaidItemId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Stepper state for Screen 7
  const [connectStepIndex, setConnectStepIndex] = useState<number>(0);

  // Animation for pulse radar
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (step === "connecting") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [step, pulseAnim]);

  // Stepper progression for Screen 7
  useEffect(() => {
    if (step === "connecting") {
      setConnectStepIndex(0);
      const t1 = setTimeout(() => setConnectStepIndex(1), 1200);
      const t2 = setTimeout(() => setConnectStepIndex(2), 2400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [step]);

  // Handle relink
  useEffect(() => {
    if (!relinkItemId || !relinkBankName) return;
    const match =
      POPULAR_BANKS.find((b) => b.name.toLowerCase() === relinkBankName.toLowerCase()) ||
      POPULAR_BANKS[0];
    handleBankSelect(match, relinkItemId);
  }, [relinkItemId, relinkBankName]);

  // ── Open Plaid Link ──────────────────────────────────────────────────────────
  const handleBankSelect = async (bank: any, itemId?: string) => {
    setSelectedBank(bank);
    setErrorMsg("");
    setStep("connecting");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const resp = await fetch(`${getApiBase()}/api/plaid/create-link-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdId,
          "X-Device-ID": deviceId,
        },
        body: JSON.stringify({
          institution_id: bank.id,
          access_token_item_id: itemId,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.link_token) {
        const errStr = data.error || "Failed to initialize Plaid connection";
        handleErrorTransition(errStr);
        return;
      }

      const linkToken = data.link_token;

      // Platform Plaid Link
      if (Platform.OS === "web") {
        try {
          const { publicToken } = await openPlaidIframe(linkToken, getApiBase());
          await handleTokenExchange(publicToken, bank, itemId);
        } catch (e: any) {
          if (e.message !== "exit") {
            handleErrorTransition(e.message || "Connection was closed");
          } else {
            setStep("search");
          }
        }
      } else if (PlaidSDK) {
        PlaidSDK.create({ token: linkToken });
        PlaidSDK.open({
          onSuccess: async (success) => {
            if (success.publicToken) {
              await handleTokenExchange(success.publicToken, bank, itemId);
            }
          },
          onExit: (exit) => {
            if (exit?.error) {
              handleErrorTransition(exit.error.displayMessage || exit.error.errorMessage || "Bank login cancelled");
            } else {
              setStep("search");
            }
          },
        });
      } else {
        // Fallback for native development environment if PlaidSDK native module isn't linked
        setTimeout(() => {
          // Simulate successful discovery for testing
          setDiscovered([
            {
              plaidAccountId: "sim-1",
              name: `${bank.name} Chequing`,
              type: "checking",
              balance: 4320.75,
              lastFour: "5678",
              selected: true,
            },
            {
              plaidAccountId: "sim-2",
              name: `${bank.name} Savings`,
              type: "savings",
              balance: 8450.20,
              lastFour: "4321",
              selected: true,
            },
          ]);
          setStep("accounts");
        }, 3000);
      }
    } catch (err: any) {
      handleErrorTransition(err.message || "Network error");
    }
  };

  const handleErrorTransition = (msg: string) => {
    setErrorMsg(msg);
    const lower = msg.toLowerCase();
    if (lower.includes("rate") || lower.includes("limit") || lower.includes("429") || lower.includes("too many")) {
      setStep("error_rate_limit");
    } else {
      setStep("error_login");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handleTokenExchange = async (publicToken: string, bank: any, itemId?: string) => {
    try {
      if (itemId) {
        await fetch(`${getApiBase()}/api/plaid/exchange-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Household-ID": householdId,
            "X-Device-ID": deviceId,
          },
          body: JSON.stringify({ public_token: publicToken, existing_item_id: itemId }),
        });
        await syncPlaidTransactions(itemId, true);
        setStep("success");
        return;
      }

      const res = await fetch(`${getApiBase()}/api/plaid/exchange-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdId,
          "X-Device-ID": deviceId,
        },
        body: JSON.stringify({
          public_token: publicToken,
          bank_name: bank.fullName || bank.name,
          bank_color: bank.color,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        handleErrorTransition(data.error || "Failed to exchange token");
        return;
      }

      setPlaidItemId(data.itemId);
      const accts: DiscoveredAccount[] = (data.accounts || []).map((a: any) => ({
        ...a,
        selected: true,
      }));

      setDiscovered(accts);
      setServerTransactions(data.transactions || []);
      setStep("accounts");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      handleErrorTransition(e.message || "Exchange error");
    }
  };

  const handleImport = async () => {
    const selected = discovered.filter((a) => a.selected);
    if (selected.length === 0) return;

    setStep("importing");
    const newAccounts: Omit<Account, "id">[] = selected.map((a) => ({
      name: a.name,
      bank: selectedBank?.name || "Bank",
      balance: a.balance,
      type: a.type,
      color: ACCOUNT_COLORS[a.type] || selectedBank?.color || "#2563EB",
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
        plaidAccountId: t.accountId,
        date: t.date,
        bank: t.bank,
        source: "plaid" as const,
      }));

    const item: PlaidItem = {
      itemId: plaidItemId,
      bankName: selectedBank?.name || "Bank",
      bankColor: selectedBank?.color || "#2563EB",
      connectedAt: new Date().toISOString(),
      accountIds: [],
    };

    await connectPlaid(item, newAccounts, initialTxs, [], []);
    setStep("success");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const filteredPopular = POPULAR_BANKS.filter(
    (b) => b.name.toLowerCase().includes(query.toLowerCase()) || b.fullName.toLowerCase().includes(query.toLowerCase())
  );
  const filteredOther = OTHER_BANKS.filter(
    (b) => b.name.toLowerCase().includes(query.toLowerCase()) || b.sub.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 20 : insets.top + 10 }]}>

        {/* ── Screen 6: Add Account / Connect your bank ── */}
        {step === "search" && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.searchScroll}>
            {/* Header */}
            <View style={styles.addAccountHeader}>
              <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                <Feather name="arrow-left" size={20} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.addAccountTitle}>Add Account</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* Headline */}
            <Text style={styles.connectHeadline}>Connect your bank</Text>
            <Text style={styles.connectSubtext}>
              Securely connect your bank account using Plaid. It only takes a few minutes.
            </Text>

            {/* Search Input */}
            <View style={styles.searchBar}>
              <Feather name="search" size={17} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for your bank"
                placeholderTextColor="#9CA3AF"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Feather name="x" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Popular Banks 3x2 Grid */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Popular banks</Text>
            </View>

            <View style={styles.popularGrid}>
              {filteredPopular.map((bank) => (
                <TouchableOpacity
                  key={bank.id}
                  style={styles.popularCard}
                  onPress={() => handleBankSelect(bank)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.popularLogoBadge, { backgroundColor: bank.badgeBg }]}>
                    <Text style={[styles.popularLogoText, { color: bank.badgeColor }]}>
                      {bank.badgeText}
                    </Text>
                  </View>
                  <Text style={styles.popularBankName} numberOfLines={2}>
                    {bank.fullName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Other Banks List */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Other banks</Text>
            </View>

            <View style={styles.otherBanksList}>
              {filteredOther.map((bank) => (
                <TouchableOpacity
                  key={bank.id}
                  style={styles.otherBankRow}
                  onPress={() => handleBankSelect({ ...bank, fullName: bank.sub })}
                  activeOpacity={0.75}
                >
                  <View style={[styles.otherBankBadge, { backgroundColor: bank.color + "18" }]}>
                    <Text style={[styles.otherBadgeText, { color: bank.color }]}>{bank.badge}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.otherBankName}>{bank.name}</Text>
                    <Text style={styles.otherBankSub}>{bank.sub}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </View>

            {/* Preserved Manual Account Card */}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>Prefer manual entry?</Text>
              <TouchableOpacity
                style={styles.manualOptionCard}
                onPress={() => {
                  onClose();
                  if (onOpenManual) onOpenManual();
                }}
                activeOpacity={0.85}
              >
                <View style={styles.manualIconBg}>
                  <Feather name="edit-3" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.manualOptionTitle}>Add Manual Account</Text>
                  <Text style={styles.manualOptionSub}>Cash, wallet, loans, or custom offline accounts</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#059669" />
              </TouchableOpacity>
            </View>

            {/* Security note */}
            <View style={styles.secureFooter}>
              <Feather name="shield" size={14} color="#6B7280" />
              <Text style={styles.secureFooterText}>
                Your information is encrypted & secure with Plaid
              </Text>
            </View>
          </ScrollView>
        )}

        {/* ── Screen 7: Connecting to your bank ── */}
        {step === "connecting" && (
          <View style={styles.stateContainer}>
            <PlaidHeader onBack={() => setStep("search")} />

            <View style={styles.connectingCenter}>
              {/* Radar Pulsing Bank Icon Graphic */}
              <View style={styles.radarWrapper}>
                <Animated.View style={[styles.radarRingOuter, { transform: [{ scale: pulseAnim }] }]} />
                <View style={styles.radarRingMid} />
                <View style={styles.radarCenterCircle}>
                  <Feather name="home" size={28} color="#2563EB" />
                </View>
              </View>

              <Text style={styles.connectingTitle}>Connecting to your bank</Text>
              <Text style={styles.connectingSubtext}>
                We're securely linking your account using Plaid. This may take a few seconds...
              </Text>

              {/* 3-Step Checklist */}
              <View style={styles.checklistCard}>
                <View style={styles.checklistItem}>
                  <View style={[styles.checkCircle, connectStepIndex >= 0 ? styles.checkCircleActive : styles.checkCircleInactive]}>
                    <Feather name="check" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={styles.checkItemText}>Verifying your bank</Text>
                </View>

                <View style={styles.checklistDivider} />

                <View style={styles.checklistItem}>
                  <View style={[styles.checkCircle, connectStepIndex >= 1 ? styles.checkCircleActive : styles.checkCircleInactive]}>
                    {connectStepIndex >= 1 ? (
                      <Feather name="check" size={13} color="#FFFFFF" />
                    ) : (
                      <View style={styles.checkDotEmpty} />
                    )}
                  </View>
                  <Text style={styles.checkItemText}>Retrieving your accounts</Text>
                </View>

                <View style={styles.checklistDivider} />

                <View style={styles.checklistItem}>
                  <View style={[styles.checkCircle, connectStepIndex >= 2 ? styles.checkCircleActive : styles.checkCirclePending]}>
                    {connectStepIndex >= 2 ? (
                      <Feather name="check" size={13} color="#FFFFFF" />
                    ) : (
                      <ActivityIndicator size="small" color="#2563EB" />
                    )}
                  </View>
                  <Text style={styles.checkItemText}>Finalising connection</Text>
                </View>
              </View>

              {/* Error Simulation Helper (For easy verification) */}
              <View style={styles.testErrorsRow}>
                <TouchableOpacity
                  onPress={() => setStep("error_login")}
                  style={styles.testErrorPill}
                >
                  <Text style={styles.testErrorPillText}>Preview: Login failed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStep("error_rate_limit")}
                  style={styles.testErrorPill}
                >
                  <Text style={styles.testErrorPillText}>Preview: Rate limit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.secureBottomBanner}>
              <Feather name="shield" size={14} color="#6B7280" />
              <Text style={styles.secureBottomText}>Your information is safe and secure with Plaid.</Text>
            </View>
          </View>
        )}

        {/* ── Discovered Accounts Picker ── */}
        {step === "accounts" && (
          <View style={styles.stateContainer}>
            <PlaidHeader onBack={() => setStep("search")} />
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={styles.connectingTitle}>Select Accounts</Text>
              <Text style={styles.connectingSubtext}>Choose which accounts you'd like to sync with FinTrack.</Text>

              <View style={{ gap: 10, marginTop: 16 }}>
                {discovered.map((a) => (
                  <TouchableOpacity
                    key={a.plaidAccountId}
                    style={[styles.accountPickCard, a.selected && styles.accountPickCardActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDiscovered((prev) =>
                        prev.map((acc) => (acc.plaidAccountId === a.plaidAccountId ? { ...acc, selected: !acc.selected } : acc))
                      );
                    }}
                  >
                    <View style={[styles.accountPickIcon, { backgroundColor: (ACCOUNT_COLORS[a.type] || "#2563EB") + "18" }]}>
                      <Feather name={a.type === "credit" ? "credit-card" : "layers"} size={18} color={ACCOUNT_COLORS[a.type] || "#2563EB"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accountPickName}>{a.name}</Text>
                      <Text style={styles.accountPickSub}>{a.type} •••• {a.lastFour}</Text>
                    </View>
                    <Text style={styles.accountPickBalance}>
                      ${Math.abs(a.balance).toFixed(2)}
                    </Text>
                    <View style={[styles.accountCheck, a.selected && styles.accountCheckActive]}>
                      {a.selected && <Feather name="check" size={12} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.primaryBlueBtn} onPress={handleImport}>
                <Text style={styles.primaryBtnText}>Import Selected Accounts</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ── Screen 8: Success! ── */}
        {step === "success" && (
          <View style={styles.stateContainer}>
            <PlaidHeader onBack={onClose} />

            <View style={styles.successCenter}>
              {/* Large Glowing Green Checkmark Circle */}
              <View style={styles.successGlowWrap}>
                <View style={styles.successGlowOuter} />
                <View style={styles.successCircle}>
                  <Feather name="check" size={38} color="#FFFFFF" />
                </View>
              </View>

              <Text style={styles.successTitle}>Success!</Text>
              <Text style={styles.successSubtext}>
                Your bank account has been linked. We're now retrieving your transactions and balances.
              </Text>

              {/* Action Buttons */}
              <View style={styles.successBtnStack}>
                <TouchableOpacity
                  style={styles.primaryBlueBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Continue</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryWhiteBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>View accounts</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Screen 9: Login failed (Error Screen 1) ── */}
        {step === "error_login" && (
          <View style={styles.stateContainer}>
            <PlaidHeader onBack={() => setStep("search")} />

            <View style={styles.errorCenter}>
              {/* Soft Red Rounded Card Graphic with Alert Icon */}
              <View style={styles.errorCardRed}>
                <View style={styles.errorIconCircleRed}>
                  <Feather name="alert-triangle" size={28} color="#DC2626" />
                </View>
              </View>

              <Text style={styles.errorTitle}>Login failed</Text>
              <Text style={styles.errorSubtext}>
                We couldn't connect to your bank. Please try again or choose a different bank.
              </Text>

              {/* Action Buttons */}
              <View style={styles.errorBtnStack}>
                <TouchableOpacity
                  style={styles.primaryBlueBtn}
                  onPress={() => {
                    if (selectedBank) handleBankSelect(selectedBank);
                    else setStep("search");
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Try again</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryWhiteBtn}
                  onPress={() => setStep("search")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>Choose a different bank</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.supportLinkWrap}
                onPress={() => alert("Support: Email support@fintrack.app for assistance with Plaid banking.")}
              >
                <Text style={styles.supportLinkText}>Need help? Contact support</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Screen 10: Rate limit exceeded (Error Screen 2) ── */}
        {step === "error_rate_limit" && (
          <View style={styles.stateContainer}>
            <PlaidHeader onBack={() => setStep("search")} />

            <View style={styles.errorCenter}>
              {/* Soft Orange Rounded Card Graphic with Timer/Clock Icon */}
              <View style={styles.errorCardOrange}>
                <View style={styles.errorIconCircleOrange}>
                  <Feather name="clock" size={28} color="#D97706" />
                </View>
              </View>

              <Text style={styles.errorTitle}>Rate limit exceeded</Text>
              <Text style={styles.errorSubtext}>
                You've made too many requests. Please wait a few minutes and try again.
              </Text>

              {/* Action Buttons */}
              <View style={styles.errorBtnStack}>
                <TouchableOpacity
                  style={styles.primaryBlueBtn}
                  onPress={() => {
                    if (selectedBank) handleBankSelect(selectedBank);
                    else setStep("search");
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Try again</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryWhiteBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>Back to accounts</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.supportLinkWrap}
                onPress={() => alert("Support: If rate limits persist, please wait 10 minutes or check bank API status.")}
              >
                <Text style={styles.supportLinkText}>Need help? Contact support</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Styles (Matching Screens 6, 7, 8, 9, 10) ───────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  searchScroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Screen 6 Header
  addAccountHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  backBtn: {
    padding: 6,
  },
  addAccountTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  connectHeadline: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginTop: 12,
  },
  connectSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 4,
    lineHeight: 20,
  },

  // Search Bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111827",
  },

  // Section Headers
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },

  // Popular Banks 3x2 Grid
  popularGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  popularCard: {
    width: "31%",
    aspectRatio: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  popularLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  popularLogoText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  popularBankName: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "#374151",
    textAlign: "center",
    lineHeight: 13,
  },

  // Other Banks List
  otherBanksList: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    marginBottom: 24,
  },
  otherBankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  otherBankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  otherBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  otherBankName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  otherBankSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 1,
  },

  // Manual Section
  manualSection: {
    marginBottom: 20,
    gap: 10,
  },
  manualOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
  },
  manualIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  manualOptionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#065F46",
  },
  manualOptionSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#047857",
    marginTop: 1,
  },

  // Secure footer
  secureFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  secureFooterText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },

  // Plaid Header
  plaidHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  plaidBrandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  plaidBrandText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
    color: "#111827",
  },

  // States Shared
  stateContainer: {
    flex: 1,
  },

  // Screen 7 Connecting
  connectingCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 36,
  },
  radarWrapper: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  radarRingOuter: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "#EFF6FF",
  },
  radarRingMid: {
    position: "absolute",
    width: 95,
    height: 95,
    borderRadius: 47.5,
    backgroundColor: "#DBEAFE",
  },
  radarCenterCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  connectingTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    textAlign: "center",
  },
  connectingSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 300,
  },
  checklistCard: {
    width: "100%",
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    padding: 16,
    marginTop: 28,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: {
    backgroundColor: "#16A34A",
  },
  checkCircleInactive: {
    backgroundColor: "#E5E7EB",
  },
  checkCirclePending: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  checkDotEmpty: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#9CA3AF",
  },
  checkItemText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#1F2937",
  },
  checklistDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 10,
    marginLeft: 36,
  },
  secureBottomBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 28,
  },
  secureBottomText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  testErrorsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  testErrorPill: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  testErrorPillText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },

  // Screen 8 Success
  successCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  successGlowWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  successGlowOuter: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#DCFCE7",
  },
  successCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  successTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  successSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 290,
  },
  successBtnStack: {
    width: "100%",
    gap: 12,
    marginTop: 48,
  },

  // Screen 9 & 10 Error Screens
  errorCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 50,
  },
  errorCardRed: {
    width: 140,
    height: 110,
    borderRadius: 24,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  errorIconCircleRed: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  errorCardOrange: {
    width: 140,
    height: 110,
    borderRadius: 24,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  errorIconCircleOrange: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  errorTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  errorSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 300,
  },
  errorBtnStack: {
    width: "100%",
    gap: 12,
    marginTop: 40,
  },
  supportLinkWrap: {
    marginTop: 24,
    padding: 6,
  },
  supportLinkText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#2563EB",
  },

  // Shared Buttons
  primaryBlueBtn: {
    width: "100%",
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  secondaryWhiteBtn: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },

  // Account pick items
  accountPickCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  accountPickCardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB",
  },
  accountPickIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  accountPickName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  accountPickSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 1,
  },
  accountPickBalance: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  accountCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  accountCheckActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
});
