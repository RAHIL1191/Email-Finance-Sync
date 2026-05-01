import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  label: string;
  amount: number;
  type: "income" | "expense" | "total";
  icon: string;
}

export default function SummaryCard({ label, amount, type, icon }: Props) {
  const colors = useColors();

  const iconColor =
    type === "income"
      ? colors.income
      : type === "expense"
      ? colors.expense
      : colors.primary;

  const iconBg =
    type === "income"
      ? colors.income + "18"
      : type === "expense"
      ? colors.expense + "15"
      : colors.primary + "18";

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={[styles.iconBg, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.amount, { color: colors.foreground }]}>
        ${Math.abs(amount).toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  iconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  amount: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
});
