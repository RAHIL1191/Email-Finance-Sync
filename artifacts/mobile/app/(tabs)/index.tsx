import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";

import { computeBalance, formatTxCleanTitle, useApp } from "@/context/AppContext";
import type { SyncSummaryResult } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate } from "@/hooks/useLocalDate";
import { CatHeaderIllustration, CatBannerIllustration } from "@/components/CatIllustration";
import PendingRefundsWidget from "@/components/PendingRefundsWidget";
import SyncStatusModal from "@/components/SyncStatusModal";
import PlaidLinkModal from "@/components/PlaidLinkModal";
import TransactionAvatar from "@/components/TransactionAvatar";
// ─── Donut Chart Component ───────────────────────────────────────────────────
function DonutChart({
  segments,
  size = 130,
  stroke = 15,
  centerAmount = "$0.00",
  centerSubtitle = "This Month",
}: {
  segments: { value: number; color: string }[];
  size?: number;
  stroke?: number;
  centerAmount?: string;
  centerSubtitle?: string;
}) {
  const colors = useColors();
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + Math.max(seg.value, 0), 0);
  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${cx},${cx}`}>
          {total <= 0 ? (
            <Circle
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={colors.border}
              strokeWidth={stroke}
            />
          ) : (
            segments.map((seg, i) => {
              if (seg.value <= 0) return null;
              const fraction = seg.value / total;
              const dash = fraction * circ;
              const gap = circ - dash;
              const currentOffset = offset;
              offset += dash;

              return (
                <Circle
                  key={i}
                  cx={cx}
                  cy={cx}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="butt"
                />
              );
            })
          )}
        </G>
      </Svg>
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
        ]}
        pointerEvents="none"
      >
        <Text
          style={{
            fontSize: centerAmount.length > 9 ? 12 : 13.5,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
            letterSpacing: -0.2,
            textAlign: "center",
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {centerAmount}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            marginTop: 2,
          }}
        >
          {centerSubtitle}
        </Text>
      </View>
    </View>
  );
}

// ─── Category Color Helper ────────────────────────────────────────────────────
function getCategoryColor(categoryName: string, colors: any): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes("shop") || lower.includes("store") || lower.includes("clothing")) {
    return "#6366F1"; // Indigo (matching mockup Shopping)
  }
  if (lower.includes("transport") || lower.includes("auto") || lower.includes("ride") || lower.includes("gas") || lower.includes("car")) {
    return "#8B5CF6"; // Lavender / Violet (matching mockup Transport)
  }
  if (lower.includes("food") || lower.includes("dining") || lower.includes("restaurant") || lower.includes("cafe")) {
    return "#F43F5E"; // Coral / Rose / Pink (matching mockup Food)
  }
  if (lower.includes("entertain") || lower.includes("movie") || lower.includes("stream") || lower.includes("subscrip")) {
    return "#F59E0B"; // Amber / Orange (matching mockup Entertainment)
  }
  if (lower.includes("grocer") || lower.includes("market")) {
    return "#10B981"; // Emerald
  }
  if (lower.includes("utilit") || lower.includes("bill")) {
    return "#06B6D4"; // Cyan
  }
  return colors.catOthers || "#8B5CF6";
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
    refreshAllAccountsAndTransactions,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncSummaryResult | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [relinkTarget, setRelinkTarget] = useState<{ itemId: string; bankName: string } | null>(null);

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
    try {
      const res = await refreshAllAccountsAndTransactions();
      setSyncResult(res);
      setShowSyncModal(true);
      if (res.needsAttention) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      Alert.alert(
        "Sync Error",
        err?.message || "Failed to refresh transactions. Please check your network connection."
      );
    } finally {
      setRefreshing(false);
    }
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
        rawTitle: t.title,
        merchant: t.merchant,
        type: t.type,
        title: formatTxCleanTitle(t.title, t.merchant),
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
          {/* Search Icon */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/search");
            }}
            hitSlop={8}
            accessibilityLabel="Search transactions"
          >
            <Feather name="search" size={19} color={colors.foreground} />
          </TouchableOpacity>

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
        {/* ── 0. Total Net Worth Hero Widget (Polished Matte Obsidian) ── */}
        <View style={styles.heroCardContainer}>
          <ExpoLinearGradient
            colors={
              colorScheme === "dark"
                ? ["#1F2430", "#151820", "#0D0F14"]
                : ["#1E2533", "#151B25", "#0C1017"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCardGradient}
          >
            {/* Subtle top edge specular highlight line */}
            <View style={styles.heroCardSheenLine} />

            {/* Header: Label + Status Dot + Quick Controls */}
            <View style={styles.heroHeaderRow}>
              <View style={styles.heroPillBadge}>
                <View style={styles.heroPillDot} />
                <Text style={styles.heroPillText}>TOTAL NET WORTH</Text>
              </View>

              <View style={styles.heroActionGroup}>
                {/* Refresh/Sync button */}
                <TouchableOpacity
                  style={styles.heroActionBtn}
                  onPress={handleRefresh}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Feather name="repeat" size={13} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>

                {/* Hide/Show Balance toggle */}
                <TouchableOpacity
                  style={styles.heroActionBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setHideBalance(!hideBalance);
                  }}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={hideBalance ? "eye-off" : "eye"}
                    size={13}
                    color="rgba(255,255,255,0.85)"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Main Balance Display */}
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurrencySymbol}>$</Text>
              <Text style={styles.heroMainAmountText}>
                {hideBalance
                  ? "••••••••"
                  : Math.abs(Math.round(totalBalance)).toLocaleString("en-US")}
              </Text>
              {!hideBalance && (
                <Text style={styles.heroDecimalText}>
                  .{(Math.abs(totalBalance) % 1).toFixed(2).slice(2)}
                </Text>
              )}
            </View>

            {/* Comparison vs Last Month Footer */}
            <View style={styles.heroFooterRow}>
              <View
                style={[
                  styles.heroTrendCapsule,
                  {
                    backgroundColor:
                      netChange >= 0
                        ? "rgba(52, 211, 153, 0.16)"
                        : "rgba(248, 113, 113, 0.16)",
                    borderColor:
                      netChange >= 0
                        ? "rgba(52, 211, 153, 0.28)"
                        : "rgba(248, 113, 113, 0.28)",
                  },
                ]}
              >
                <Feather
                  name={netChange >= 0 ? "trending-up" : "trending-down"}
                  size={12}
                  color={netChange >= 0 ? "#34D399" : "#F87171"}
                />
                <Text
                  style={[
                    styles.heroTrendPctText,
                    { color: netChange >= 0 ? "#34D399" : "#F87171" },
                  ]}
                >
                  {netChange >= 0 ? "+" : ""}
                  {balancePctChange.toFixed(1)}%
                </Text>
                <Text style={styles.heroTrendLabel}>vs last month</Text>
              </View>

              <View style={styles.heroDeltaPill}>
                <Text style={styles.heroDeltaText}>
                  {netChange >= 0 ? "+" : "-"}$
                  {Math.abs(netChange).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
            </View>
          </ExpoLinearGradient>
        </View>

        {/* ── Quick Actions Row (4 Matte Squircles) ── */}
        <View style={styles.quickActionsBar}>
          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => router.push("/transactions")}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionSquircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="plus" size={19} color={colors.primary} />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Add Tx</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => router.push("/insights")}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionSquircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="pie-chart" size={18} color="#818CF8" />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => router.push("/bills")}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionSquircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="calendar" size={18} color="#F59E0B" />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Bills</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => router.push("/accounts")}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionSquircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="credit-card" size={18} color="#10B981" />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Accounts</Text>
          </TouchableOpacity>
        </View>

        {/* ── 1. Top Financial Overview Widget (Income & Expense Split) ── */}
        <View style={styles.statsSplitRow}>
          {/* Income Card */}
          <View
            style={[
              styles.statMatteTile,
              {
                backgroundColor: colors.incomeBg,
                borderColor: colors.income + "28",
              },
            ]}
          >
            <View style={styles.statTileHeader}>
              <View
                style={[
                  styles.statMicroPill,
                  { backgroundColor: colors.income + "20" },
                ]}
              >
                <Feather name="arrow-up-right" size={11} color={colors.income} />
                <Text style={[styles.statMicroPillText, { color: colors.income }]}>Income</Text>
              </View>
              <View style={styles.statMicroTrendRow}>
                <Text style={[styles.statMicroTrendText, { color: colors.income }]}>+8%</Text>
              </View>
            </View>

            <Text style={[styles.statAmountMain, { color: colors.foreground }]}>
              ${Math.abs(currentMonthIncome).toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </Text>
            <Text style={[styles.statPeriodLabel, { color: colors.mutedForeground }]}>
              This month
            </Text>
          </View>

          {/* Expense Card */}
          <View
            style={[
              styles.statMatteTile,
              {
                backgroundColor: colors.expenseBg,
                borderColor: colors.expense + "28",
              },
            ]}
          >
            <View style={styles.statTileHeader}>
              <View
                style={[
                  styles.statMicroPill,
                  { backgroundColor: colors.expense + "20" },
                ]}
              >
                <Feather name="arrow-down-left" size={11} color={colors.expense} />
                <Text style={[styles.statMicroPillText, { color: colors.expense }]}>Expenses</Text>
              </View>
              <View style={styles.statMicroTrendRow}>
                <Text style={[styles.statMicroTrendText, { color: colors.expense }]}>-12%</Text>
              </View>
            </View>

            <Text style={[styles.statAmountMain, { color: colors.foreground }]}>
              -${Math.abs(currentMonthExpenses).toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </Text>
            <Text style={[styles.statPeriodLabel, { color: colors.mutedForeground }]}>
              This month
            </Text>
          </View>
        </View>

        {/* ── 2. Spending Overview Widget ── */}
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Spending Overview</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/transactions", params: { tab: "SPENDING" } });
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              hitSlop={10}
            >
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.donutRow}>
            {/* Donut Chart */}
            <DonutChart
              segments={categoryBreakdown.map((c) => ({ value: c.amount, color: c.color }))}
              size={130}
              stroke={15}
              centerAmount={`$${Math.abs(currentMonthExpenses).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              centerSubtitle="This Month"
            />

            {/* Category Legend List */}
            <View style={styles.legendList}>
              {categoryBreakdown.length === 0 ? (
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  No expenses this month
                </Text>
              ) : (
                categoryBreakdown.map((item, idx) => (
                  <View key={idx} style={styles.legendItemRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.legendName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={[styles.legendPct, { color: colors.foreground }]}>
                      {item.pct}%
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        {/* ── 3. Recent Transactions Widget ── */}
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.sectionIconBadge, { backgroundColor: "#818CF818" }]}>
                <Feather name="activity" size={14} color="#818CF8" />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent transactions</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/transactions")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} hitSlop={8}>
              <Text style={[styles.sectionLink, { color: colors.mutedForeground }]}>View all</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.insetCardList}>
            {recentTransactionsList.map((item, idx) => (
              <React.Fragment key={item.id}>
                {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
                <View style={styles.listRow}>
                  <TransactionAvatar
                    title={item.rawTitle || item.title}
                    merchant={item.merchant}
                    category={item.category}
                    type={item.type}
                    size={42}
                    iconSize={20}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{item.subtitle}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.rowAmount, { color: colors.foreground }]}>{item.amount}</Text>
                    <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>{item.date}</Text>
                  </View>
                </View>
              </React.Fragment>
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.sectionIconBadge, { backgroundColor: "#F59E0B18" }]}>
                <Feather name="calendar" size={14} color="#F59E0B" />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming bills</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/bills")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} hitSlop={8}>
              <Text style={[styles.sectionLink, { color: colors.mutedForeground }]}>View all</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.insetCardList}>
            {upcomingBillsList.map((item, idx) => (
              <React.Fragment key={item.id}>
                {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
                <View style={styles.listRow}>
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: item.title.toLowerCase().includes("netflix") ? "#E509141F" : "#1A56DB1F",
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
                    <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{item.category}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.rowAmount, { color: colors.foreground }]}>{item.amount}</Text>
                    <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>{item.dueDate}</Text>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── 5. Financial Health / Motivation Banner Widget ── */}
        <View style={[styles.bannerCard, { backgroundColor: colors.incomeBg, borderColor: colors.income + "25" }]}>
          <View style={[styles.bannerIconBadge, { backgroundColor: colors.income + "20" }]}>
            <Feather name="shield" size={18} color={colors.income} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>Financial Health: On Track 🎉</Text>
            <Text style={[styles.bannerSubtitle, { color: colors.mutedForeground }]}>
              All upcoming bills and transactions are balanced.
            </Text>
          </View>
          <CatBannerIllustration size={44} />
        </View>
      </ScrollView>

      <SyncStatusModal
        visible={showSyncModal}
        result={syncResult}
        onClose={() => setShowSyncModal(false)}
        onReconnect={(itemId, bankName) => {
          setRelinkTarget({ itemId, bankName });
        }}
      />

      {relinkTarget && (
        <PlaidLinkModal
          onClose={() => {
            const item = relinkTarget;
            setRelinkTarget(null);
            if (item?.itemId) {
              refreshAllAccountsAndTransactions()
                .then((res) => {
                  setSyncResult(res);
                  setShowSyncModal(true);
                })
                .catch(() => {});
            }
          }}
          relinkItemId={relinkTarget.itemId}
          relinkBankName={relinkTarget.bankName}
        />
      )}
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
  // ── Hero Card (Matte Obsidian) ──
  heroCardContainer: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  heroCardGradient: {
    padding: 20,
    position: "relative",
  },
  heroCardSheenLine: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  heroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroPillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  heroPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34D399",
  },
  heroPillText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    color: "rgba(255, 255, 255, 0.85)",
  },
  heroActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginVertical: 14,
  },
  heroCurrencySymbol: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255, 255, 255, 0.7)",
    marginRight: 2,
  },
  heroMainAmountText: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.8,
  },
  heroDecimalText: {
    fontSize: 20,
    fontFamily: "Inter_500Medium",
    color: "rgba(255, 255, 255, 0.65)",
  },
  heroFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  heroTrendCapsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroTrendPctText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  heroTrendLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.7)",
  },
  heroDeltaPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  heroDeltaText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },

  // ── Quick Actions Bar ──
  quickActionsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
    marginTop: 2,
    marginBottom: 2,
  },
  quickActionItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  quickActionSquircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  quickActionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Financial Overview (Income vs Expense) ──
  statsSplitRow: {
    flexDirection: "row",
    gap: 12,
  },
  statMatteTile: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    gap: 5,
  },
  statTileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statMicroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statMicroPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  statMicroTrendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statMicroTrendText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  statAmountMain: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
    letterSpacing: -0.3,
  },
  statPeriodLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },

  // ── Widgets & Inset Cards ──
  widgetCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  sectionLink: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  donutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 6,
  },
  legendList: {
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  legendItemRow: {
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
    letterSpacing: -0.1,
  },
  legendPct: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },

  // ── List & Rows ──
  insetCardList: {
    gap: 0,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
    marginVertical: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
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
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  // ── Banner Card ──
  bannerCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 15,
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
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  bannerSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  // ── Review Match Card ──
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

