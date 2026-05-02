import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AddTransactionModal from "@/components/AddTransactionModal";
import { useApp } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

// ─── Section card wrapper ─────────────────────────────────────────────────────
function SectionCard({
  title,
  onChevron,
  children,
}: {
  title: string;
  onChevron?: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[sc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={sc.header}>
        <Text style={[sc.title, { color: colors.foreground }]}>{title}</Text>
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
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
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

// ─── Tip data ─────────────────────────────────────────────────────────────────
const TIPS = [
  { title: "What Financial Minimalism can Look Like", date: "Apr 21", tag: "Finances" },
  { title: "How to Build a 3-Month Emergency Fund", date: "Apr 18", tag: "Savings" },
  { title: "The 50/30/20 Rule Explained", date: "Apr 14", tag: "Budgeting" },
];

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { openDrawer } = useDrawer();
  const {
    accounts,
    transactions,
    bills,
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    emailSync,
    isSyncing,
    syncEmailTransactions,
  } = useApp();

  const [showAddTx, setShowAddTx] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleRefresh = async () => {
    setRefreshing(true);
    if (emailSync.isConnected) await syncEmailTransactions();
    setRefreshing(false);
  };

  // Derived data
  const cashAccounts = accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const creditAccounts = accounts.filter((a) => a.type === "credit");
  const cashTotal = cashAccounts.reduce((s, a) => s + a.balance, 0);
  const creditTotal = creditAccounts.reduce((s, a) => s + a.balance, 0); // negative

  const upcomingBills = useMemo(
    () =>
      bills
        .filter((b) => !b.isPaid)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 3),
    [bills]
  );

  // Top expense categories
  const topCategories = useMemo(() => {
    const now = new Date();
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

  // Cash flow
  const netFlow = monthlyIncome - monthlyExpense;
  const flowPct = monthlyIncome > 0 ? ((netFlow / monthlyIncome) * 100) : 0;

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100, paddingTop: topPad + 12 },
        ]}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={[styles.hamburgerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }}
              hitSlop={8}
            >
              <Feather name="menu" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <View>
              <Text style={[styles.greeting, { color: colors.mutedForeground }]}>{greeting}</Text>
              <Text style={[styles.pageTitle, { color: colors.foreground }]}>My Finances</Text>
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
              style={[styles.iconBtn, { backgroundColor: colors.primary }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAddTx(true); }}
            >
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Net Worth banner ── */}
        <View style={[styles.netBanner, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.netLabel}>Net Worth</Text>
            <Text style={styles.netAmount}>
              ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          <View style={styles.acctRow}>
            {/* Cash */}
            <View style={styles.acctCol}>
              <View style={[styles.acctIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="dollar-sign" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.acctType, { color: colors.mutedForeground }]}>Cash</Text>
              <Text style={[styles.acctAmt, { color: colors.foreground }]}>
                ${cashTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
              <ChangeBadge pct={0} />
            </View>
            <View style={[styles.acctDivider, { backgroundColor: colors.border }]} />
            {/* Credit */}
            <View style={styles.acctCol}>
              <View style={[styles.acctIconWrap, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="credit-card" size={18} color="#f59e0b" />
              </View>
              <Text style={[styles.acctType, { color: colors.mutedForeground }]}>Credit</Text>
              <Text style={[styles.acctAmt, { color: colors.foreground }]}>
                ${Math.abs(creditTotal).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
              <ChangeBadge pct={0} />
            </View>
          </View>
          <Dots count={2} active={0} />
        </SectionCard>

        {/* ── Bills ── */}
        <SectionCard title="Bills" onChevron={() => router.push("/(tabs)/bills")}>
          {upcomingBills.length === 0 ? (
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
            <View style={{ gap: 10 }}>
              {upcomingBills.map((b) => {
                const dueDate = new Date(b.dueDate);
                const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
                const isOverdue = daysLeft < 0;
                const isSoon = daysLeft >= 0 && daysLeft <= 3;
                return (
                  <View key={b.id} style={[styles.billRow, { borderColor: colors.border }]}>
                    <View style={[styles.billDot, { backgroundColor: isOverdue ? colors.expense : isSoon ? "#f59e0b" : colors.success }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.billTitle, { color: colors.foreground }]}>{b.title}</Text>
                      <Text style={[styles.billDue, { color: isOverdue ? colors.expense : colors.mutedForeground }]}>
                        {isOverdue ? `Overdue by ${Math.abs(daysLeft)}d` : daysLeft === 0 ? "Due today" : `Due in ${daysLeft}d`}
                      </Text>
                    </View>
                    <Text style={[styles.billAmt, { color: colors.foreground }]}>
                      ${b.amount.toFixed(2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <Dots count={2} active={0} />
        </SectionCard>

        {/* ── Top Expenses ── */}
        <SectionCard title="Top Expenses" onChevron={() => router.push("/(tabs)/transactions")}>
          {topCategories.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "#f59e0b18" }]}>
                <Feather name="shopping-bag" size={28} color="#f59e0b" />
              </View>
              <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
                Tap to start adding your expenses.
              </Text>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAddTx(true); }}>
                <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Expense</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {topCategories.map(([cat, amt]) => {
                const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
                return (
                  <View key={cat} style={{ gap: 5 }}>
                    <View style={styles.expenseRow}>
                      <View style={[styles.catDot, { backgroundColor: color }]} />
                      <Text style={[styles.catName, { color: colors.foreground }]}>{cat}</Text>
                      <Text style={[styles.catAmt, { color: colors.foreground }]}>${amt.toFixed(2)}</Text>
                      <Text style={[styles.catPct, { color: colors.mutedForeground }]}>{pct.toFixed(0)}%</Text>
                    </View>
                    <ProgressBar pct={pct} color={color} />
                  </View>
                );
              })}
            </View>
          )}
          <Dots count={2} active={0} />
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

        {/* ── Goals (placeholder – expandable later) ── */}
        <SectionCard title="Goals">
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: "#6366f118" }]}>
              <Feather name="target" size={28} color="#6366f1" />
            </View>
            <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
              Set savings goals to track your progress.
            </Text>
            <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Goal</Text>
          </View>
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

      <AddTransactionModal visible={showAddTx} onClose={() => setShowAddTx(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 14, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  hamburgerBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  greeting: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pageTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
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
  acctRow: { flexDirection: "row", alignItems: "center" },
  acctCol: { flex: 1, alignItems: "center", gap: 6 },
  acctIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  acctType: { fontSize: 12, fontFamily: "Inter_500Medium" },
  acctAmt: { fontSize: 20, fontFamily: "Inter_700Bold" },
  acctDivider: { width: 1, height: 80, marginHorizontal: 8 },
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
  expenseRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  catAmt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  catPct: { fontSize: 12, fontFamily: "Inter_400Regular", width: 34, textAlign: "right" },
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
});
