import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Circle, G, Svg } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { computeBalance, useApp } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate } from "@/hooks/useLocalDate";
import { CatHeaderIllustration, CatBannerIllustration } from "@/components/CatIllustration";
import PendingRefundsWidget from "@/components/PendingRefundsWidget";
// ─── Donut Chart Component ───────────────────────────────────────────────────
function DonutChart({
  segments,
  size = 110,
  stroke = 14,
  centerAmount = "$0",
}: {
  segments: { value: number; color: string }[];
  size?: number;
  stroke?: number;
  centerAmount?: string;
}) {
  const colors = useColors();
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${cx},${cx}`}>
          {total === 0 ? (
            <Circle cx={cx} cy={cx} r={r} fill="none" stroke={colors.border} strokeWidth={stroke} />
          ) : (
            segments.map((seg, i) => {
              const dash = (seg.value / total) * circ;
              const gap = circ - dash;
              const el = (
                <Circle
                  key={i}
                  cx={cx}
                  cy={cx}
                  r={r}
                  fill="none"
                  stroke={seg.value > 0 ? seg.color : "transparent"}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              );
              offset += dash;
              return el;
            })
          )}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground }}>{centerAmount}</Text>
        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Total</Text>
      </View>
    </View>
  );
}

// ─── Category Color Helper ────────────────────────────────────────────────────
function getCategoryColor(categoryName: string, colors: any): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes("food") || lower.includes("dining") || lower.includes("restaurant") || lower.includes("grocer")) {
    return colors.catFood;
  }
  if (lower.includes("transport") || lower.includes("auto") || lower.includes("ride") || lower.includes("gas") || lower.includes("car")) {
    return colors.catTransport;
  }
  if (lower.includes("shop") || lower.includes("store") || lower.includes("clothing")) {
    return colors.catShopping;
  }
  if (lower.includes("entertain") || lower.includes("movie") || lower.includes("stream") || lower.includes("subscrip")) {
    return colors.catEntertainment;
  }
  return colors.catOthers;
}

// ─── Main HomeScreen Component ──────────────────────────────────────────────
export default function HomeScreen() {
  const colors = useColors();
  const { openDrawer } = useDrawer();
  const { colorScheme, setTheme } = useTheme();
  const {
    accounts,
    transactions,
    bills,
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    emailSync,
    syncEmailTransactions,
    userName,
    alerts,
    currentMonth,
    billReviewMatches,
    approveBillReviewMatch,
    dismissBillReviewMatch,
    detectBillPayments,
    refreshTransactionsFromServer,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    detectBillPayments?.();
  }, [detectBillPayments]);

  const pendingBillReviews = useMemo(() => {
    return (billReviewMatches || []).filter((m) => {
      if (m.status !== "pending") return false;
      const b = bills.find((bill) => bill.id === m.billId);
      return b && !b.isPaid;
    });
  }, [billReviewMatches, bills]);

  const formatReviewDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = parseLocalDate(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };

  const now = useMemo(() => {
    const d = new Date();
    d.setMonth(currentMonth);
    return d;
  }, [currentMonth]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshTransactionsFromServer?.();
    if (emailSync.isConnected && emailSync.syncTransactions) {
      await syncEmailTransactions();
    }
    await detectBillPayments?.();
    setRefreshing(false);
  };

  const unreadAlertsCount = useMemo(() => alerts.filter((a) => !a.isRead).length, [alerts]);

  // Dynamic calculations for current month's expenses/income matching exact month
  const currentMonthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = parseLocalDate(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [transactions, now]);

  const currentMonthExpenses = useMemo(() => {
    const sum = currentMonthTransactions
      .filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer")
      .reduce((s, t) => s + t.amount, 0);
    return sum > 0 ? sum : monthlyExpense;
  }, [currentMonthTransactions, monthlyExpense]);

  const currentMonthIncome = useMemo(() => {
    const sum = currentMonthTransactions
      .filter((t) => t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer")
      .reduce((s, t) => s + t.amount, 0);
    return sum > 0 ? sum : monthlyIncome;
  }, [currentMonthTransactions, monthlyIncome]);

  // Dynamic Category breakdown for Donut Chart & Legend
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    currentMonthTransactions
      .filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer")
      .forEach((t) => {
        const cat = t.category || "Others";
        map[cat] = (map[cat] || 0) + t.amount;
      });

    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, amt]) => s + amt, 0);

    if (total === 0 || entries.length === 0) {
      return [];
    }

    const top4 = entries.slice(0, 4).map(([name, amount]) => ({
      name,
      amount,
      pct: Math.round((amount / total) * 100),
      color: getCategoryColor(name, colors),
    }));

    const otherSum = entries.slice(4).reduce((s, [, amt]) => s + amt, 0);
    if (otherSum > 0) {
      top4.push({
        name: "Others",
        amount: otherSum,
        pct: Math.round((otherSum / total) * 100),
        color: colors.catOthers,
      });
    }

    return top4;
  }, [currentMonthTransactions, colors]);

  // Recent 3 Transactions sorted by date descending
  const recentTransactionsList = useMemo(() => {
    const sorted = [...transactions].sort(
      (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
    );
    return sorted.slice(0, 3).map((t) => {
      const d = parseLocalDate(t.date);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      if (d.toDateString() === today.toDateString()) dateStr = "Today";
      else if (d.toDateString() === yesterday.toDateString()) dateStr = "Yesterday";

      const acct = accounts.find((a) => a.id === t.accountId);
      const mask = acct ? `•• ${acct.lastFour || (acct.name ? acct.name.slice(-4) : "1842")}` : "•• 1842";

      return {
        id: t.id,
        title: t.title || t.merchant || "Transaction",
        subtitle: `${t.category || "General"} • ${mask}`,
        amount: `${t.type === "expense" ? "-" : "+"}$${t.amount.toFixed(2)}`,
        date: dateStr,
        category: t.category || "General",
      };
    });
  }, [transactions, accounts]);

  // Upcoming 2 Bills
  const upcomingBillsList = useMemo(() => {
    const pending = bills
      .filter((b) => !b.isPaid)
      .sort((a, b) => parseLocalDate(a.dueDate).getTime() - parseLocalDate(b.dueDate).getTime())
      .slice(0, 2);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return pending.map((b) => {
      const d = parseLocalDate(b.dueDate);
      return {
        id: b.id,
        title: b.title,
        category: b.category || "Subscription",
        amount: `-$${b.amount.toFixed(2)}`,
        dueDate: `${monthNames[d.getMonth()]} ${d.getDate()}`,
      };
    });
  }, [bills]);

  const [hideBalance, setHideBalance] = useState(false);

  // Balance comparison vs last month
  const netChange = useMemo(() => currentMonthIncome - currentMonthExpenses, [currentMonthIncome, currentMonthExpenses]);
  const previousBalance = useMemo(() => Math.max(totalBalance - netChange, 0.01), [totalBalance, netChange]);
  const balancePctChange = useMemo(() => {
    if (previousBalance <= 0) return 0;
    return (netChange / previousBalance) * 100;
  }, [netChange, previousBalance]);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Fixed Clean Header with Drawer & Theme Toggle ── */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Side Drawer Hamburger Button */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openDrawer();
            }}
            hitSlop={8}
          >
            <Feather name="menu" size={20} color={colors.foreground} />
          </TouchableOpacity>

          <View style={styles.headerLeft}>
            <Text style={[styles.greetingTitle, { color: colors.foreground }]}>
              Hi, {userName || "Meow"}! 👋
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Notifications Icon with Red Dot */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/alerts")}
            hitSlop={8}
          >
            <Feather name="bell" size={19} color={colors.foreground} />
            {unreadAlertsCount > 0 && <View style={styles.notificationBadge} />}
          </TouchableOpacity>

          {/* User Profile Avatar */}
          <TouchableOpacity onPress={() => router.push("/settings")} hitSlop={8}>
            <Image
              source={{ uri: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" }}
              style={styles.avatarImage}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* ── 0. Total Balance Stacked Card Widget ── */}
        <View style={styles.stackedCardWrapper}>
          {/* Stacked Background Layers */}
          <View style={[styles.stackedLayerBack2, { backgroundColor: colors.primary + "33" }]} />
          <View style={[styles.stackedLayerBack1, { backgroundColor: colors.primary + "66" }]} />

          {/* Main Card */}
          <View style={[styles.totalBalanceCard, { backgroundColor: "#4C1D95" }]}>
            {/* Card Header: Wallet Icon & Title + Controls */}
            <View style={styles.balanceCardHeader}>
              <View style={styles.walletTitleRow}>
                <View style={styles.walletIconBadge}>
                  <Feather name="briefcase" size={16} color="#FFFFFF" />
                </View>
                <Text style={styles.balanceCardLabel}>Total Balance</Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {/* Refresh/Sync button */}
                <TouchableOpacity
                  style={styles.cardActionBtn}
                  onPress={handleRefresh}
                  hitSlop={8}
                >
                  <Feather name="repeat" size={15} color="#FFFFFF" />
                </TouchableOpacity>

                {/* Hide/Show Balance toggle */}
                <TouchableOpacity
                  style={styles.cardActionBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setHideBalance(!hideBalance);
                  }}
                  hitSlop={8}
                >
                  <Feather name={hideBalance ? "eye-off" : "eye"} size={15} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Main Balance Display */}
            <View style={styles.balanceAmountRow}>
              <Text style={styles.balanceMainText}>
                {hideBalance
                  ? "$••••••••"
                  : `$${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
            </View>

            {/* Comparison vs Last Month Footer */}
            <View style={styles.balanceFooterRow}>
              <View style={styles.comparisonBadge}>
                <Feather
                  name={netChange >= 0 ? "arrow-up" : "arrow-down"}
                  size={12}
                  color={netChange >= 0 ? "#34D399" : "#F87171"}
                />
                <Text
                  style={[
                    styles.comparisonPctText,
                    { color: netChange >= 0 ? "#34D399" : "#F87171" },
                  ]}
                >
                  {netChange >= 0 ? "+" : ""}{balancePctChange.toFixed(1)}%
                </Text>
                <Text style={styles.comparisonSubText}>vs last month</Text>
              </View>

              <View style={styles.diffPill}>
                <Text style={styles.diffPillText}>
                  {netChange >= 0 ? "+" : "-"}${Math.abs(netChange).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 1. Top Financial Overview Widget ── */}
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.topWidgetRow}>
            {/* Expense Card */}
            <View style={[styles.statBox, { backgroundColor: colors.expenseBg }]}>
              <View style={styles.statPill}>
                <Feather name="arrow-down" size={10} color={colors.expense} />
                <Text style={[styles.statPillText, { color: colors.expense }]}>Expenses</Text>
              </View>
              <Text style={[styles.statAmount, { color: colors.foreground }]}>
                -${Math.abs(currentMonthExpenses).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.statPeriod, { color: colors.mutedForeground }]}>This month</Text>
              <View style={styles.changeBadgeRow}>
                <Feather name="arrow-down" size={10} color={colors.expense} />
                <Text style={[styles.changeText, { color: colors.expense }]}>12%</Text>
              </View>
            </View>

            {/* Income Card */}
            <View style={[styles.statBox, { backgroundColor: colors.incomeBg }]}>
              <View style={styles.statPill}>
                <Feather name="arrow-up" size={10} color={colors.income} />
                <Text style={[styles.statPillText, { color: colors.income }]}>Income</Text>
              </View>
              <Text style={[styles.statAmount, { color: colors.foreground }]}>
                ${Math.abs(currentMonthIncome).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.statPeriod, { color: colors.mutedForeground }]}>This month</Text>
              <View style={styles.changeBadgeRow}>
                <Feather name="arrow-up" size={10} color={colors.income} />
                <Text style={[styles.changeText, { color: colors.income }]}>8%</Text>
              </View>
            </View>

            {/* Cute Cat Graphic */}
            <View style={styles.catGraphicContainer}>
              <CatHeaderIllustration size={68} />
            </View>
          </View>
        </View>

        {/* ── 2. Spending Overview Widget ── */}
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Spending overview</Text>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.sectionLink, { color: colors.mutedForeground }]}>This month</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.donutRow}>
            {/* Donut Chart */}
            <DonutChart
              segments={categoryBreakdown.map((c) => ({ value: c.amount, color: c.color }))}
              size={110}
              stroke={14}
              centerAmount={`$${Math.round(currentMonthExpenses).toLocaleString()}`}
            />

            {/* Category Legend List */}
            <View style={styles.legendList}>
              {categoryBreakdown.map((item, idx) => (
                <View key={idx} style={styles.legendItem}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={[styles.legendName, { color: colors.foreground }]}>{item.name}</Text>
                  </View>
                  <Text style={[styles.legendPct, { color: colors.mutedForeground }]}>{item.pct}%</Text>
                  <Text style={[styles.legendAmt, { color: colors.foreground }]}>
                    ${item.amount.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── 3. Recent Transactions Widget ── */}
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent transactions</Text>
            <TouchableOpacity onPress={() => router.push("/transactions")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.sectionLink, { color: colors.mutedForeground }]}>View all</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 14 }}>
            {recentTransactionsList.map((item) => (
              <View key={item.id} style={styles.listRow}>
                <View style={[styles.iconCircle, { backgroundColor: getCategoryColor(item.category, colors) + "22" }]}>
                  <Feather
                    name={
                      item.category.toLowerCase().includes("food")
                        ? "coffee"
                        : item.category.toLowerCase().includes("trans")
                          ? "navigation"
                          : "shopping-bag"
                    }
                    size={18}
                    color={getCategoryColor(item.category, colors)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{item.subtitle}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.rowAmount, { color: colors.foreground }]}>{item.amount}</Text>
                  <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>{item.date}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Bills Under Review Widget (near Upcoming Bills) ── */}
        {pendingBillReviews.length > 0 && (
          <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: "#F59E0B77", borderWidth: 1.5 }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#F59E0B22", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="alert-circle" size={15} color="#F59E0B" />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bills under review</Text>
              </View>
              <View style={{ backgroundColor: "#F59E0B22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#F59E0B" }}>
                  {pendingBillReviews.length} pending
                </Text>
              </View>
            </View>

            <View style={{ gap: 14, marginTop: 6 }}>
              {pendingBillReviews.map((item) => (
                <View key={item.id} style={[styles.reviewMatchCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.reviewPromptText, { color: colors.foreground }]}>
                    I noticed this transaction resembling your pending bill with a different amount. Should I mark it as paid?
                  </Text>

                  <View style={[styles.reviewComparisonRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* Pending Bill column */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewSubHeader, { color: colors.mutedForeground }]}>Pending Bill</Text>
                      <Text style={[styles.reviewItemTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {item.billTitle}
                      </Text>
                      <Text style={[styles.reviewItemMeta, { color: colors.mutedForeground }]}>
                        Due {formatReviewDate(item.billDueDate)} • {item.billCategory}
                      </Text>
                      <Text style={[styles.reviewItemAmt, { color: colors.foreground }]}>
                        ${item.billAmount.toFixed(2)}
                      </Text>
                    </View>

                    {/* Arrow Divider */}
                    <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                      <Feather name="arrow-right" size={16} color={colors.mutedForeground} />
                    </View>

                    {/* Found Transaction column */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewSubHeader, { color: colors.mutedForeground }]}>Found Transaction</Text>
                      <Text style={[styles.reviewItemTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {item.transactionTitle}
                      </Text>
                      <Text style={[styles.reviewItemMeta, { color: colors.mutedForeground }]}>
                        {formatReviewDate(item.transactionDate)} • {item.transactionCategory}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.reviewItemAmt, { color: colors.foreground }]}>
                          ${item.transactionAmount.toFixed(2)}
                        </Text>
                        <View style={[styles.diffBadge, { backgroundColor: item.difference > 0 ? "#EF444422" : "#10B98122" }]}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: item.difference > 0 ? "#EF4444" : "#10B981" }}>
                            {item.difference > 0 ? `+` : ""}${item.difference.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Recurring note */}
                  {item.isRecurring && (
                    <Text style={[styles.reviewRecurringNote, { color: colors.mutedForeground }]}>
                      💡 Approving will mark this paid & update recurring bill to ${item.transactionAmount.toFixed(2)}.
                    </Text>
                  )}

                  {/* Action buttons */}
                  <View style={styles.reviewActionsRow}>
                    <TouchableOpacity
                      style={[styles.reviewDismissBtn, { borderColor: colors.border }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        dismissBillReviewMatch(item.id);
                      }}
                    >
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.reviewDismissTxt, { color: colors.mutedForeground }]}>Not this bill</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.reviewApproveBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        approveBillReviewMatch(item.id);
                      }}
                    >
                      <Feather name="check" size={14} color="#FFFFFF" />
                      <Text style={styles.reviewApproveTxt}>Mark as Paid</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Pending Refunds Widget (with AI Match alert) ── */}
        <PendingRefundsWidget />

        {/* ── 4. Upcoming Bills Widget ── */}
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming bills</Text>
            <TouchableOpacity onPress={() => router.push("/bills")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.sectionLink, { color: colors.mutedForeground }]}>View all</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 14 }}>
            {upcomingBillsList.map((item) => (
              <View key={item.id} style={styles.listRow}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: item.title.toLowerCase().includes("netflix") ? "#E5091422" : "#1A56DB22",
                    },
                  ]}
                >
                  <Feather
                    name={item.title.toLowerCase().includes("netflix") ? "tv" : "credit-card"}
                    size={18}
                    color={item.title.toLowerCase().includes("netflix") ? "#E50914" : "#1A56DB"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{item.category}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.rowAmount, { color: colors.foreground }]}>{item.amount}</Text>
                  <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>{item.dueDate}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── 5. Streak / Motivation Banner Widget ── */}
        <View style={[styles.bannerCard, { backgroundColor: colors.incomeBg }]}>
          <View style={[styles.bannerIconBadge, { backgroundColor: colors.income + "22" }]}>
            <Feather name="shield" size={18} color={colors.income} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>Great job! 🎉</Text>
            <Text style={[styles.bannerSubtitle, { color: colors.mutedForeground }]}>
              You're on track. Keep it up!
            </Text>
          </View>
          <CatBannerIllustration size={44} />
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Stylesheet ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerLeft: {
    gap: 4,
  },
  greetingTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  greetingSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 16,
  },
  stackedCardWrapper: {
    position: "relative",
    marginBottom: 4,
  },
  stackedLayerBack2: {
    position: "absolute",
    top: -8,
    left: 14,
    right: 14,
    height: 30,
    borderRadius: 20,
  },
  stackedLayerBack1: {
    position: "absolute",
    top: -4,
    left: 7,
    right: 7,
    height: 30,
    borderRadius: 20,
  },
  totalBalanceCard: {
    borderRadius: 22,
    padding: 18,
    elevation: 6,
    shadowColor: "#4C1D95",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  balanceCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  walletIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceCardLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255, 255, 255, 0.85)",
  },
  cardActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceAmountRow: {
    marginVertical: 12,
  },
  balanceMainText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  balanceFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  comparisonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  comparisonPctText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  comparisonSubText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.7)",
    marginLeft: 2,
  },
  diffPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  diffPillText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  widgetCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  topWidgetRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statPillText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  statAmount: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  statPeriod: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  changeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  changeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  catGraphicContainer: {
    width: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  sectionLink: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  donutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  legendList: {
    flex: 1,
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  legendPct: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginRight: 8,
  },
  legendAmt: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  rowDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  bannerCard: {
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  bannerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  reviewMatchCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  reviewPromptText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  reviewComparisonRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
  },
  reviewSubHeader: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  reviewItemTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  reviewItemMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
    marginBottom: 4,
  },
  reviewItemAmt: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  diffBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  reviewRecurringNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  reviewActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  reviewDismissBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  reviewDismissTxt: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  reviewApproveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  reviewApproveTxt: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
