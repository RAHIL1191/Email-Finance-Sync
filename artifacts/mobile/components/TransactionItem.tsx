import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Transaction } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const CATEGORY_ICONS: Record<string, string> = {
  Income: "arrow-down-circle",
  Shopping: "shopping-bag",
  Food: "coffee",
  Groceries: "shopping-cart",
  Entertainment: "play-circle",
  Transport: "navigation",
  Housing: "home",
  Utilities: "zap",
  Health: "activity",
  Insurance: "shield",
  Other: "circle",
};

interface Props {
  transaction: Transaction;
  onPress?: () => void;
}

export default function TransactionItem({ transaction, onPress }: Props) {
  const colors = useColors();
  const isIncome = transaction.type === "income";
  const icon = CATEGORY_ICONS[transaction.category] || "circle";

  const date = new Date(transaction.date);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.card }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: isIncome
              ? colors.income + "20"
              : colors.expense + "15",
          },
        ]}
      >
        <Feather
          name={icon as any}
          size={18}
          color={isIncome ? colors.income : colors.expense}
        />
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {transaction.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.category, { color: colors.mutedForeground }]}>
            {transaction.category}
          </Text>
          {transaction.fromEmail && (
            <View style={[styles.emailBadge, { backgroundColor: colors.accent }]}>
              <Feather name="mail" size={9} color={colors.primary} />
              <Text style={[styles.emailText, { color: colors.primary }]}>
                Email
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.right}>
        <Text
          style={[
            styles.amount,
            { color: isIncome ? colors.income : colors.expense },
          ]}
        >
          {isIncome ? "+" : "-"}${transaction.amount.toFixed(2)}
        </Text>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>
          {dateStr}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  iconContainer: {
    width: 42,
    height: 42,
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
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  category: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  emailBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  emailText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  right: {
    alignItems: "flex-end",
    gap: 3,
  },
  amount: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  date: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
