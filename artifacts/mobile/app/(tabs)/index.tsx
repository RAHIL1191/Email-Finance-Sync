import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AccountCard from "@/components/AccountCard";
import AddTransactionModal from "@/components/AddTransactionModal";
import SummaryCard from "@/components/SummaryCard";
import TransactionItem from "@/components/TransactionItem";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    accounts,
    transactions,
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    emailSync,
    isSyncing,
    syncEmailTransactions,
  } = useApp();

  const [showAddTx, setShowAddTx] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const recentTx = transactions.slice(0, 5);
  const topPaddingWeb = Platform.OS === "web" ? 67 : insets.top;

  const handleRefresh = async () => {
    setRefreshing(true);
    if (emailSync.isConnected) {
      await syncEmailTransactions();
    }
    setRefreshing(false);
  };

  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
      ? "Good afternoon"
      : "Good evening";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 },
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPaddingWeb + 12 }]}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {greeting}
            </Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              My Finances
            </Text>
          </View>
          <View style={styles.headerActions}>
            {emailSync.isConnected && (
              <TouchableOpacity
                style={[styles.syncBtn, { backgroundColor: colors.card }]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await syncEmailTransactions();
                }}
                disabled={isSyncing}
              >
                <Feather
                  name={isSyncing ? "loader" : "refresh-cw"}
                  size={16}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAddTx(true);
              }}
            >
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Total Balance */}
        <View style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceAmount}>
            ${totalBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          {emailSync.isConnected && (
            <View style={styles.syncIndicator}>
              <Feather name="mail" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.syncText}>Email synced</Text>
            </View>
          )}
        </View>

        {/* Summary Row */}
        <View style={styles.summaryRow}>
          <SummaryCard
            label="Income"
            amount={monthlyIncome}
            type="income"
            icon="arrow-down-circle"
          />
          <SummaryCard
            label="Expenses"
            amount={monthlyExpense}
            type="expense"
            icon="arrow-up-circle"
          />
          <SummaryCard
            label="Saved"
            amount={monthlyIncome - monthlyExpense}
            type="total"
            icon="trending-up"
          />
        </View>

        {/* Accounts */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Accounts
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/accounts")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>
              See all
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountScroll}>
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </ScrollView>

        {/* Recent Transactions */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/transactions")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>
              See all
            </Text>
          </TouchableOpacity>
        </View>

        {recentTx.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No transactions yet
            </Text>
          </View>
        ) : (
          recentTx.map((t) => <TransactionItem key={t.id} transaction={t} />)
        )}
      </ScrollView>

      <AddTransactionModal
        visible={showAddTx}
        onClose={() => setShowAddTx(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  syncBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    gap: 4,
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  balanceAmount: {
    color: "#fff",
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  syncIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  syncText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  seeAll: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  accountScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  emptyState: {
    padding: 32,
    borderRadius: 14,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
