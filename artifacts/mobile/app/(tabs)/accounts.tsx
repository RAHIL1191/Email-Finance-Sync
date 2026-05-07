import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Defs, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AddAccountModal from "@/components/AddAccountModal";
import ConfirmModal from "@/components/ConfirmModal";
import PlaidLinkModal from "@/components/PlaidLinkModal";
import { Account, PlaidItem, PLAID_BANKS, computeBalance, useApp } from "@/context/AppContext";
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

// ── Account Row (new flat design) ─────────────────────────────────────────────

function AccountRow({
  account,
  isLast,
}: {
  account: Account;
  isLast: boolean;
}) {
  const colors = useColors();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const { deleteAccount, transactions } = useApp();
  const liveBalance = computeBalance(account, transactions);
  const isNeg = liveBalance < 0;
  const bankMeta = PLAID_BANKS.find(
    (b) => b.name.toLowerCase() === (account.bank ?? "").toLowerCase()
  );
  const initials = bankInitials(account.bank, account.name);
  const typeLabel =
    account.type === "checking" ? "Chequing"
    : account.type === "savings" ? "Savings"
    : account.type === "credit" ? "Credit"
    : "Investment";
  return (
    <>
      <TouchableOpacity
        style={[
          styles.acctRow,
          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: "/account/[id]", params: { id: account.id } });
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowDeleteConfirm(true);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.acctBadge, { backgroundColor: account.color }]}>
          {bankMeta ? (
            <Text style={styles.acctBadgeEmoji}>{bankMeta.icon}</Text>
          ) : (
            <Text style={styles.acctBadgeText}>{initials}</Text>
          )}
        </View>
        <View style={styles.acctInfo}>
          <Text style={[styles.acctName, { color: colors.foreground }]} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={[styles.acctSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {typeLabel}
            {account.bank ? ` · ${account.bank}` : ""}
            {account.lastFour ? ` · ••••${account.lastFour}` : ""}
          </Text>
        </View>
        <Text style={[styles.acctBal, { color: isNeg ? colors.expense : colors.foreground }]}>
          {isNeg ? "- " : ""}$
          {Math.abs(liveBalance).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
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

// ── Account Group ─────────────────────────────────────────────────────────────

function AccountGroup({
  title,
  accounts,
  total,
}: {
  title: string;
  accounts: Account[];
  total: number;
}) {
  const colors = useColors();
  const isNeg = total < 0;

  return (
    <View>
      <View style={styles.groupHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.groupTitle, { color: colors.foreground }]}>{title}</Text>
        </View>
        <Text style={[styles.groupTotal, { color: isNeg ? colors.expense : colors.foreground }]}>
          {isNeg ? "- " : ""}$
          {Math.abs(total).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </View>
      <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {accounts.map((a, i) => (
          <AccountRow
            key={a.id}
            account={a}
            isLast={i === accounts.length - 1}
          />
        ))}
      </View>
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalHeader, { paddingTop: 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{wasConnected ? "Update Email" : "Connect Email"}</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Plaid item panel ──────────────────────────────────────────────────────────

function PlaidItemPanel({ item }: { item: PlaidItem }) {
  const colors = useColors();
  const { syncPlaidTransactions, disconnectPlaid, isSyncing } = useApp();
  const [syncResult, setSyncResult] = useState<{ imported: number; parsed?: Array<{ title?: string; merchant?: string; amount: number; type?: string; bank?: string; rawSubject?: string }>; error?: string } | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const handleSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSyncResult(null);
    const result = await syncPlaidTransactions(item.itemId);
    setSyncResult(result);
    if (result.imported > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDisconnect = () => setShowDisconnectConfirm(true);

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
      {syncResult && (
        <View style={[styles.syncResultBox, { backgroundColor: syncResult.error ? colors.expense + "12" : "#10b98112", borderColor: syncResult.error ? colors.expense + "30" : "#10b98130" }]}>
          <Feather name={syncResult.error ? "alert-circle" : "check"} size={13} color={syncResult.error ? colors.expense : "#10b981"} />
          <Text style={[styles.syncResultText, { color: syncResult.error ? colors.expense : "#10b981" }]}>
            {syncResult.error ? syncResult.error : syncResult.imported > 0 ? `${syncResult.imported} new transaction${syncResult.imported !== 1 ? "s" : ""} imported` : "No new transactions found"}
          </Text>
          <TouchableOpacity onPress={() => setSyncResult(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: "auto" }}>
            <Feather name="x" size={13} color={syncResult.error ? colors.expense : "#10b981"} />
          </TouchableOpacity>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity
          style={[styles.plaidSyncBtn, { backgroundColor: item.bankColor, opacity: isSyncing ? 0.7 : 1, flex: 1 }]}
          onPress={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="refresh-cw" size={14} color="#fff" />}
          <Text style={styles.syncBtnText}>{isSyncing ? "Syncing…" : "Sync Now"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.plaidDisconnectBtn, { borderColor: colors.expense }]}
          onPress={handleDisconnect}
        >
          <Feather name="x-circle" size={14} color={colors.expense} />
          <Text style={[styles.disconnectText, { color: colors.expense }]}>Disconnect</Text>
        </TouchableOpacity>
      </View>
      <ConfirmModal
        visible={showDisconnectConfirm}
        title="Disconnect Bank"
        message={`Remove ${item.bankName} and all its imported accounts?`}
        confirmLabel="Disconnect"
        confirmDestructive
        onCancel={() => setShowDisconnectConfirm(false)}
        onConfirm={() => {
          setShowDisconnectConfirm(false);
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
  onAddPlaid,
  onAddEmail,
}: {
  visible: boolean;
  onClose: () => void;
  onAddPlaid: () => void;
  onAddEmail: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { plaidSync, emailSync, disconnectEmail, syncEmailTransactions, isSyncing } = useApp();
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
            <PlaidItemPanel key={item.itemId} item={item} />
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
      {(syncResult?.imported ?? 0) > 0 && (syncResult?.parsed?.length || 0) > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.plaidLastSync, { color: colors.mutedForeground }]}>Parsed transaction details:</Text>
          {(syncResult?.parsed || emailSync.lastParsed || []).slice(0, 5).map((p, idx) => (
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
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.plaidSyncBtn, { backgroundColor: colors.success, opacity: isSyncing ? 0.7 : 1, flex: 1 }]}
                  onPress={handleEmailSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="refresh-cw" size={14} color="#fff" />}
                  <Text style={styles.syncBtnText}>{isSyncing ? "Scanning…" : "Sync Emails"}</Text>
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

          {/* Add Plaid bank */}
          <TouchableOpacity
            style={[styles.addInstRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={onAddPlaid}
          >
            <View style={[styles.instIconBg, { backgroundColor: "#10b98118" }]}>
              <Feather name="link" size={18} color="#10b981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.instRowTitle, { color: colors.foreground }]}>
                {plaidSync.items.length > 0 ? "Add Another Bank" : "Connect Bank via Plaid"}
              </Text>
              <Text style={[styles.instRowSub, { color: colors.mutedForeground }]}>
                Chase, BMO, CIBC, TD, RBC & more
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#10b981" />
          </TouchableOpacity>

          {/* Add Email sync */}
          {!emailSync.isConnected && (
            <TouchableOpacity
              style={[styles.addInstRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={onAddEmail}
            >
              <View style={[styles.instIconBg, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="mail" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.instRowTitle, { color: colors.foreground }]}>Connect Email Sync</Text>
                <Text style={[styles.instRowSub, { color: colors.mutedForeground }]}>Auto-import from bank alert emails</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
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
  const {
    accounts,
    transactions,
    totalBalance,
    emailSync,
    plaidSync,
  } = useApp();

  const [activeView, setActiveView] = useState<"Accounts" | "Trends">("Accounts");
  const [period, setPeriod] = useState<Period>("Month");
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showEmailConnect, setShowEmailConnect] = useState(false);
  const [showPlaidLink, setShowPlaidLink] = useState(false);
  const [showInstitutions, setShowInstitutions] = useState(false);

  const cashAccounts = accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const creditAccounts = accounts.filter((a) => a.type === "credit");
  const investAccounts = accounts.filter((a) => a.type === "investment");

  const cashTotal = cashAccounts.reduce((s, a) => s + computeBalance(a, transactions), 0);
  const creditTotal = creditAccounts.reduce((s, a) => s + computeBalance(a, transactions), 0);
  const investTotal = investAccounts.reduce((s, a) => s + computeBalance(a, transactions), 0);

  const connectedCount = plaidSync.items.length + (emailSync.isConnected ? 1 : 0);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 64 : 12 }]}>
          <TouchableOpacity hitSlop={8}>
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
          <Text style={[styles.netWorthAmount, { color: colors.foreground }]}>
            ${Math.abs(totalBalance).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>

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

            {/* Cash group */}
            {cashAccounts.length > 0 && (
              <AccountGroup
                title="Cash"
                accounts={cashAccounts}
                total={cashTotal}
              />
            )}

            {/* Credit group */}
            {creditAccounts.length > 0 && (
              <AccountGroup
                title="Credit"
                accounts={creditAccounts}
                total={creditTotal}
              />
            )}

            {/* Investment group */}
            {investAccounts.length > 0 && (
              <AccountGroup
                title="Investment"
                accounts={investAccounts}
                total={investTotal}
              />
            )}

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
      {showPlaidLink && <PlaidLinkModal onClose={() => setShowPlaidLink(false)} />}
      <ConnectedInstitutionsModal
        visible={showInstitutions}
        onClose={() => setShowInstitutions(false)}
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

  // Account row
  acctRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 14, gap: 12 },
  acctBadge: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  acctBadgeText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  acctBadgeEmoji: { fontSize: 20 },
  acctInfo: { flex: 1, gap: 2 },
  acctName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  acctSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  acctBal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  // Account group
  groupHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 8,
  },
  groupTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  groupTotal: { fontSize: 17, fontFamily: "Inter_700Bold" },
  groupCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },

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
