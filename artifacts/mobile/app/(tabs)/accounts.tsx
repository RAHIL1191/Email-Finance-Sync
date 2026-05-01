import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Linking } from "react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

import AddAccountModal from "@/components/AddAccountModal";
import { Account, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const TYPE_ICONS: Record<string, string> = {
  checking: "credit-card",
  savings: "dollar-sign",
  credit: "credit-card",
  investment: "trending-up",
};

function AccountRow({ account, onDelete }: { account: Account; onDelete: () => void }) {
  const colors = useColors();
  const isNegative = account.balance < 0;

  return (
    <View style={[styles.accountRow, { backgroundColor: colors.card }]}>
      <View style={[styles.accountIcon, { backgroundColor: account.color + "20" }]}>
        <Feather name={TYPE_ICONS[account.type] as any} size={20} color={account.color} />
      </View>
      <View style={styles.accountInfo}>
        <Text style={[styles.accountName, { color: colors.foreground }]}>{account.name}</Text>
        <Text style={[styles.accountBank, { color: colors.mutedForeground }]}>
          {account.bank}{account.lastFour ? `  •••• ${account.lastFour}` : ""}
        </Text>
        <View style={[styles.typeBadge, { backgroundColor: account.color + "18" }]}>
          <Text style={[styles.typeText, { color: account.color }]}>
            {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
          </Text>
        </View>
      </View>
      <View style={styles.accountRight}>
        <Text style={[styles.accountBalance, { color: isNegative ? colors.expense : colors.foreground }]}>
          {isNegative ? "-" : ""}${Math.abs(account.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert("Delete Account", `Remove "${account.name}"?`, [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: onDelete },
            ]);
          }}
        >
          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmailConnectModal({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connectEmail } = useApp();
  const [step, setStep] = useState<"form" | "loading" | "success" | "error">("form");
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handle = async () => {
    if (!email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (appPassword.length < 8) {
      setErrorMsg("Please enter your app password.");
      return;
    }
    setStep("loading");
    setErrorMsg("");
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
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Connect Email</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Icon */}
          <View style={[styles.emailIconLarge, { backgroundColor: colors.accent }]}>
            <Feather name="mail" size={36} color={colors.primary} />
          </View>

          <Text style={[styles.modalHeadline, { color: colors.foreground }]}>
            Sync bank email alerts
          </Text>
          <Text style={[styles.modalSubtext, { color: colors.mutedForeground }]}>
            We read your bank transaction alert emails directly via IMAP and parse them into transactions. Your credentials are stored only on your device.
          </Text>

          {/* Step: Form */}
          {(step === "form" || step === "error") && (
            <View style={styles.formSection}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Email Address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: step === "error" ? colors.expense : colors.border }]}
                  placeholder="you@gmail.com"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setStep("form"); setErrorMsg(""); }}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>App Password</Text>
                <View style={[styles.passwordRow, { backgroundColor: colors.card, borderColor: step === "error" ? colors.expense : colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.foreground }]}
                    placeholder="xxxx xxxx xxxx xxxx"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={appPassword}
                    onChangeText={(v) => { setAppPassword(v); setStep("form"); setErrorMsg(""); }}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.inputHint, { color: colors.mutedForeground }]}>
                  Use an App Password, not your regular password
                </Text>
              </View>

              {errorMsg ? (
                <View style={[styles.errorBox, { backgroundColor: colors.expense + "15", borderColor: colors.expense + "40" }]}>
                  <Feather name="alert-circle" size={15} color={colors.expense} />
                  <Text style={[styles.errorText, { color: colors.expense }]}>{errorMsg}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                onPress={handle}
              >
                <Feather name="link" size={16} color="#fff" />
                <Text style={styles.connectBtnText}>Connect Email</Text>
              </TouchableOpacity>

              {/* Gmail instructions */}
              {isGmail && (
                <View style={[styles.instructionsBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.instructionsTitle, { color: colors.foreground }]}>
                    How to get a Gmail App Password
                  </Text>
                  {[
                    "1. Go to myaccount.google.com",
                    "2. Click Security → 2-Step Verification (must be enabled)",
                    "3. Scroll down to App passwords",
                    '4. Select "Mail" → "Other device" → name it "FinTrack"',
                    "5. Copy the 16-character password and paste it above",
                    "6. Also enable IMAP: Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP",
                  ].map((step) => (
                    <Text key={step} style={[styles.instructionsStep, { color: colors.mutedForeground }]}>
                      {step}
                    </Text>
                  ))}
                  <TouchableOpacity
                    style={[styles.openLinkBtn, { borderColor: colors.primary }]}
                    onPress={() => Linking.openURL("https://myaccount.google.com/apppasswords")}
                  >
                    <Feather name="external-link" size={13} color={colors.primary} />
                    <Text style={[styles.openLinkText, { color: colors.primary }]}>Open Google App Passwords</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!isGmail && email.includes("@") && (
                <View style={[styles.instructionsBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.instructionsTitle, { color: colors.foreground }]}>
                    Supported email providers
                  </Text>
                  <Text style={[styles.instructionsStep, { color: colors.mutedForeground }]}>
                    Gmail, Outlook/Hotmail, Yahoo Mail, iCloud Mail. Make sure IMAP is enabled in your email settings and use an App Password if required.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Step: Loading */}
          {step === "loading" && (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.foreground }]}>
                Testing connection...
              </Text>
              <Text style={[styles.loadingSubtext, { color: colors.mutedForeground }]}>
                Verifying your email credentials
              </Text>
            </View>
          )}

          {/* Step: Success */}
          {step === "success" && (
            <View style={styles.successState}>
              <View style={[styles.successIcon, { backgroundColor: colors.success + "18" }]}>
                <Feather name="check-circle" size={40} color={colors.success} />
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>Connected!</Text>
              <Text style={[styles.successSubtext, { color: colors.mutedForeground }]}>
                {email} is connected. Go to Home and tap the sync button to import your bank transaction emails.
              </Text>
              <TouchableOpacity
                style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                onPress={onClose}
              >
                <Text style={styles.connectBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function AccountsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, deleteAccount, totalBalance, emailSync, disconnectEmail, syncEmailTransactions, isSyncing } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [showEmailConnect, setShowEmailConnect] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; error?: string } | null>(null);

  const topPaddingWeb = Platform.OS === "web" ? 67 : insets.top;

  const handleSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSyncResult(null);
    const result = await syncEmailTransactions();
    setSyncResult(result);
    if (result.imported > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleDisconnect = () => {
    Alert.alert("Disconnect Email", "Remove email sync connection?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          disconnectEmail();
          setSyncResult(null);
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }]}
      >
        <View style={[styles.header, { paddingTop: topPaddingWeb + 12 }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Accounts</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowAdd(true);
            }}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={[styles.netWorthCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.netWorthLabel}>Net Worth</Text>
          <Text style={styles.netWorthAmount}>
            ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.netWorthSub}>
            Across {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* Email sync panel */}
        {!emailSync.isConnected ? (
          <TouchableOpacity
            style={[styles.emailBanner, { backgroundColor: colors.accent, borderColor: colors.primary + "40" }]}
            onPress={() => setShowEmailConnect(true)}
          >
            <View style={[styles.emailIconBg, { backgroundColor: colors.primary + "20" }]}>
              <Feather name="mail" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.emailBannerTitle, { color: colors.foreground }]}>Connect Email</Text>
              <Text style={[styles.emailBannerSub, { color: colors.mutedForeground }]}>
                Auto-import transactions from bank alert emails
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.connectedPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.connectedTop]}>
              <View style={[styles.connectedIconBg, { backgroundColor: colors.success + "18" }]}>
                <Feather name="check-circle" size={18} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.connectedTitle, { color: colors.foreground }]}>Email Synced</Text>
                <Text style={[styles.connectedEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {emailSync.email}
                </Text>
              </View>
              <TouchableOpacity onPress={handleDisconnect}>
                <Feather name="x-circle" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {emailSync.lastSynced && (
              <Text style={[styles.lastSynced, { color: colors.mutedForeground }]}>
                Last synced: {new Date(emailSync.lastSynced).toLocaleString()}
                {emailSync.lastEmailsScanned !== undefined ? `  ·  ${emailSync.lastEmailsScanned} emails scanned` : ""}
                {emailSync.lastImported !== undefined ? `  ·  ${emailSync.lastImported} found` : ""}
              </Text>
            )}

            {syncResult && (
              <View style={[
                styles.syncResultBox,
                {
                  backgroundColor: syncResult.error ? colors.expense + "12" : colors.success + "12",
                  borderColor: syncResult.error ? colors.expense + "30" : colors.success + "30",
                }
              ]}>
                <Feather
                  name={syncResult.error ? "alert-circle" : "check"}
                  size={13}
                  color={syncResult.error ? colors.expense : colors.success}
                />
                <Text style={[styles.syncResultText, { color: syncResult.error ? colors.expense : colors.success }]}>
                  {syncResult.error
                    ? syncResult.error
                    : syncResult.imported > 0
                    ? `${syncResult.imported} new transaction${syncResult.imported !== 1 ? "s" : ""} imported`
                    : "No new transactions found"}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.syncBtn, { backgroundColor: colors.primary, opacity: isSyncing ? 0.7 : 1 }]}
              onPress={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="refresh-cw" size={15} color="#fff" />
              )}
              <Text style={styles.syncBtnText}>
                {isSyncing ? "Scanning emails..." : "Sync Now"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ALL ACCOUNTS</Text>
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} onDelete={() => deleteAccount(a.id)} />
        ))}
        {accounts.length === 0 && (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Feather name="credit-card" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No accounts yet</Text>
          </View>
        )}
      </ScrollView>

      <AddAccountModal visible={showAdd} onClose={() => setShowAdd(false)} />
      {showEmailConnect && <EmailConnectModal onClose={() => setShowEmailConnect(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  netWorthCard: { borderRadius: 20, padding: 24, gap: 4 },
  netWorthLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_500Medium" },
  netWorthAmount: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  netWorthSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  emailBanner: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  emailIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  emailBannerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emailBannerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  connectedPanel: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  connectedTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  connectedIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  connectedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  connectedEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  lastSynced: { fontSize: 11, fontFamily: "Inter_400Regular" },
  syncResultBox: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 10, borderRadius: 8, borderWidth: 1 },
  syncResultText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  syncBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, borderRadius: 10 },
  syncBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 4 },
  accountRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, gap: 12 },
  accountIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  accountInfo: { flex: 1, gap: 3 },
  accountName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  accountBank: { fontSize: 12, fontFamily: "Inter_400Regular" },
  typeBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 2 },
  typeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  accountRight: { alignItems: "flex-end", gap: 8 },
  accountBalance: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empty: { padding: 40, borderRadius: 14, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  // Modal
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
