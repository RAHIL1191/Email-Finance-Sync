import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Account, Bill, Transaction } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import TransactionDetailModal from "@/components/TransactionDetailModal";

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  Bills: "file-text",
  Other: "circle",
};

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f97316",
  Shopping: "#8b5cf6",
  Groceries: "#10b981",
  Entertainment: "#ec4899",
  Transport: "#3b82f6",
  Housing: "#6366f1",
  Utilities: "#f59e0b",
  Health: "#14b8a6",
  Insurance: "#64748b",
  Income: "#10b981",
  Bills: "#ef4444",
  Other: "#94a3b8",
};

interface ListItem {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  accountId?: string;
  isBill?: boolean;
}

interface DrillDown {
  title: string;
  subtitle: string;
  items: ListItem[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  year: number;
  month: number; // 0-indexed
  transactions: Transaction[];
  bills: Bill[];
  accounts: Account[];
}

function formatDate(dateStr: string): string {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dateOnly = dateStr.slice(0, 10);
  const d = new Date(dateStr);
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (dateOnly === todayStr) return `Today, ${timeStr}`;
  const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  if (dateOnly === yest) return `Yesterday, ${timeStr}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmt(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function localeDateStr(d: Date): string {
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function MonthDetailModal({
  visible,
  onClose,
  year,
  month,
  transactions,
  bills,
  accounts,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = FULL_MONTHS[month];
  const monthStartDate = new Date(year, month, 1);

  const {
    incomeUntilToday,
    incomeUpcoming,
    expenseUntilToday,
    upcomingExpAndBills,
    totalIncomeUntilToday,
    totalIncomeUpcoming,
    totalExpenseUntilToday,
    totalExpenseUpcoming,
    totalIncome,
    totalExpense,
  } = useMemo(() => {
    const inMonth = transactions.filter(
      (t) =>
        t.date.startsWith(monthPrefix) &&
        t.category !== "Transfer" &&
        t.category?.toLowerCase() !== "transfer"
    );

    const incomeUntilToday = inMonth.filter(
      (t) => t.type === "income" && t.date.slice(0, 10) <= todayStr
    );
    const incomeUpcoming = inMonth.filter(
      (t) => t.type === "income" && t.date.slice(0, 10) > todayStr
    );
    const expenseUntilToday = inMonth.filter(
      (t) => t.type === "expense" && t.date.slice(0, 10) <= todayStr
    );
    const futureExpenses = inMonth.filter(
      (t) => t.type === "expense" && t.date.slice(0, 10) > todayStr
    );

    const upcomingBillItems: ListItem[] = bills
      .filter(
        (b) =>
          b.dueDate.startsWith(monthPrefix) &&
          !b.isPaid &&
          b.dueDate.slice(0, 10) > todayStr
      )
      .map((b) => ({
        id: b.id,
        title: b.title,
        amount: b.amount,
        type: "expense" as const,
        category: b.category || "Bills",
        date: b.dueDate,
        accountId: b.accountId,
        isBill: true,
      }));

    const upcomingExpAndBills: ListItem[] = [
      ...futureExpenses.map((t) => ({
        id: t.id,
        title: t.title,
        amount: t.amount,
        type: "expense" as const,
        category: t.category,
        date: t.date,
        accountId: t.accountId,
      })),
      ...upcomingBillItems,
    ];

    const totalIncomeUntilToday = incomeUntilToday.reduce((s, t) => s + t.amount, 0);
    const totalIncomeUpcoming = incomeUpcoming.reduce((s, t) => s + t.amount, 0);
    const totalExpenseUntilToday = expenseUntilToday.reduce((s, t) => s + t.amount, 0);
    const totalExpenseUpcoming = upcomingExpAndBills.reduce((s, b) => s + b.amount, 0);
    const totalIncome = totalIncomeUntilToday + totalIncomeUpcoming;
    const totalExpense = totalExpenseUntilToday + totalExpenseUpcoming;

    return {
      incomeUntilToday,
      incomeUpcoming,
      expenseUntilToday,
      upcomingExpAndBills,
      totalIncomeUntilToday,
      totalIncomeUpcoming,
      totalExpenseUntilToday,
      totalExpenseUpcoming,
      totalIncome,
      totalExpense,
    };
  }, [transactions, bills, monthPrefix, todayStr]);

  const balanceOverall = totalIncome - totalExpense;
  const balanceUntilToday = totalIncomeUntilToday - totalExpenseUntilToday;

  const txToItem = (t: Transaction): ListItem => ({
    id: t.id,
    title: t.title,
    amount: t.amount,
    type: t.type,
    category: t.category,
    date: t.date,
    accountId: t.accountId,
  });

  const handleDrill = (data: DrillDown) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDrillDown(data);
  };

  const handleClose = () => {
    setDrillDown(null);
    onClose();
  };

  function getAccountLabel(accountId?: string) {
    if (!accountId) return null;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return null;
    const typeLabel = acc.type.charAt(0).toUpperCase() + acc.type.slice(1);
    return `${acc.bank} | ${typeLabel}`;
  }

  const pb = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          activeOpacity={1}
        />

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: pb },
          ]}
        >
          {/* ── Summary view ── */}
          {!drillDown ? (
            <>
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <View style={{ width: 28 }} />
                <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                  {monthName}
                </Text>
                <TouchableOpacity onPress={handleClose} hitSlop={8}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={styles.body}>
                {/* Total Income */}
                <View style={styles.section}>
                  <View style={styles.sectionTitle}>
                    <View style={[styles.sectionIcon, { backgroundColor: "#10b98118" }]}>
                      <Feather name="trending-up" size={17} color="#10b981" />
                    </View>
                    <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
                      Total Income
                    </Text>
                    <Text style={[styles.sectionAmt, { color: "#10b981" }]}>
                      {fmt(totalIncome)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.subRow}
                    onPress={() =>
                      handleDrill({
                        title: "Until today",
                        subtitle: `Between ${localeDateStr(monthStartDate)} to ${localeDateStr(today)}`,
                        items: incomeUntilToday.map(txToItem),
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: "#10b981" }]} />
                    <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                      Until today
                    </Text>
                    <Text style={[styles.subAmt, { color: colors.foreground }]}>
                      {fmt(totalIncomeUntilToday)}
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.subRow}
                    onPress={() =>
                      handleDrill({
                        title: "Upcoming",
                        subtitle: `After ${localeDateStr(today)}`,
                        items: incomeUpcoming.map(txToItem),
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: "#10b98160" }]} />
                    <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                      Upcoming
                    </Text>
                    <Text style={[styles.subAmt, { color: colors.foreground }]}>
                      {fmt(totalIncomeUpcoming)}
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Total Expense */}
                <View style={styles.section}>
                  <View style={styles.sectionTitle}>
                    <View style={[styles.sectionIcon, { backgroundColor: "#f9731618" }]}>
                      <Feather name="shopping-cart" size={17} color="#f97316" />
                    </View>
                    <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
                      Total Expense
                    </Text>
                    <Text style={[styles.sectionAmt, { color: colors.foreground }]}>
                      {fmt(totalExpense)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.subRow}
                    onPress={() =>
                      handleDrill({
                        title: "Until today",
                        subtitle: `Between ${localeDateStr(monthStartDate)} to ${localeDateStr(today)}`,
                        items: expenseUntilToday.map(txToItem),
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: "#f97316" }]} />
                    <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                      Until today
                    </Text>
                    <Text style={[styles.subAmt, { color: colors.foreground }]}>
                      {fmt(totalExpenseUntilToday)}
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.subRow}
                    onPress={() =>
                      handleDrill({
                        title: "Upcoming Expenses/Bills",
                        subtitle: `After ${localeDateStr(today)}`,
                        items: upcomingExpAndBills,
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: "#f9731660" }]} />
                    <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                      Upcoming Expenses/Bills
                    </Text>
                    <Text style={[styles.subAmt, { color: colors.foreground }]}>
                      {fmt(totalExpenseUpcoming)}
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Balances */}
                <View style={styles.balances}>
                  <View style={styles.balanceRow}>
                    <Text style={[styles.balanceLabel, { color: colors.foreground }]}>
                      Balance (Overall)
                    </Text>
                    <Text
                      style={[
                        styles.balanceAmt,
                        { color: balanceOverall >= 0 ? "#10b981" : "#ef4444" },
                      ]}
                    >
                      {fmt(Math.abs(balanceOverall))}
                    </Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={[styles.balanceLabel, { color: colors.foreground }]}>
                      Balance (Until Today)
                    </Text>
                    <Text
                      style={[
                        styles.balanceAmt,
                        { color: balanceUntilToday >= 0 ? "#10b981" : "#ef4444" },
                      ]}
                    >
                      {fmt(Math.abs(balanceUntilToday))}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            /* ── Drill-down list ── */
            <>
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setDrillDown(null)}
                  hitSlop={8}
                  style={styles.backBtn}
                >
                  <Feather name="arrow-left" size={20} color={colors.foreground} />
                </TouchableOpacity>
                <View style={styles.drillCenter}>
                  <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                    {drillDown.title}
                  </Text>
                  <Text style={[styles.drillSub, { color: colors.mutedForeground }]}>
                    {drillDown.subtitle}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleClose} hitSlop={8}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {drillDown.items.length === 0 ? (
                <View style={styles.empty}>
                  <Feather name="inbox" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    No transactions for this period
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={drillDown.items}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ padding: 16, gap: 8 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const icon = CATEGORY_ICONS[item.category] || "circle";
                    const color = CATEGORY_COLORS[item.category] || "#94a3b8";
                    const isIncome = item.type === "income";
                    const accountLabel = getAccountLabel(item.accountId);

                    const fullTx = item.isBill ? null : transactions.find((t) => t.id === item.id) ?? null;

                    return (
                      <TouchableOpacity
                        activeOpacity={fullTx ? 0.7 : 1}
                        onPress={() => {
                          if (fullTx) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setEditingTransaction(fullTx);
                          }
                        }}
                        style={[
                          styles.listItem,
                          {
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.listIcon,
                            { backgroundColor: color + "22" },
                          ]}
                        >
                          <Feather name={icon as any} size={18} color={color} />
                        </View>
                        <View style={styles.listInfo}>
                          <Text
                            style={[styles.listTitle, { color: colors.foreground }]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.listDate, { color: colors.mutedForeground }]}
                          >
                            {formatDate(item.date)}
                            {item.isBill ? " · Due" : ""}
                          </Text>
                          {accountLabel && (
                            <View style={styles.listAccountRow}>
                              <Feather
                                name="credit-card"
                                size={10}
                                color={colors.mutedForeground}
                              />
                              <Text
                                style={[
                                  styles.listAccount,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                {accountLabel}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.listAmt,
                            { color: isIncome ? "#10b981" : colors.foreground },
                          ]}
                        >
                          ${item.amount.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </>
          )}
        </View>
      </View>

      {editingTransaction && (
        <TransactionDetailModal
          visible={!!editingTransaction}
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: "85%",
    minHeight: 300,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 0,
  },
  section: { paddingVertical: 6, gap: 0 },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sectionAmt: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingLeft: 44,
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  subLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  subAmt: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  balances: {
    paddingVertical: 10,
    gap: 10,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  balanceAmt: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  // Drill-down
  backBtn: { padding: 4 },
  drillCenter: { flex: 1, alignItems: "center" },
  drillSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  listInfo: { flex: 1, gap: 2 },
  listTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  listDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  listAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  listAccount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  listAmt: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
