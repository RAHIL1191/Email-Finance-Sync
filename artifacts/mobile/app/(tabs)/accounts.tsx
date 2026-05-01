import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
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

function AccountRow({
  account,
  onDelete,
}: {
  account: Account;
  onDelete: () => void;
}) {
  const colors = useColors();
  const isNegative = account.balance < 0;

  return (
    <View style={[styles.accountRow, { backgroundColor: colors.card }]}>
      <View style={[styles.accountIcon, { backgroundColor: account.color + "20" }]}>
        <Feather
          name={TYPE_ICONS[account.type] as any}
          size={20}
          color={account.color}
        />
      </View>
      <View style={styles.accountInfo}>
        <Text style={[styles.accountName, { color: colors.foreground }]}>
          {account.name}
        </Text>
        <Text style={[styles.accountBank, { color: colors.mutedForeground }]}>
          {account.bank}
          {account.lastFour ? `  •••• ${account.lastFour}` : ""}
        </Text>
        <View style={[styles.typeBadge, { backgroundColor: account.color + "18" }]}>
          <Text style={[styles.typeText, { color: account.color }]}>
            {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
          </Text>
        </View>
      </View>
      <View style={styles.accountRight}>
        <Text
          style={[
            styles.accountBalance,
            { color: isNegative ? colors.expense : colors.foreground },
          ]}
        >
          {isNegative ? "-" : ""}$
          {Math.abs(account.balance).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
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

function EmailConnectSheet({
  onClose,
}: {
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connectEmail } = useApp();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    await connectEmail(email.trim());
    setLoading(false);
    onClose();
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.sheetInner, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={[styles.sheetHeaderRow, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              Connect Email
            </Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={styles.sheetContent}>
            <View style={[styles.emailIconWrapper, { backgroundColor: colors.accent }]}>
              <Feather name="mail" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>
              Enter the email address linked to your bank accounts. We'll scan
              transaction alert emails and automatically import them.
            </Text>
            <TextInput
              style={[
                styles.sheetInput,
                {
                  backgroundColor: colors.card,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity
              style={[
                styles.sheetBtn,
                { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 },
              ]}
              onPress={handle}
              disabled={loading}
            >
              <Feather name="mail" size={16} color="#fff" />
              <Text style={styles.sheetBtnText}>
                {loading ? "Connecting..." : "Connect Email"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function AccountsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, deleteAccount, totalBalance, emailSync } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [showEmailConnect, setShowEmailConnect] = useState(false);

  const topPaddingWeb = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 },
        ]}
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
            ${totalBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <Text style={styles.netWorthSub}>
            Across {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {!emailSync.isConnected ? (
          <TouchableOpacity
            style={[
              styles.emailBanner,
              { backgroundColor: colors.accent, borderColor: colors.primary + "40" },
            ]}
            onPress={() => setShowEmailConnect(true)}
          >
            <View style={[styles.emailIconBg, { backgroundColor: colors.primary + "20" }]}>
              <Feather name="mail" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.emailBannerTitle, { color: colors.foreground }]}>
                Connect Email
              </Text>
              <Text style={[styles.emailBannerSub, { color: colors.mutedForeground }]}>
                Auto-import transactions from bank alerts
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View
            style={[
              styles.connectedBanner,
              { backgroundColor: colors.success + "15", borderColor: colors.success + "40" },
            ]}
          >
            <Feather name="check-circle" size={18} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.connectedTitle, { color: colors.foreground }]}>
                Email Connected
              </Text>
              <Text style={[styles.connectedSub, { color: colors.mutedForeground }]}>
                {emailSync.email}
              </Text>
            </View>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          ALL ACCOUNTS
        </Text>
        {accounts.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            onDelete={() => deleteAccount(a.id)}
          />
        ))}
        {accounts.length === 0 && (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Feather name="credit-card" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No accounts yet
            </Text>
          </View>
        )}
      </ScrollView>

      <AddAccountModal visible={showAdd} onClose={() => setShowAdd(false)} />
      {showEmailConnect && (
        <EmailConnectSheet onClose={() => setShowEmailConnect(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  netWorthCard: {
    borderRadius: 20,
    padding: 24,
    gap: 4,
  },
  netWorthLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  netWorthAmount: {
    color: "#fff",
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  netWorthSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  emailBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  emailIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emailBannerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emailBannerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  connectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  connectedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  connectedSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: { flex: 1, gap: 3 },
  accountName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  accountBank: { fontSize: 12, fontFamily: "Inter_400Regular" },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  typeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  accountRight: { alignItems: "flex-end", gap: 8 },
  accountBalance: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empty: { padding: 40, borderRadius: 14, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  sheetInner: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sheetContent: { gap: 16 },
  emailIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  sheetSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    textAlign: "center",
  },
  sheetInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  sheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  sheetBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
