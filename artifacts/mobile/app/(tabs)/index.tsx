import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
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
import { useColors } from "@/hooks/useColors";

// ─── Section card wrapper ─────────────────────────────────────────────────────
function SectionCard({
  title,
  subtitle,
  onChevron,
  children,
}: {
  title: string;
  subtitle?: string;
  onChevron?: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[sc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={sc.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[sc.title, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? <Text style={[sc.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity onPress={onChevron} hitSlop={8}>
          <Feather name="chevron-right" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
});

// ─── Pagination dots ──────────────────────────────────────────────────────────
function Dots({ count, active }: { count: number; active: number }) {
  const colors = useColors();
  return (
    <View style={dot.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            dot.dot,
            {
              backgroundColor: i === active ? colors.primary : colors.border,
              width: i === active ? 14 : 6,
            },
          ]}
        />
      ))}
    </View>
  );
}
const dot = StyleSheet.create({
  row: { flexDirection: "row", gap: 4, justifyContent: "center", marginTop: 14 },
  dot: { height: 6, borderRadius: 3 },
});

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const colors = useColors();
  return (
    <View style={[pb.track, { backgroundColor: colors.muted }]}>
      <View
        style={[
          pb.fill,
          { width: `${Math.min(Math.max(pct, 0), 100)}%` as any, backgroundColor: color },
        ]}
      />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
});

