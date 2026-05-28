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
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Defs, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AddAccountModal from "@/components/AddAccountModal";
import ConfirmModal from "@/components/ConfirmModal";
import PlaidLinkModal from "@/components/PlaidLinkModal";
import { Account, PlaidItem, PLAID_BANKS, computeBalance, isIncludedInNetworth, useApp } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Helpers ───────────────────────────────────────────────────────────────────

function bankInitials(bank: string, name: string): string {
  const src = bank || name;
  const words = src.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function genMockData(balance: number, count: number): number[] {
  const pts: number[] = [];
  let v = Math.max(balance * 1.1, 500);
  for (let i = 0; i < count; i++) {
    v += (Math.random() - 0.53) * Math.abs(balance) * 0.025;
    pts.push(v);
  }
  pts[count - 1] = balance;
  return pts;
}

function buildPaths(values: number[], w: number, h: number) {
  if (values.length < 2) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = 8;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: padY + ((max - v) / range) * (h - padY * 2),
  }));
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const cx = ((p.x + c.x) / 2).toFixed(2);
    line += ` C ${cx} ${p.y.toFixed(2)} ${cx} ${c.y.toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  const area = `${line} L ${last.x.toFixed(2)} ${h} L 0 ${h} Z`;
  return { line, area };
}

// ── Net Worth Chart ───────────────────────────────────────────────────────────

function NetWorthChart({ balance, colors }: { balance: number; colors: any }) {
  const h = 130;
  const w = SCREEN_W;
  const data = useMemo(() => genMockData(balance === 0 ? 1000 : balance, 22), [balance]);
  const { line, area } = useMemo(() => buildPaths(data, w, h), [data, w, h]);

  return (
    <View style={{ marginTop: 8 }}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.22" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.01" />
          </LinearGradient>
        </Defs>
        {area ? <Path d={area} fill="url(#areaGrad)" /> : null}
        {line ? <Path d={line} stroke={colors.primary} strokeWidth="2.2" fill="none" /> : null}
      </Svg>
    </View>
  );
}

// ── Premium Matte Account Card ────────────────────────────────────────────────

function getAccountGroupKey(account: Account): string {
  const text = `${account.name} ${account.bank}`.toLowerCase();
  if (text.includes("mortgage")) return "mortgage";
  if (text.includes("loan") || text.includes("lending") || text.includes("borrow")) return "loan";
  return account.type;
}

const GROUP_META: Record<string, { label: string; icon: string; color: string; isLiability: boolean; order: number }> = {
  checking:   { label: "Chequing",   icon: "layers",          color: "#3b82f6", isLiability: false, order: 1 },
  savings:    { label: "Savings",    icon: "shield",          color: "#22c55e", isLiability: false, order: 2 },
  credit:     { label: "Credit",     icon: "credit-card",     color: "#f59e0b", isLiability: true,  order: 3 },
  mortgage:   { label: "Mortgage",   icon: "home",            color: "#ef4444", isLiability: true,  order: 4 },
  loan:       { label: "Loan",       icon: "arrow-down-right",color: "#f97316", isLiability: true,  order: 5 },
  investment: { label: "Investment", icon: "trending-up",     color: "#8b5cf6", isLiability: false, order: 6 },
};

function PremiumAccountCard({ account }: { account: Account }) {
  const colors = useColors();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const { deleteAccount, transactions } = useApp();
  const liveBalance = computeBalance(account, transactions);
  const isNeg = liveBalance < 0;
  const bankMeta = PLAID_BANKS.find(
    (b) => b.name.toLowerCase() === (account.bank ?? "").toLowerCase()
  );
  const initials = bankInitials(account.bank, account.name);
  const groupKey = getAccountGroupKey(account);
  const groupMeta = GROUP_META[groupKey] ?? GROUP_META.checking;
  const typeLabel = groupMeta.label;
  const typeIcon  = groupMeta.icon;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.premiumCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: "/account/[id]", params: { id: account.id } });
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowDeleteConfirm(true);
        }}
        activeOpacity={0.75}
      >
        <View style={[styles.premiumBadge, { backgroundColor: account.color + "22" }]}>
          {bankMeta ? (
            <Text style={styles.premiumBadgeEmoji}>{bankMeta.icon}</Text>
          ) : (
            <Text style={[styles.premiumBadgeText, { color: account.color }]}>{initials}</Text>
          )}
        </View>

        <View style={styles.premiumInfo}>
          <Text style={[styles.premiumName, { color: colors.foreground }]} numberOfLines={1}>
            {account.name}
          </Text>
          <View style={styles.premiumMeta}>
            <View style={[styles.premiumTypeBadge, { backgroundColor: account.color + "18" }]}>
              <Feather name={typeIcon as any} size={9} color={account.color} />
              <Text style={[styles.premiumTypeText, { color: account.color }]}>{typeLabel}</Text>
            </View>
            {account.lastFour ? (
              <Text style={[styles.premiumLastFour, { color: colors.mutedForeground }]}>••••{account.lastFour}</Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {account.bank && !account.name.toLowerCase().includes(account.bank.toLowerCase()) ? (
              <Text style={[styles.premiumBankSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {account.bank}
              </Text>
            ) : null}
            {account.accountHolder ? (
              <View style={[styles.holderBadge, { backgroundColor: colors.muted }]}>
                <Feather name="user" size={9} color={colors.mutedForeground} />
                <Text style={[styles.holderText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {account.accountHolder}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.premiumRight}>
          <Text
            style={[styles.premiumBalance, { color: isNeg ? colors.expense : colors.foreground }]}
            numberOfLines={1}
          >
            {isNeg ? "-" : ""}${Math.abs(liveBalance).toLocaleString("en-US", {
              minimumFractionDigits: 2, maximumFractionDigits: 2,
            })}
          </Text>
          <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
        </View>

        <View style={[styles.premiumAccentBar, { backgroundColor: account.color }]} />
      </TouchableOpacity>

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Account"
        message={`Remove "${account.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmDestructive
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => { setShowDeleteConfirm(false); deleteAccount(account.id); }}
      />
    </>
  );
}

