import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import TransactionAvatar from "@/components/TransactionAvatar";
import { Transaction, formatTxCleanTitle, getShortBankName, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";

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
  const { colorScheme } = useTheme();
  const isDark = colorScheme === "dark";
  const { accounts } = useApp();
  const isIncome = transaction.type === "income";
  const account = accounts.find((a) => a.id === transaction.accountId);

  // Format date as "MMM DD" (e.g. "May 27")
  const dateStr = React.useMemo(() => {
    try {
      const dt = new Date(transaction.date + "T00:00:00");
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return transaction.date;
    }
  }, [transaction.date]);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isDark ? "#1e1e1f" : "#f5f5f7",
          borderColor: isDark ? "#2c2c2e" : "#e5e5ea",
          shadowColor: isDark ? "#000000" : "#00000010",
        },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      activeOpacity={0.75}
    >
      <TransactionAvatar
        title={transaction.title}
        merchant={transaction.merchant}
        category={transaction.category}
        type={transaction.type}
        size={42}
        iconSize={20}
        style={{ marginRight: 12 }}
      />
      <View style={styles.leftCol}>
        <Text style={[styles.title, { color: isDark ? "#ffffff" : "#111111" }]} numberOfLines={1}>
          {formatTxCleanTitle(transaction.title, transaction.merchant)}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            {dateStr}
          </Text>
          {account && (
            <>
              <Text style={[styles.bullet, { color: colors.mutedForeground }]}>·</Text>
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
              {account.bank ? (
                <>
                  <Text style={[styles.bullet, { color: colors.mutedForeground }]}>·</Text>
                  <Text style={[styles.bankName, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {getShortBankName(account.bank, account.name)}
                  </Text>
                </>
              ) : null}
            </>
          )}
        </View>
      </View>
      <View style={styles.rightCol}>
        <Text style={[styles.amount, { color: isIncome ? "#10b981" : (isDark ? "#ffffff" : "#111111") }]}>
          {isIncome ? "+" : "-"}${transaction.amount.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  leftCol: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  dateText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  bullet: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    opacity: 0.7,
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
  bankName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rightCol: {
    alignItems: "flex-end",
  },
  amount: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
});
