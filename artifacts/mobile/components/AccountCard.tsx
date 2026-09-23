import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Account, getShortBankName } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const TYPE_ICONS: Record<string, string> = {
  checking: "credit-card",
  savings: "dollar-sign",
  credit: "credit-card",
  investment: "trending-up",
};

interface Props {
  account: Account;
  onPress?: () => void;
}

export default function AccountCard({ account, onPress }: Props) {
  const colors = useColors();
  const isCredit = account.type === "credit";
  const balance = account.balance;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: account.color }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      activeOpacity={0.85}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.bankName}>{getShortBankName(account.bank, account.name)}</Text>
          <Text style={styles.accountName}>{account.name}</Text>
        </View>
        <View style={[styles.iconBg]}>
          <Feather
            name={TYPE_ICONS[account.type] as any}
            size={18}
            color="#ffffff"
          />
        </View>
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.balanceLabel}>
            {isCredit ? "Balance Due" : "Available Balance"}
          </Text>
          <Text style={styles.balance}>
            {isCredit ? "-" : ""}${Math.abs(balance).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
        {account.lastFour && (
          <Text style={styles.lastFour}>•••• {account.lastFour}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    height: 130,
    borderRadius: 16,
    padding: 18,
    justifyContent: "space-between",
    marginRight: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bankName: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  accountName: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  iconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  balance: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  lastFour: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
  },
});
