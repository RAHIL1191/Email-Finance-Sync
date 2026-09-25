import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import type { SyncSummaryResult } from "@/context/AppContext";

interface SyncStatusModalProps {
  visible: boolean;
  result: SyncSummaryResult | null;
  onClose: () => void;
  onReconnect?: (itemId: string, bankName: string) => void;
}

export default function SyncStatusModal({
  visible,
  result,
  onClose,
  onReconnect,
}: SyncStatusModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (!result) return null;

  const {
    totalImported,
    accountsChecked,
    items,
    emailImported,
    emailError,
    needsAttention,
    allUpToDate,
  } = result;

  const hasPlaidAccounts = accountsChecked > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: Platform.OS === "web" ? 24 : Math.max(insets.bottom, 16) + 12,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Drag Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Status Header Icon & Title */}
          <View style={styles.header}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: needsAttention
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(16, 185, 129, 0.15)",
                  borderColor: needsAttention
                    ? "rgba(245, 158, 11, 0.4)"
                    : "rgba(16, 185, 129, 0.4)",
                },
              ]}
            >
              <Feather
                name={needsAttention ? "alert-triangle" : "check-circle"}
                size={32}
                color={needsAttention ? "#F59E0B" : "#10B981"}
              />
            </View>

            <Text style={[styles.title, { color: colors.foreground }]}>
              {needsAttention
                ? "Attention Required"
                : totalImported > 0
                ? `${totalImported} New Transaction${totalImported > 1 ? "s" : ""}`
                : "All Accounts Up to Date"}
            </Text>

            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {needsAttention
                ? "One or more of your accounts could not sync and requires reconnection."
                : totalImported > 0
                ? "Fresh transactions were successfully downloaded from your accounts."
                : hasPlaidAccounts
                ? `All ${accountsChecked} connected bank account${
                    accountsChecked > 1 ? "s were" : " was"
                  } checked. No new transactions found.`
                : "Your local transactions and database are fully synchronized."}
            </Text>
          </View>

          {/* Accounts Breakdown List */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Plaid Bank Accounts */}
            {items.map((item) => {
              const isError = !!item.error;
              const isRelogin = item.needsRelogin;

              return (
                <View
                  key={item.itemId}
                  style={[
                    styles.accountCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: isRelogin
                        ? "rgba(245, 158, 11, 0.4)"
                        : isError
                        ? "rgba(239, 68, 68, 0.3)"
                        : colors.border,
                    },
                  ]}
                >
                  <View style={styles.accountCardLeft}>
                    <View
                      style={[
                        styles.bankIconCircle,
                        {
                          backgroundColor: isRelogin
                            ? "rgba(245, 158, 11, 0.12)"
                            : isError
                            ? "rgba(239, 68, 68, 0.12)"
                            : "rgba(16, 185, 129, 0.12)",
                        },
                      ]}
                    >
                      <Feather
                        name={
                          isRelogin
                            ? "alert-circle"
                            : isError
                            ? "x-circle"
                            : "check"
                        }
                        size={16}
                        color={
                          isRelogin
                            ? "#F59E0B"
                            : isError
                            ? "#EF4444"
                            : "#10B981"
                        }
                      />
                    </View>

                    <View style={styles.bankInfo}>
                      <Text
                        style={[styles.bankName, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {item.bankName}
                      </Text>
                      <Text
                        style={[
                          styles.bankStatusText,
                          {
                            color: isRelogin
                              ? "#F59E0B"
                              : isError
                              ? "#EF4444"
                              : "#10B981",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {isRelogin
                          ? "Reconnect needed"
                          : isError
                          ? item.error || "Sync error"
                          : item.imported > 0
                          ? `+${item.imported} new transaction${item.imported > 1 ? "s" : ""}`
                          : "Up to date"}
                      </Text>
                    </View>
                  </View>

                  {/* Reconnect Action Button if login required */}
                  {isRelogin && onReconnect && (
                    <TouchableOpacity
                      style={styles.reconnectBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onClose();
                        onReconnect(item.itemId, item.bankName);
                      }}
                    >
                      <Feather name="refresh-cw" size={13} color="#FFFFFF" />
                      <Text style={styles.reconnectBtnText}>Reconnect</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {/* Email Sync Row (if active) */}
            {emailImported !== undefined && (
              <View
                style={[
                  styles.accountCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: emailError
                      ? "rgba(239, 68, 68, 0.3)"
                      : colors.border,
                  },
                ]}
              >
                <View style={styles.accountCardLeft}>
                  <View
                    style={[
                      styles.bankIconCircle,
                      {
                        backgroundColor: emailError
                          ? "rgba(239, 68, 68, 0.12)"
                          : "rgba(16, 185, 129, 0.12)",
                      },
                    ]}
                  >
                    <Feather
                      name={emailError ? "x-circle" : "mail"}
                      size={16}
                      color={emailError ? "#EF4444" : "#10B981"}
                    />
                  </View>

                  <View style={styles.bankInfo}>
                    <Text
                      style={[styles.bankName, { color: colors.foreground }]}
                    >
                      Email Receipts Sync
                    </Text>
                    <Text
                      style={[
                        styles.bankStatusText,
                        { color: emailError ? "#EF4444" : "#10B981" },
                      ]}
                    >
                      {emailError
                        ? emailError
                        : emailImported > 0
                        ? `+${emailImported} new from receipts`
                        : "Up to date"}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* No Plaid Accounts Connected note */}
            {!hasPlaidAccounts && emailImported === undefined && (
              <View
                style={[
                  styles.accountCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.accountCardLeft}>
                  <View
                    style={[
                      styles.bankIconCircle,
                      { backgroundColor: "rgba(99, 102, 241, 0.12)" },
                    ]}
                  >
                    <Feather name="database" size={16} color="#6366F1" />
                  </View>
                  <View style={styles.bankInfo}>
                    <Text
                      style={[styles.bankName, { color: colors.foreground }]}
                    >
                      Database & Server
                    </Text>
                    <Text
                      style={[
                        styles.bankStatusText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Transactions refreshed (no bank linked)
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.connectBankBtn, { borderColor: colors.primary }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                    router.push("/(tabs)/accounts");
                  }}
                >
                  <Text style={[styles.connectBankBtnText, { color: colors.primary }]}>
                    Link Bank
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            {needsAttention && (
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                  router.push("/(tabs)/accounts");
                }}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                  View Accounts
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: needsAttention
                    ? colors.card
                    : colors.primary,
                  borderColor: needsAttention ? colors.border : colors.primary,
                  flex: needsAttention ? 1 : undefined,
                  width: needsAttention ? undefined : "100%",
                },
              ]}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: needsAttention ? colors.foreground : "#FFFFFF" },
                ]}
              >
                {needsAttention ? "Dismiss" : "Done"}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "80%",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 18,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  scrollList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  scrollContent: {
    gap: 10,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  accountCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  bankIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  bankStatusText: {
    fontSize: 12.5,
    fontWeight: "500",
  },
  reconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  reconnectBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  connectBankBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  connectBankBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