// ── Account Group ─────────────────────────────────────────────────────────────

function AccountGroup({
  title, accounts, total, icon, isLiability, collapsed, onToggle,
}: {
  title: string; accounts: Account[]; total: number; icon: string;
  isLiability?: boolean; collapsed: boolean; onToggle: () => void;
}) {
  const colors = useColors();
  const accentColor = isLiability ? colors.expense : colors.primary;

  return (
    <View style={[styles.group, { borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.groupHeader}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle(); }}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View style={[styles.groupIconBg, { backgroundColor: accentColor + "18" }]}>
            <Feather name={icon as any} size={13} color={accentColor} />
          </View>
          <Text style={[styles.groupTitle, { color: colors.foreground }]}>{title}</Text>
          <View style={[styles.groupCountBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.groupCountText, { color: colors.mutedForeground }]}>{accounts.length}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[styles.groupTotal, { color: isLiability ? colors.expense : colors.foreground }]}>
            ${Math.abs(total).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
          <Feather
            name={collapsed ? "chevron-down" : "chevron-up"}
            size={16}
            color={colors.mutedForeground}
          />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={{ gap: 8, paddingTop: 10 }}>
          {accounts.map((a) => <PremiumAccountCard key={a.id} account={a} />)}
        </View>
      )}
    </View>
  );
}

