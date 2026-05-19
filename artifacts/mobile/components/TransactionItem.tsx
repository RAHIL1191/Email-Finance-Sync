import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { PLAID_BANKS, Transaction, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export const CATEGORY_ICONS: Record<string, string> = {
  Income: "trending-up",
  Shopping: "shopping-bag",
  Food: "coffee",
  Groceries: "shopping-cart",
  Entertainment: "film",
  Transport: "navigation",
  Housing: "home",
  Utilities: "zap",
  Health: "heart",
  Insurance: "shield",
  Education: "book-open",
  Transfer: "repeat",
  Bills: "file-text",
  Other: "circle",
};

export const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f97316",
  Shopping: "#8b5cf6",
  Groceries: "#10b981",
  Entertainment: "#ec4899",
  Transport: "#3b82f6",
  Housing: "#6366f1",
  Utilities: "#f59e0b",
  Health: "#14b8a6",
  Insurance: "#64748b",
  Education: "#8b5cf6",
  Income: "#10b981",
  Transfer: "#94a3b8",
  Bills: "#ef4444",
  Other: "#94a3b8",
};

interface Props {
  transaction: Transaction;
  onPress?: () => void;
}

export default function TransactionItem({ transaction, onPress }: Props) {
  const colors = useColors();
  const { accounts } = useApp();
  const isIncome = transaction.type === "income";
  const icon = (CATEGORY_ICONS[transaction.category] || "circle") as any;
  const catColor = CATEGORY_COLORS[transaction.category] || colors.primary;
  const account = accounts.find((a) => a.id === transaction.accountId);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: catColor + "20" }]}>
        <Feather name={icon} size={20} color={catColor} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {transaction.title}
        </Text>
        {account && (
          <View style={styles.metaRow}>
            {account.accountHolder && (
              <Text style={[styles.metaName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {account.accountHolder}
              </Text>
            )}
            <View style={[styles.typePill, { backgroundColor: account.color + "18" }]}>
              <Feather
                name={
                  account.type === "checking" ? "layers"
                  : account.type === "savings" ? "shield"
                  : account.type === "credit" ? "credit-card"
                  : "trending-up"
                }
                size={9}
                color={account.color}
              />
              <Text style={[styles.typePillText, { color: account.color }]}>
                {account.type === "checking" ? "Chequing"
                  : account.type === "savings" ? "Savings"
                  : account.type === "credit" ? "Credit"
                  : "Investment"}
              </Text>
            </View>
            {(() => {
              const bankMeta = PLAID_BANKS.find(
                (b) => b.name.toLowerCase() === (account.bank ?? "").toLowerCase()
              );
              return bankMeta ? (
                <Text style={styles.bankIcon}>{bankMeta.icon}</Text>
              ) : (
                <Feather name="briefcase" size={12} color={colors.mutedForeground} />
              );
            })()}
          </View>
        )}
      </View>
      <Text style={[styles.amount, { color: isIncome ? "#10b981" : colors.foreground }]}>
        ${transaction.amount.toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  metaName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  bankIcon: {
    fontSize: 13,
  },
  amount: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
