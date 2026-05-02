import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Transaction, useApp } from "@/context/AppContext";
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

  const date = new Date(transaction.date);
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const isToday = new Date().toDateString() === date.toDateString();
  const dateLabel = isToday
    ? `Today, ${timeStr}`
    : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${timeStr}`;

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
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {dateLabel}
          </Text>
          {account && (
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {" · "}{account.name}
            </Text>
          )}
        </View>
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
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  amount: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