// ── Email Connect Modal (unchanged) ───────────────────────────────────────────

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
            {wasConnected ? "Enter new credentials to replace the existing connection." : "We read your bank transaction alert emails directly via IMAP and parse them into transactions. Your credentials are stored only on your device."}
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
                  {["1. Go to myaccount.google.com", "2. Click Security → 2-Step Verification (must be enabled)", "3. Scroll down to App passwords", '4. Select "Mail" → "Other device" → name it "FinTrack"', "5. Copy the 16-character password and paste it above", "6. Also enable IMAP: Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP"].map((s) => (
                    <Text key={s} style={[styles.instructionsStep, { color: colors.mutedForeground }]}>{s}</Text>
                  ))}
                  <TouchableOpacity style={[styles.openLinkBtn, { borderColor: colors.primary }]} onPress={() => Linking.openURL("https://myaccount.google.com/apppasswords")}>
                    <Feather name="external-link" size={13} color={colors.primary} />
                    <Text style={[styles.openLinkText, { color: colors.primary }]}>Open Google App Passwords</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!isGmail && email.includes("@") && (
                <View style={[styles.instructionsBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.instructionsTitle, { color: colors.foreground }]}>Supported email providers</Text>
                  <Text style={[styles.instructionsStep, { color: colors.mutedForeground }]}>Gmail, Outlook/Hotmail, Yahoo Mail, iCloud Mail. Make sure IMAP is enabled and use an App Password if required.</Text>
                </View>
              )}
            </View>
          )}
          {step === "loading" && (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.foreground }]}>Testing connection...</Text>
              <Text style={[styles.loadingSubtext, { color: colors.mutedForeground }]}>Verifying your email credentials</Text>
            </View>
          )}
          {step === "success" && (
            <View style={styles.successState}>
              <View style={[styles.successIcon, { backgroundColor: colors.success + "18" }]}>
                <Feather name="check-circle" size={40} color={colors.success} />
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>{wasConnected ? "Updated!" : "Connected!"}</Text>
              <Text style={[styles.successSubtext, { color: colors.mutedForeground }]}>{email} is connected. Go to Home and tap the sync button to import your bank transaction emails.</Text>
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

// ── Plaid item panel ──────────────────────────────────────────────────────────

function PlaidItemPanel({ item, onRelink }: { item: PlaidItem; onRelink: (item: PlaidItem) => void }) {
  const colors = useColors();
  const { syncPlaidTransactions, delinkPlaid, disconnectPlaid, isSyncing } = useApp();
  const [syncResult, setSyncResult] = useState<{ imported: number; importedTransactions?: any[]; parsed?: Array<{ title?: string; merchant?: string; amount: number; type?: string; bank?: string; rawSubject?: string }>; error?: string } | null>(null);
  const [showImportedDetails, setShowImportedDetails] = useState(false);
  const [showDelinkConfirm, setShowDelinkConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSyncResult(null);
    setShowImportedDetails(false);
    const result = await syncPlaidTransactions(item.itemId);
    setSyncResult(result);
    if (result.imported > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={[styles.plaidPanel, { backgroundColor: colors.card, borderColor: item.bankColor + "50" }]}>
      <View style={styles.plaidPanelTop}>
        <View style={[styles.plaidIconBg, { backgroundColor: item.bankColor + "18" }]}>
          <Feather name="link" size={16} color={item.bankColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.plaidBankName, { color: colors.foreground }]}>{item.bankName}</Text>
            <View style={[styles.plaidBadge, { backgroundColor: item.bankColor + "18" }]}>
              <Text style={[styles.plaidBadgeText, { color: item.bankColor }]}>Plaid</Text>
            </View>
          </View>
          <Text style={[styles.plaidSub, { color: colors.mutedForeground }]}>
            {item.accountIds.length} account{item.accountIds.length !== 1 ? "s" : ""} linked
          </Text>
        </View>
      </View>
      {item.lastSynced && (
        <Text style={[styles.plaidLastSync, { color: colors.mutedForeground }]}>
          Last synced: {new Date(item.lastSynced).toLocaleString()}
          {item.lastImported !== undefined ? `  ·  ${item.lastImported} imported` : ""}
        </Text>
      )}
      {item.needsRelogin && (
        <TouchableOpacity
          style={[styles.syncResultBox, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b40" }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onRelink(item); }}
          activeOpacity={0.8}
        >
          <Feather name="alert-triangle" size={13} color="#f59e0b" />
          <Text style={[styles.syncResultText, { color: "#f59e0b", flex: 1 }]}>Login required — tap to re-authenticate</Text>
          <Feather name="chevron-right" size={13} color="#f59e0b" />
        </TouchableOpacity>
      )}
      {!item.needsRelogin && item.syncError && (
        <View style={[styles.syncResultBox, { backgroundColor: colors.expense + "12", borderColor: colors.expense + "30" }]}>
          <Feather name="alert-circle" size={13} color={colors.expense} />
          <Text style={[styles.syncResultText, { color: colors.expense }]}>{item.syncError}</Text>
        </View>
      )}
      {syncResult && (
        <View style={[styles.syncResultBox, { flexDirection: "column", alignItems: "stretch", backgroundColor: syncResult.error ? colors.expense + "12" : "#10b98112", borderColor: syncResult.error ? colors.expense + "30" : "#10b98130" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: "100%" }}>
            <Feather name={syncResult.error ? "alert-circle" : "check"} size={13} color={syncResult.error ? colors.expense : "#10b981"} />
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => {
                if (syncResult.imported > 0) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowImportedDetails(!showImportedDetails);
                }
              }}
              style={{ flex: 1, paddingVertical: 2 }}
            >
              <Text style={[styles.syncResultText, { color: syncResult.error ? colors.expense : "#10b981", textDecorationLine: syncResult.imported > 0 ? "underline" : "none" }]}>
                {syncResult.error ? syncResult.error : syncResult.imported > 0 ? `${syncResult.imported} new transaction${syncResult.imported !== 1 ? "s" : ""} imported` : "No new transactions found"}
                {syncResult.imported > 0 && ` (tap to ${showImportedDetails ? "hide" : "view"})`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setSyncResult(null); setShowImportedDetails(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={13} color={syncResult.error ? colors.expense : "#10b981"} />
            </TouchableOpacity>
          </View>

          {showImportedDetails && syncResult.importedTransactions && syncResult.importedTransactions.length > 0 && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: (syncResult.error ? colors.expense : "#10b981") + "30", gap: 6 }}>
              {syncResult.importedTransactions.map((tx: any, idx: number) => (
                <View key={tx.id || idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: colors.foreground, fontFamily: "Inter_500Medium", flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {tx.merchant || tx.title || "Transaction"}
                  </Text>
                  <Text style={{ fontSize: 11, color: tx.type === "income" ? colors.success : colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                    {tx.type === "income" ? "+" : "-"}${Number(tx.amount || 0).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <TouchableOpacity
          style={[styles.plaidSyncBtn, { backgroundColor: item.bankColor, opacity: isSyncing ? 0.7 : 1, flex: 1, minWidth: 90 }]}
          onPress={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="refresh-cw" size={14} color="#fff" />}
          <Text style={styles.syncBtnText}>{isSyncing ? "Syncing…" : "Sync"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.plaidSyncBtn, { backgroundColor: colors.primary + "18", flex: 1, minWidth: 90 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onRelink(item); }}
        >
          <Feather name="link" size={14} color={colors.primary} />
          <Text style={[styles.syncBtnText, { color: colors.primary }]}>Relink</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.plaidSyncBtn, { backgroundColor: "#f97316" + "18", flex: 1, minWidth: 90 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowDelinkConfirm(true); }}
        >
          <Feather name="scissors" size={14} color="#f97316" />
          <Text style={[styles.syncBtnText, { color: "#f97316" }]}>Delink</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.plaidDisconnectBtn, { borderColor: colors.expense }]}
          onPress={() => setShowRemoveConfirm(true)}
        >
          <Feather name="x-circle" size={14} color={colors.expense} />
        </TouchableOpacity>
      </View>
      <ConfirmModal
        visible={showDelinkConfirm}
        title="Delink Bank"
        message={`Remove Plaid connection for ${item.bankName}? Your accounts and transactions are kept. You can re-add anytime.`}
        confirmLabel="Delink"
        confirmDestructive={false}
        onCancel={() => setShowDelinkConfirm(false)}
        onConfirm={() => {
          setShowDelinkConfirm(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          delinkPlaid(item.itemId);
        }}
      />
      <ConfirmModal
        visible={showRemoveConfirm}
        title="Remove Bank"
        message={`Remove ${item.bankName} and delete all its linked accounts and transactions?`}
        confirmLabel="Remove"
        confirmDestructive
        onCancel={() => setShowRemoveConfirm(false)}
        onConfirm={() => {
          setShowRemoveConfirm(false);
          disconnectPlaid(item.itemId);
        }}
      />
    </View>
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

  const handleEmailSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSyncResult(null);
    const result = await syncEmailTransactions();
    setSyncResult(result);
  };

  const [showEmailDisconnectConfirm, setShowEmailDisconnectConfirm] = useState(false);

  const handleEmailDisconnect = () => setShowEmailDisconnectConfirm(true);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.modalHeader, { paddingTop: (Platform.OS === "web" ? 20 : insets.top) + 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Connected Institutions</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Plaid items */}
          {plaidSync.items.map((item) => (
            <PlaidItemPanel key={item.itemId} item={item} onRelink={onRelink} />
          ))}

          {/* Email sync */}
          {emailSync.isConnected && (
            <View style={[styles.plaidPanel, { backgroundColor: colors.card, borderColor: colors.success + "50" }]}>
              <View style={styles.plaidPanelTop}>
                <View style={[styles.plaidIconBg, { backgroundColor: colors.success + "18" }]}>
                  <Feather name="mail" size={16} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.plaidBankName, { color: colors.foreground }]}>Email Sync</Text>
                  <Text style={[styles.plaidSub, { color: colors.mutedForeground }]} numberOfLines={1}>{emailSync.email}</Text>
                </View>
              </View>
              {emailSync.lastSynced && (
                <Text style={[styles.plaidLastSync, { color: colors.mutedForeground }]}>
                  Last synced: {new Date(emailSync.lastSynced).toLocaleString()}
                  {!syncResult && emailSync.lastImported !== undefined ? `  ·  ${emailSync.lastImported} imported` : ""}
                </Text>
              )}
      {syncResult && (
                <View style={[styles.syncResultBox, { backgroundColor: syncResult.error ? colors.expense + "12" : "#10b98112", borderColor: syncResult.error ? colors.expense + "30" : "#10b98130" }]}>
                  <Feather name={syncResult.error ? "alert-circle" : "check"} size={13} color={syncResult.error ? colors.expense : "#10b981"} />
                  <Text style={[styles.syncResultText, { color: syncResult.error ? colors.expense : "#10b981" }]}>
                    {syncResult.error ? syncResult.error : syncResult.imported > 0 ? `${syncResult.imported} new transaction${syncResult.imported !== 1 ? "s" : ""} imported` : "No new transactions"}
                  </Text>
                </View>
              )}
      {(syncResult?.imported ?? 0) > 0 && ((syncResult as any)?.parsed?.length || 0) > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.plaidLastSync, { color: colors.mutedForeground }]}>Parsed transaction details:</Text>
          {((syncResult as any)?.parsed || (emailSync as any).lastParsed || []).slice(0, 5).map((p: any, idx: number) => (
                    <View
                      key={`${p.rawSubject}-${idx}`}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        backgroundColor: colors.background,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: 2,
                      }}
                    >
                      <Text style={[styles.plaidBankName, { color: colors.foreground }]} numberOfLines={1}>
                        {p.merchant || p.title || "Transaction"}
                      </Text>
                      <Text style={[styles.plaidSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {p.bank} · ${Number(p.amount || 0).toFixed(2)} · {p.type}
                      </Text>
                      <Text style={[styles.plaidSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {p.rawSubject}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ marginVertical: 8, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                      Sync transactions from email
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                      Automatically parse transaction alerts from your inbox
                    </Text>
                  </View>
                  <Switch
                    value={!!emailSync.syncTransactions}
                    onValueChange={(val) => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateEmailSyncSettings({ syncTransactions: val });
                    }}
                    trackColor={{ false: colors.border, true: colors.success + "aa" }}
                    thumbColor={emailSync.syncTransactions ? colors.success : colors.mutedForeground}
                    ios_backgroundColor={colors.border}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                {emailSync.syncTransactions ? (
                  <TouchableOpacity
                    style={[styles.plaidSyncBtn, { backgroundColor: colors.success, opacity: isSyncing ? 0.7 : 1, flex: 1 }]}
                    onPress={handleEmailSync}
                    disabled={isSyncing}
                  >
                    {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="refresh-cw" size={14} color="#fff" />}
                    <Text style={styles.syncBtnText}>{isSyncing ? "Scanning…" : "Sync Emails"}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ flex: 1, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontStyle: "italic" }}>
                      Transaction sync disabled. Credentials are used for report delivery only.
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.plaidDisconnectBtn, { borderColor: colors.mutedForeground }]}
                  onPress={() => router.push("/email-debug")}
                >
                  <Feather name="tool" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.disconnectText, { color: colors.mutedForeground }]}>Debug</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.plaidDisconnectBtn, { borderColor: colors.expense }]}
                  onPress={handleEmailDisconnect}
                >
                  <Feather name="x-circle" size={14} color={colors.expense} />
                  <Text style={[styles.disconnectText, { color: colors.expense }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Add Email sync — shown first as recommended */}
          {!emailSync.isConnected && (
            <TouchableOpacity
              style={[styles.addInstRow, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}
              onPress={onAddEmail}
            >
              <View style={[styles.instIconBg, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="mail" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.instRowTitle, { color: colors.foreground }]}>Connect Email Sync</Text>
                  <View style={{ backgroundColor: colors.primary + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Recommended · Free</Text>
                  </View>
                </View>
                <Text style={[styles.instRowSub, { color: colors.mutedForeground }]}>Auto-import from bank alert emails</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}

          {/* Add Plaid bank — optional */}
          <TouchableOpacity
            style={[styles.addInstRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={onAddPlaid}
          >
            <View style={[styles.instIconBg, { backgroundColor: "#10b98118" }]}>
              <Feather name="link" size={18} color="#10b981" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.instRowTitle, { color: colors.foreground }]}>
                  {plaidSync.items.length > 0 ? "Add Another Bank via Plaid" : "Connect Bank via Plaid"}
                </Text>
              </View>
              <Text style={[styles.instRowSub, { color: colors.mutedForeground }]}>
                Optional · May require re-login periodically
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#10b981" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addInstRow, { backgroundColor: colors.card, borderColor: colors.expense + "30", marginTop: 20 }]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              wipeAllTransactions();
              onClose();
            }}
          >
            <View style={[styles.instIconBg, { backgroundColor: colors.expense + "18" }]}>
              <Feather name="trash-2" size={18} color={colors.expense} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.instRowTitle, { color: colors.expense }]}>Reset All Transactions</Text>
              <Text style={[styles.instRowSub, { color: colors.mutedForeground }]}>Clear all local and remote data</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ConfirmModal
        visible={showEmailDisconnectConfirm}
        title="Disconnect Email"
        message="Remove email sync connection? Your imported transactions will remain."
        confirmLabel="Disconnect"
        confirmDestructive
        onCancel={() => setShowEmailDisconnectConfirm(false)}
        onConfirm={() => {
          setShowEmailDisconnectConfirm(false);
          disconnectEmail();
        }}
      />
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

const TIME_PERIODS = ["Week", "Month", "Year"] as const;
type Period = (typeof TIME_PERIODS)[number];

export default function AccountsScreen() {
  const colors = useColors();
  const { openDrawer } = useDrawer();
  const {
    accounts,
    transactions,
    totalBalance,
    emailSync,
    plaidSync,
    wipeAllTransactions,
  } = useApp();

  const [activeView, setActiveView] = useState<"Accounts" | "Trends">("Accounts");
  const [period, setPeriod] = useState<Period>("Month");

  const periodStart = useMemo(() => {
    const d = new Date();
    if (period === "Week") d.setDate(d.getDate() - 7);
    else if (period === "Month") { d.setDate(1); }  // start of current month, not rolling 30 days
    else d.setFullYear(d.getFullYear() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, [period]);

  const networthAccountIds = useMemo(
    () => new Set(accounts.filter(isIncludedInNetworth).map((a) => a.id)),
    [accounts]
  );

  const periodChange = useMemo(() =>
    transactions
      .filter((t) =>
        t.date >= periodStart &&
        networthAccountIds.has(t.accountId) &&
        t.category !== "Transfer" &&
        t.category?.toLowerCase() !== "transfer"
      )
      .reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
    [transactions, periodStart, networthAccountIds]
  );
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showEmailConnect, setShowEmailConnect] = useState(false);
  const [showPlaidLink, setShowPlaidLink] = useState(false);
  const [showInstitutions, setShowInstitutions] = useState(false);
  const [relinkItem, setRelinkItem] = useState<PlaidItem | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const isCurrentlyCollapsed = prev[key] !== false;
      return { ...prev, [key]: !isCurrentlyCollapsed };
    });

  const groupedAccounts = useMemo(() => {
    const map: Record<string, Account[]> = {};
    accounts.forEach((a) => {
      const key = getAccountGroupKey(a);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return Object.entries(map)
      .map(([key, accts]) => ({
        key,
        meta: GROUP_META[key] ?? GROUP_META.checking,
        accounts: accts,
        total: accts.reduce((s, a) => s + computeBalance(a, transactions), 0),
      }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }, [accounts, transactions]);

  const assetsTotal = accounts
    .filter((a) => {
      const k = getAccountGroupKey(a);
      return k !== "credit" && k !== "mortgage" && k !== "loan" && isIncludedInNetworth(a);
    })
    .reduce((s, a) => s + computeBalance(a, transactions), 0);
  const liabilitiesTotal = accounts
    .filter((a) => {
      const k = getAccountGroupKey(a);
      return (k === "credit" || k === "mortgage" || k === "loan") && isIncludedInNetworth(a);
    })
    .reduce((s, a) => s + Math.abs(computeBalance(a, transactions)), 0);

  const connectedCount = plaidSync.items.length + (emailSync.isConnected ? 1 : 0);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 64 : 12 }]}>
          <TouchableOpacity hitSlop={8} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }}>
            <Feather name="menu" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Accounts</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <TouchableOpacity hitSlop={8}>
              <Feather name="sliders" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={8}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAdd(true); }}
            >
              <Feather name="plus" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Net Worth ── */}
        <View style={styles.netWorthSection}>
          <View style={styles.netWorthTopRow}>
            <Text style={[styles.netWorthLabel, { color: colors.mutedForeground }]}>Net worth</Text>
            <TouchableOpacity
              style={[styles.periodPill, { backgroundColor: colors.muted }]}
              onPress={() => setShowPeriodPicker(!showPeriodPicker)}
            >
              <Text style={[styles.periodText, { color: colors.foreground }]}>{period}</Text>
              <Feather name="chevron-down" size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.netWorthAmount, { color: totalBalance < 0 ? colors.expense : colors.foreground }]}>
            {totalBalance < 0 ? "-" : ""}${Math.abs(totalBalance).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
          {periodChange !== 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Feather
                name={periodChange >= 0 ? "trending-up" : "trending-down"}
                size={13}
                color={periodChange >= 0 ? colors.income : colors.expense}
              />
              <Text style={{ fontSize: 13, fontWeight: "500", color: periodChange >= 0 ? colors.income : colors.expense }}>
                {periodChange >= 0 ? "+" : "−"}${Math.abs(periodChange).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} this {period.toLowerCase()}
              </Text>
            </View>
          )}
          {(assetsTotal > 0 || liabilitiesTotal > 0) && (
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
              <Text style={[styles.netWorthSub, { color: colors.mutedForeground }]}>
                Assets{" "}
                <Text style={{ color: colors.foreground }}>
                  ${assetsTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </Text>
              </Text>
              {liabilitiesTotal > 0 && (
                <Text style={[styles.netWorthSub, { color: colors.mutedForeground }]}>
                  Liabilities{" "}
                  <Text style={{ color: colors.expense }}>
                    ${liabilitiesTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </Text>
                </Text>
              )}
            </View>
          )}

          {/* Period dropdown */}
          {showPeriodPicker && (
            <View style={[styles.periodDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {TIME_PERIODS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodOption, period === p && { backgroundColor: colors.primary + "15" }]}
                  onPress={() => { setPeriod(p); setShowPeriodPicker(false); }}
                >
                  <Text style={[styles.periodOptionText, { color: period === p ? colors.primary : colors.foreground }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Area Chart ── */}
        <NetWorthChart balance={totalBalance} colors={colors} />

        {/* ── Toggle ── */}
        <View style={[styles.toggleWrap, { backgroundColor: colors.muted }]}>
          {(["Accounts", "Trends"] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.togglePill, activeView === v && { backgroundColor: colors.background }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveView(v); }}
            >
              <Text style={[styles.toggleText, { color: activeView === v ? colors.foreground : colors.mutedForeground }]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeView === "Accounts" ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
            {/* Connected Institutions row */}
            <TouchableOpacity
              style={[styles.instRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowInstitutions(true); }}
            >
              <View style={[styles.instIconBg, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="home" size={17} color={colors.primary} />
              </View>
              <Text style={[styles.instText, { color: colors.foreground }]}>Connected Institutions</Text>
              {connectedCount > 0 && (
                <View style={[styles.instCountBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.instCountText}>{connectedCount}</Text>
                </View>
              )}
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {groupedAccounts.map(({ key, meta, accounts: grpAccts, total }) => (
              <AccountGroup
                key={key}
                title={meta.label}
                accounts={grpAccts}
                total={total}
                icon={meta.icon}
                isLiability={meta.isLiability}
                collapsed={collapsedGroups[key] !== false}
                onToggle={() => toggleGroup(key)}
              />
            ))}

            {/* Empty state */}
            {accounts.length === 0 && (
              <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="credit-card" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No accounts yet</Text>
                <TouchableOpacity onPress={() => setShowAdd(true)}>
                  <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Account</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Add account */}
            {accounts.length > 0 && (
              <TouchableOpacity
                style={[styles.addAcctBtn, { borderColor: colors.border }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAdd(true); }}
              >
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={[styles.addAcctText, { color: colors.primary }]}>Add Account</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View style={[styles.trendsPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="trending-up" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Balance trends coming soon</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <AddAccountModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onConnectBank={() => setShowPlaidLink(true)}
      />
      {showEmailConnect && <EmailConnectModal onClose={() => setShowEmailConnect(false)} />}
      {(showPlaidLink || relinkItem) && (
        <PlaidLinkModal
          onClose={() => { setShowPlaidLink(false); setRelinkItem(null); }}
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
          setTimeout(() => setShowPlaidLink(true), 350);
        }}
        onAddEmail={() => {
          setShowInstitutions(false);
          setTimeout(() => setShowEmailConnect(true), 350);
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },

  // Net worth
  netWorthSection: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  netWorthTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  netWorthLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  netWorthAmount: { fontSize: 42, fontFamily: "Inter_700Bold", letterSpacing: -1, marginTop: 2 },
  netWorthSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  periodPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  periodText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  periodDropdown: {
    position: "absolute", right: 0, top: 36,
    borderRadius: 12, borderWidth: 1, overflow: "hidden", zIndex: 99,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 8,
  },
  periodOption: { paddingHorizontal: 20, paddingVertical: 11 },
  periodOptionText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  // Toggle
  toggleWrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 50,
    padding: 3,
  },
  togglePill: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    borderRadius: 50,
  },
  toggleText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Connected institutions row
  instRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  instIconBg: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  instText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  instCountBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  instCountText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  // Premium matte account card
  premiumCard: {
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", gap: 13,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  premiumBadge: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  premiumBadgeText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  premiumBadgeEmoji: { fontSize: 22 },
  premiumInfo: { flex: 1, gap: 3 },
  premiumName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  premiumMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  premiumTypeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  premiumTypeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  premiumLastFour: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1 },
  premiumBankSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  premiumRight: { alignItems: "flex-end", gap: 4 },
  premiumBalance: { fontSize: 16, fontFamily: "Inter_700Bold" },
  premiumAccentBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2.5, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  // Account group
  group: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 0 },
  groupHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingHorizontal: 2,
  },
  groupIconBg: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  groupTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  groupTotal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  groupCountBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  groupCountText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  holderBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  holderText: { fontSize: 10, fontFamily: "Inter_500Medium" },

  // Empty / add
  emptyWrap: { padding: 40, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  emptyAction: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  addAcctBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  addAcctText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  trendsPlaceholder: { padding: 48, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 12 },

  // Plaid panel
  plaidPanel: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  plaidPanelTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  plaidIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  plaidBankName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  plaidSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  plaidBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  plaidBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  plaidLastSync: { fontSize: 11, fontFamily: "Inter_400Regular" },
  plaidSyncBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  plaidDisconnectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  syncBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  disconnectText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  syncResultBox: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 10, borderRadius: 8, borderWidth: 1 },
  syncResultText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },

  // Institutions modal row
  addInstRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  instRowTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  instRowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

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
  loadingSubtext: { fontSize: 14, fontFamily: "Inter_400Regular" },
  successState: { paddingVertical: 20, alignItems: "center", gap: 14 },
  successIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successSubtext: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
});