// ─── Change badge ─────────────────────────────────────────────────────────────
function ChangeBadge({ pct }: { pct: number }) {
  const colors = useColors();
  const isUp = pct >= 0;
  return (
    <View
      style={[
        badge.wrap,
        { backgroundColor: isUp ? colors.success + "18" : colors.expense + "18" },
      ]}
    >
      <Feather
        name={isUp ? "arrow-up" : "arrow-down"}
        size={10}
        color={isUp ? colors.success : colors.expense}
      />
      <Text
        style={[
          badge.text,
          { color: isUp ? colors.success : colors.expense },
        ]}
      >
        {Math.abs(pct).toFixed(1)}%
      </Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

// ─── Mini Donut Chart ─────────────────────────────────────────────────────────
function DonutChart({ segments, size = 90, stroke = 14 }: {
  segments: { value: number; color: string }[];
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation="-90" origin={`${cx},${cx}`}>
        {total === 0
          ? <Circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          : segments.map((seg, i) => {
              const dash = (seg.value / total) * circ;
              const gap = circ - dash;
              const el = (
                <Circle
                  key={i}
                  cx={cx} cy={cx} r={r}
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
        }
      </G>
    </Svg>
  );
}

// ─── Tip data ─────────────────────────────────────────────────────────────────
const TIPS = [
  { title: "What Financial Minimalism can Look Like", date: "Apr 21", tag: "Finances" },
  { title: "How to Build a 3-Month Emergency Fund", date: "Apr 18", tag: "Savings" },
  { title: "The 50/30/20 Rule Explained", date: "Apr 14", tag: "Budgeting" },
];

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const colors = useColors();
  const { openDrawer } = useDrawer();
  const {
    accounts,
    transactions,
    bills,
    tasks,
    budgets,
    goals,
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    emailSync,
    isSyncing,
    syncEmailTransactions,
    userName,
  } = useApp();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const now  = new Date();
  const now2 = now.getTime();

  const handleRefresh = async () => {
    setRefreshing(true);
    if (emailSync.isConnected) await syncEmailTransactions();
    setRefreshing(false);
  };

  // Search results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return transactions
      .filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.merchant || "").toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.note || "").toLowerCase().includes(q) ||
        t.amount.toFixed(2).includes(q)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);
  }, [searchQuery, transactions]);

  // Derived data
  const accountGroups = useMemo(() => {
    const meta: Record<string, { label: string; icon: string; color: string; total: number; count: number; order: number }> = {};
    const getGroup = (account: typeof accounts[number]) => {
      const text = `${account.name} ${account.bank}`.toLowerCase();
      if (text.includes("mortgage")) return { label: "Mortgage", icon: "home", color: "#ef4444", order: 4 };
      if (text.includes("loan") || text.includes("lending") || text.includes("borrow")) return { label: "Loan", icon: "arrow-down-right", color: "#f97316", order: 5 };
      if (account.type === "checking") return { label: "Chequing", icon: "layers", color: colors.primary, order: 1 };
      if (account.type === "savings") return { label: "Savings", icon: "shield", color: "#22c55e", order: 2 };
      if (account.type === "credit") return { label: "Credit", icon: "credit-card", color: "#f59e0b", order: 3 };
      return { label: "Investment", icon: "trending-up", color: "#8b5cf6", order: 6 };
    };

    accounts.forEach((account) => {
      const group = getGroup(account);
      if (!meta[group.label]) meta[group.label] = { ...group, total: 0, count: 0 };
      meta[group.label].total += computeBalance(account, transactions);
      meta[group.label].count += 1;
    });

    return Object.values(meta).sort((a, b) => a.order - b.order);
  }, [accounts, transactions, colors.primary]);

  // Bills derived
  const overdueBills  = useMemo(() => bills.filter(b => !b.isPaid && new Date(b.dueDate).getTime() < now2), [bills, now2]);
  const pendingBills  = useMemo(() => bills.filter(b => !b.isPaid && new Date(b.dueDate).getTime() >= now2), [bills, now2]);
  const paidBills     = useMemo(() => bills.filter(b => b.isPaid), [bills]);
  const overdueTotal  = useMemo(() => overdueBills.reduce((s, b) => s + b.amount, 0), [overdueBills]);
  const upcomingTotal = useMemo(() => pendingBills.reduce((s, b) => s + b.amount, 0), [pendingBills]);
  const paidTotal     = useMemo(() => paidBills.reduce((s, b) => s + b.amount, 0), [paidBills]);

  // Alerts derived
  const alertItems = useMemo(() => {
    const items: { text: string; sub: string; color: string }[] = [];
    if (overdueBills.length > 0)
      items.push({ text: `${overdueBills.length} overdue bill${overdueBills.length > 1 ? "s" : ""}`, sub: "Tap to view", color: "#ef4444" });
    pendingBills.slice(0, 3).forEach(b => {
      const days = Math.ceil((new Date(b.dueDate).getTime() - now2) / 86400000);
      const label = days === 0 ? "Due today" : days <= 3 ? `Due in ${days}d` : new Date(b.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      items.push({ text: `Upcoming: ${b.title}`, sub: label, color: days <= 3 ? "#f59e0b" : "#22c55e" });
    });
    return items.slice(0, 4);
  }, [overdueBills, pendingBills, now2]);

  const upcomingBills = useMemo(
    () =>
      bills
        .filter((b) => !b.isPaid)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 3),
    [bills]
  );

  const upcomingTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.isCompleted)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 3),
    [tasks]
  );

  // Budget derived — compute spent per budget from transactions this period
  const budgetItems = useMemo(() => {
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const wStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const yStart = new Date(now.getFullYear(), 0, 1).toISOString();
    return budgets.map(b => {
      const since = b.period === "monthly" ? mStart : b.period === "weekly" ? wStart : yStart;
      const spent = transactions
        .filter(t => t.type === "expense" && t.date >= since && (!b.category || t.category === b.category))
        .reduce((s, t) => s + t.amount, 0);
      const pct = b.amount > 0 ? Math.min((spent / b.amount) * 100, 100) : 0;
      const overBudget = spent > b.amount;
      return { ...b, spent, pct, overBudget };
    }).slice(0, 3);
  }, [budgets, transactions]);

  // Goals derived
  const goalItems = useMemo(() => goals.slice(0, 3).map(g => {
    const pct = g.targetAmount > 0 ? Math.min((g.currentAmount / g.targetAmount) * 100, 100) : 0;
    const daysLeft = g.targetDate ? Math.ceil((new Date(g.targetDate).getTime() - now2) / 86400000) : null;
    const isBehind = daysLeft !== null && daysLeft < 30 && pct < 80;
    return { ...g, pct, daysLeft, isBehind };
  }), [goals, now2]);

  // Top expense categories
  const topCategories = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "expense" && t.date >= monthStart)
      .forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [transactions]);

  const totalExpenses = topCategories.reduce((s, [, v]) => s + v, 0);

  const lastMonthExpenses = useMemo(() => {
    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lmEnd   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return transactions
      .filter(t => t.type === "expense" && t.date >= lmStart && t.date < lmEnd)
      .reduce((s, t) => s + t.amount, 0);
  }, [transactions]);

  const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleString("default", { month: "short" });
  const expenseDiff = lastMonthExpenses - totalExpenses;

  // Cash flow
  const netFlow = monthlyIncome - monthlyExpense;
  const flowPct = monthlyIncome > 0 ? ((netFlow / monthlyIncome) * 100) : 0;

  const greetingBase =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const greeting = userName ? `${greetingBase}, ${userName}` : greetingBase;
  const monthName = now.toLocaleString("default", { month: "long" });

  const CATEGORY_COLORS: Record<string, string> = {
    Food: "#f59e0b",
    Groceries: "#10b981",
    Shopping: "#6366f1",
    Transport: "#3b82f6",
    Entertainment: "#ec4899",
    Utilities: "#14b8a6",
    Health: "#ef4444",
    Housing: "#8b5cf6",
    Other: "#94a3b8",
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Fixed Header ── */}
      <View style={[styles.header, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 52 : 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.hamburgerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }}
            hitSlop={8}
          >
            <Feather name="menu" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>{greeting}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {emailSync.isConnected && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); syncEmailTransactions(); }}
              disabled={isSyncing}
            >
              {isSyncing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="refresh-cw" size={16} color={colors.primary} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSearchQuery(""); setShowSearch(true); }}
          >
            <Feather name="search" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100, paddingTop: 12 },
        ]}
      >
        {/* ── Net Worth banner ── */}
        <View style={[styles.netBanner, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.netLabel}>Net Worth</Text>
            <Text style={styles.netAmount}>
              {totalBalance < 0 ? "-" : ""}${Math.abs(totalBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.netRight}>
            <Text style={styles.netSubLabel}>This month</Text>
            <Text style={[styles.netSub, { color: netFlow >= 0 ? "#6ee7b7" : "#fca5a5" }]}>
              {netFlow >= 0 ? "+" : ""}${Math.abs(netFlow).toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </Text>
          </View>
        </View>

        {/* ── Accounts ── */}
        <SectionCard title="Accounts" onChevron={() => router.push("/(tabs)/accounts")}>
          {accountGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="credit-card" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
                Add chequing, savings, credit,{"\n"}mortgage or loan accounts.
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/accounts")}>
                <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Account</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.acctGrid}>
              {accountGroups.map((group) => {
                const isLiability = group.label === "Credit" || group.label === "Mortgage" || group.label === "Loan";
                return (
                  <TouchableOpacity
                    key={group.label}
                    style={[styles.acctTile, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => router.push("/(tabs)/accounts")}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.acctIconWrap, { backgroundColor: group.color + "18" }]}>
                      <Feather name={group.icon as any} size={17} color={group.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.acctTitleRow}>
                        <Text style={[styles.acctType, { color: colors.mutedForeground }]}>{group.label}</Text>
                        <Text style={[styles.acctCount, { color: colors.mutedForeground }]}>
                          {group.count}
                        </Text>
                      </View>
                      <Text style={[styles.acctAmt, { color: isLiability ? colors.expense : colors.foreground }]}>
                        ${Math.abs(group.total).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </SectionCard>

        {/* ── Bills ── */}
        <SectionCard
          title={`Bills`}
          onChevron={() => router.push("/(tabs)/bills")}
          subtitle={monthName}
        >
          {bills.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="file-text" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
                Add recurring bills & subscriptions{"\n"}to get payment reminders.
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/bills")}>
                <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Bill</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.billsBody}>
              <DonutChart
                size={110}
                stroke={18}
                segments={[
                  { value: upcomingTotal, color: "#22c55e" },
                  { value: overdueTotal,  color: "#ef4444" },
                  { value: paidTotal,     color: colors.primary },
                ]}
              />
              <View style={styles.billsLegend}>
                <View style={styles.billsLegendRow}>
                  <View style={[styles.billsLegendDot, { backgroundColor: "#22c55e" }]} />
                  <View>
                    <Text style={[styles.billsLegendLabel, { color: colors.mutedForeground }]}>Upcoming</Text>
                    <Text style={[styles.billsLegendAmt, { color: colors.foreground }]}>${upcomingTotal.toFixed(0)}</Text>
                  </View>
                </View>
                <View style={styles.billsLegendRow}>
                  <View style={[styles.billsLegendDot, { backgroundColor: "#ef4444" }]} />
                  <View>
                    <Text style={[styles.billsLegendLabel, { color: colors.mutedForeground }]}>Overdue</Text>
                    <Text style={[styles.billsLegendAmt, { color: overdueTotal > 0 ? colors.expense : colors.foreground }]}>${overdueTotal.toFixed(0)}</Text>
                  </View>
                </View>
                <View style={styles.billsLegendRow}>
                  <View style={[styles.billsLegendDot, { backgroundColor: colors.primary }]} />
                  <View>
                    <Text style={[styles.billsLegendLabel, { color: colors.mutedForeground }]}>Paid</Text>
                    <Text style={[styles.billsLegendAmt, { color: colors.foreground }]}>${paidTotal.toFixed(0)}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
          {overdueBills.length > 0 && (
            <Text style={[styles.billsAlert, { color: colors.expense }]}>
              You missed {overdueBills[0].title}{overdueBills.length > 1 ? ` and ${overdueBills.length - 1} more bill${overdueBills.length > 2 ? "s" : ""}` : ""}
            </Text>
          )}
          <Dots count={2} active={0} />
        </SectionCard>

        {/* ── Alerts ── */}
        {alertItems.length > 0 && (
          <SectionCard title="Alerts" onChevron={() => router.push("/(tabs)/bills")}>
            <View style={{ gap: 2 }}>
              {alertItems.map((item, i) => (
                <View key={i} style={[styles.alertRow, i < alertItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={[styles.alertDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.alertText, { color: colors.foreground }]} numberOfLines={1}>{item.text}</Text>
                  <Text style={[styles.alertSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
                </View>
              ))}
            </View>
          </SectionCard>
        )}

        {/* ── Top Expenses ── */}
        <SectionCard title="Top Expenses" subtitle={`| ${monthName}`} onChevron={() => router.push("/(tabs)/transactions")}>
          {topCategories.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="shopping-bag" size={28} color="#f59e0b" />
              </View>
              <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
                Tap to start adding your expenses.
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/transactions")}>
                <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Expense</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.expenseBody}>
                {/* Donut + total */}
                <View style={styles.expenseDonutWrap}>
                  <DonutChart
                    size={130}
                    stroke={22}
                    segments={topCategories.map(([cat, amt]) => ({
                      value: amt,
                      color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other,
                    }))}
                  />
                  <Text style={[styles.expenseDonutAmt, { color: colors.foreground }]}>
                    ${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </Text>
                </View>
                {/* Category list */}
                <View style={styles.expenseCatList}>
                  {topCategories.map(([cat, amt]) => {
                    const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
                    return (
                      <View key={cat} style={styles.expenseRow}>
                        <View style={[styles.catIconBg, { backgroundColor: color + "22" }]}>
                          <Feather name="tag" size={11} color={color} />
                        </View>
                        <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>{cat}</Text>
                        <Text style={[styles.catAmt, { color: colors.foreground }]}>${amt.toFixed(0)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {/* Insight line */}
              {lastMonthExpenses > 0 && (
                <Text style={[styles.expenseInsight, { color: expenseDiff >= 0 ? colors.success : colors.expense }]}>
                  {expenseDiff >= 0
                    ? `You're spending $${expenseDiff.toFixed(1)} less than ${lastMonthName}`
                    : `You're spending $${Math.abs(expenseDiff).toFixed(1)} more than ${lastMonthName}`}
                </Text>
              )}
            </>
          )}
          <Dots count={2} active={0} />
        </SectionCard>

        {/* ── Budget ── */}
        <SectionCard title="Budget" onChevron={() => router.push("/(tabs)/budget")}>
          {budgetItems.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "#6366f118" }]}>
                <Feather name="sliders" size={28} color="#6366f1" />
              </View>
              <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
                Create budgets to keep your{"\n"}spending on track.
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/budget")}>
                <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Budget</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {budgetItems.map((b) => (
                <View key={b.id} style={{ gap: 6 }}>
                  <View style={styles.budgetRow}>
                    <View style={[styles.budgetIcon, { backgroundColor: (b.color || "#6366f1") + "18" }]}>
                      <Feather name="layers" size={13} color={b.color || "#6366f1"} />
                    </View>
                    <Text style={[styles.budgetName, { color: colors.foreground }]} numberOfLines={1}>{b.name}</Text>
                    <Text style={[styles.budgetAmt, { color: colors.foreground }]}>${b.amount.toFixed(0)}</Text>
                  </View>
                  <ProgressBar pct={b.pct} color={b.overBudget ? colors.expense : (b.color || "#22c55e")} />
                  <View style={styles.budgetMeta}>
                    <Text style={[styles.budgetSpent, { color: colors.mutedForeground }]}>
                      Spent ${b.spent.toFixed(0)} of ${b.amount.toFixed(0)}  ·  {b.pct.toFixed(1)}%
                    </Text>
                    <View style={[styles.budgetStatus, { backgroundColor: b.overBudget ? colors.expense + "18" : colors.success + "18" }]}>
                      <Text style={[styles.budgetStatusTxt, { color: b.overBudget ? colors.expense : colors.success }]}>
                        {b.overBudget ? "Over Budget" : "On Track"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        {/* ── Cash Flow ── */}
        <SectionCard title="Cash Flow" onChevron={() => router.push("/(tabs)/transactions")}>
          <View style={styles.flowRow}>
            <Text style={[styles.flowPeriod, { color: colors.foreground }]}>{monthName}</Text>
            <ChangeBadge pct={flowPct} />
            <Text style={[styles.flowAmt, { color: netFlow >= 0 ? colors.success : colors.expense }]}>
              {netFlow >= 0 ? "+" : "-"}${Math.abs(netFlow).toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </Text>
          </View>
          <View style={[styles.flowDivider, { backgroundColor: colors.border }]} />
          <View style={styles.flowSubRow}>
            <View style={styles.flowSubItem}>
              <View style={[styles.flowSubDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.flowSubLabel, { color: colors.mutedForeground }]}>Income</Text>
              <Text style={[styles.flowSubAmt, { color: colors.success }]}>
                +${monthlyIncome.toLocaleString("en-US", { minimumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={styles.flowSubItem}>
              <View style={[styles.flowSubDot, { backgroundColor: colors.expense }]} />
              <Text style={[styles.flowSubLabel, { color: colors.mutedForeground }]}>Spent</Text>
              <Text style={[styles.flowSubAmt, { color: colors.expense }]}>
                -${monthlyExpense.toLocaleString("en-US", { minimumFractionDigits: 0 })}
              </Text>
            </View>
          </View>
          <View style={[styles.flowProjected, { backgroundColor: colors.muted }]}>
            <Text style={[styles.flowProjectedText, { color: colors.mutedForeground }]}>
              Projected Balance  
              <Text style={{ color: netFlow >= 0 ? colors.success : colors.expense, fontFamily: "Inter_600SemiBold" }}>
                {"  "}{netFlow >= 0 ? "+" : "-"}${Math.abs(netFlow).toLocaleString("en-US", { minimumFractionDigits: 0 })}
              </Text>
            </Text>
          </View>
        </SectionCard>

        {/* ── Tasks ── */}
        <SectionCard title="Tasks" onChevron={() => router.push("/(tabs)/tasks")}>
          {upcomingTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="check-square" size={28} color="#f59e0b" />
              </View>
              <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
                Track subscriptions, reminders{"\n"}and important deadlines.
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/tasks")}>
                <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Task</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {upcomingTasks.map((t) => {
                const due      = new Date(t.dueDate);
                const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86400000);
                const isOver   = daysLeft < 0;
                const isSoon   = !isOver && daysLeft <= 3;
                const PRIORITY_COLORS: Record<string, string> = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
                const pColor   = PRIORITY_COLORS[t.priority] ?? "#94a3b8";
                return (
                  <View key={t.id} style={[styles.taskRow, { borderColor: colors.border }]}>
                    <View style={[styles.taskPriBadge, { backgroundColor: pColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={1}>{t.title}</Text>
                      <Text style={[styles.taskDue, { color: isOver ? colors.expense : isSoon ? "#f59e0b" : colors.mutedForeground }]}>
                        {isOver ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `Due in ${daysLeft}d`}
                      </Text>
                    </View>
                    <View style={[styles.taskCatBadge, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[styles.taskCatTxt, { color: colors.primary }]}>{t.category}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </SectionCard>

        {/* ── Goals ── */}
        <SectionCard title="Goals" onChevron={() => router.push("/(tabs)/budget")}>
          {goalItems.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="target" size={28} color="#f59e0b" />
              </View>
              <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
                Set savings goals to track{"\n"}your progress.
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/budget")}>
                <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Goal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {goalItems.map((g) => (
                <View key={g.id} style={{ gap: 6 }}>
                  <View style={styles.goalRow}>
                    <View style={[styles.goalIcon, { backgroundColor: (g.color || "#f59e0b") + "18" }]}>
                      <Feather name="target" size={13} color={g.color || "#f59e0b"} />
                    </View>
                    <Text style={[styles.goalName, { color: colors.foreground }]} numberOfLines={1}>{g.name}</Text>
                    <Text style={[styles.goalPct, { color: g.pct >= 80 ? colors.success : colors.expense }]}>
                      {g.pct.toFixed(1)}%
                    </Text>
                  </View>
                  <ProgressBar pct={g.pct} color={g.color || "#f59e0b"} />
                  <View style={styles.goalMeta}>
                    <Text style={[styles.goalSaved, { color: colors.mutedForeground }]}>
                      Saved ${g.currentAmount.toLocaleString("en-US", { minimumFractionDigits: 0 })} of ${g.targetAmount.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                    </Text>
                    {g.daysLeft !== null && (
                      <View style={[styles.goalStatus, { backgroundColor: g.isBehind ? colors.expense + "18" : colors.success + "18" }]}>
                        <Text style={[styles.goalStatusTxt, { color: g.isBehind ? colors.expense : colors.success }]}>
                          {g.isBehind ? "Behind" : "On Track"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
          <Dots count={2} active={0} />
        </SectionCard>

        {/* ── Money Tips ── */}
        <SectionCard title="Money Tips">
          {TIPS.slice(0, 2).map((tip, i) => (
            <View key={i} style={[styles.tipRow, i < TIPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={[styles.tipIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="book-open" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tipTitle, { color: colors.foreground }]} numberOfLines={2}>{tip.title}</Text>
                <Text style={[styles.tipMeta, { color: colors.mutedForeground }]}>{tip.date} · {tip.tag}</Text>
              </View>
            </View>
          ))}
        </SectionCard>

        {/* ── Monthly Reports ── */}
        <SectionCard title="Monthly Reports">
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.success + "18" }]}>
              <Feather name="bar-chart-2" size={28} color={colors.success} />
            </View>
            <TouchableOpacity
              style={[styles.downloadBtn, { borderColor: colors.primary }]}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Feather name="download" size={14} color={colors.primary} />
              <Text style={[styles.downloadText, { color: colors.primary }]}>↓ Download PDF Report</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

      </ScrollView>

      {/* ── Search Modal ── */}
      <Modal
        visible={showSearch}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearch(false)}
      >
        <SafeAreaView edges={["top", "bottom"]} style={[srch.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1 }}
        >
          {/* Search Header */}
          <View style={[srch.header, { borderBottomColor: colors.border }]}>
            <View style={[srch.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[srch.input, { color: colors.foreground }]}
                placeholder="Search transactions..."
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Feather name="x" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => setShowSearch(false)} hitSlop={8}>
              <Text style={[srch.cancel, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          {searchQuery.trim().length === 0 ? (
            <View style={srch.emptyWrap}>
              <Feather name="search" size={40} color={colors.border} />
              <Text style={[srch.emptyText, { color: colors.mutedForeground }]}>Search by name, category, amount…</Text>
            </View>
          ) : searchResults.length === 0 ? (
            <View style={srch.emptyWrap}>
              <Feather name="inbox" size={40} color={colors.border} />
              <Text style={[srch.emptyText, { color: colors.mutedForeground }]}>No transactions found</Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
              ItemSeparatorComponent={() => <View style={[srch.sep, { backgroundColor: colors.border }]} />}
              renderItem={({ item }) => {
                const isExp = item.type === "expense";
                const CATEGORY_COLORS: Record<string, string> = {
                  Food: "#f59e0b", Groceries: "#10b981", Shopping: "#6366f1",
                  Transport: "#3b82f6", Entertainment: "#ec4899", Utilities: "#14b8a6",
                  Health: "#ef4444", Housing: "#8b5cf6", Other: "#94a3b8",
                };
                const catColor = CATEGORY_COLORS[item.category] || "#94a3b8";
                return (
                  <TouchableOpacity
                    style={srch.resultRow}
                    activeOpacity={0.7}
                    onPress={() => { setShowSearch(false); router.push("/(tabs)/transactions"); }}
                  >
                    <View style={[srch.catDot, { backgroundColor: catColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[srch.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {item.merchant || item.title}
                      </Text>
                      <Text style={[srch.resultMeta, { color: colors.mutedForeground }]}>
                        {item.category}  ·  {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                    <Text style={[srch.resultAmt, { color: isExp ? colors.expense : colors.success }]}>
                      {isExp ? "-" : "+"}${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 14, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  hamburgerBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  greeting: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pageTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  iconBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  // Net banner
  netBanner: { borderRadius: 18, padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  netLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  netAmount: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginTop: 2 },
  netRight: { alignItems: "flex-end" },
  netSubLabel: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Inter_400Regular" },
  netSub: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  // Accounts
  acctGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  acctTile: { width: "48%", minHeight: 86, borderRadius: 14, borderWidth: 1, padding: 10, gap: 8 },
  acctIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  acctTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  acctType: { fontSize: 12, fontFamily: "Inter_500Medium" },
  acctCount: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  acctAmt: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  // Bills
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 8 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emptyMsg: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  emptyAction: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  billRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1 },
  billDot: { width: 8, height: 8, borderRadius: 4 },
  billTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  billDue: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  billAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },
  // Top expenses
  expenseBody:     { flexDirection: "row", alignItems: "center", gap: 16 },
  expenseDonutWrap:{ alignItems: "center", gap: 6 },
  expenseDonutAmt: { fontSize: 16, fontFamily: "Inter_700Bold" },
  expenseCatList:  { flex: 1, gap: 10 },
  expenseRow:      { flexDirection: "row", alignItems: "center", gap: 8 },
  catIconBg:       { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  catDot:          { width: 8, height: 8, borderRadius: 4 },
  catName:         { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  catAmt:          { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  catPct:          { fontSize: 12, fontFamily: "Inter_400Regular", width: 34, textAlign: "right" },
  expenseInsight:  { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center", marginTop: 12 },
  // Cash Flow
  flowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  flowPeriod: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  flowAmt: { fontSize: 16, fontFamily: "Inter_700Bold" },
  flowDivider: { height: 1, marginBottom: 10 },
  flowSubRow: { flexDirection: "row", gap: 0 },
  flowSubItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  flowSubDot: { width: 8, height: 8, borderRadius: 4 },
  flowSubLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  flowSubAmt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  flowProjected: { marginTop: 12, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  flowProjectedText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  // Tips
  tipRow: { flexDirection: "row", gap: 10, paddingVertical: 10, alignItems: "flex-start" },
  tipIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tipTitle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  tipMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  // Reports
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1.5 },
  downloadText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  // Tasks widget
  taskRow:      { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1 },
  taskPriBadge: { width: 4, height: 36, borderRadius: 2 },
  taskTitle:    { fontSize: 14, fontFamily: "Inter_500Medium" },
  taskDue:      { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  taskCatBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  taskCatTxt:   { fontSize: 11, fontFamily: "Inter_500Medium" },
  // Bills donut
  billsBody:        { flexDirection: "row", alignItems: "center", gap: 20 },
  billsLegend:      { flex: 1, gap: 10 },
  billsLegendRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  billsLegendDot:   { width: 10, height: 10, borderRadius: 5 },
  billsLegendLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  billsLegendAmt:   { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 1 },
  billsAlert:       { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 10, textAlign: "center" },
  // Alerts
  alertRow:  { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  alertDot:  { width: 8, height: 8, borderRadius: 4 },
  alertText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  alertSub:  { fontSize: 11, fontFamily: "Inter_400Regular" },
  // Budget
  budgetRow:       { flexDirection: "row", alignItems: "center", gap: 8 },
  budgetIcon:      { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  budgetName:      { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  budgetAmt:       { fontSize: 14, fontFamily: "Inter_700Bold" },
  budgetMeta:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  budgetSpent:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  budgetStatus:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  budgetStatusTxt: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  // Goals
  goalRow:       { flexDirection: "row", alignItems: "center", gap: 8 },
  goalIcon:      { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  goalName:      { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  goalPct:       { fontSize: 13, fontFamily: "Inter_700Bold" },
  goalMeta:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalSaved:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  goalStatus:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  goalStatusTxt: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

const srch = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1 },
  inputWrap:   { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  input:       { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  cancel:      { fontSize: 15, fontFamily: "Inter_500Medium" },
  emptyWrap:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 80 },
  emptyText:   { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  sep:         { height: 1 },
  resultRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  catDot:      { width: 10, height: 10, borderRadius: 5 },
  resultTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resultMeta:  { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultAmt:   { fontSize: 15, fontFamily: "Inter_700Bold" },
});
