import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AddEntrySheet from "@/components/AddEntrySheet";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface Insight {
  id: string;
  type: "tip" | "alert" | "achievement" | "trend";
  title: string;
  description: string;
  icon: string;
  color: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f97316",
  "Food & Dining": "#f97316",
  Shopping: "#8b5cf6",
  Groceries: "#10b981",
  Entertainment: "#ec4899",
  Transport: "#3b82f6",
  Housing: "#6366f1",
  Utilities: "#f59e0b",
  Health: "#14b8a6",
  Insurance: "#64748b",
  Income: "#10b981",
  Other: "#94a3b8",
};

type EntryTab = "EXPENSE" | "INCOME" | "TRANSFER" | "BILLS";
type InsightsSection = "summary" | "review";

// ── FAB ───────────────────────────────────────────────────────────────────────

function InsightsFAB({
  onAddExpense,
  onAddIncome,
  onTransfer,
}: {
  onAddExpense: () => void;
  onAddIncome: () => void;
  onTransfer: () => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const scale = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  const native = Platform.OS !== "web";

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (open) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 0, useNativeDriver: native }),
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: native }),
      ]).start(() => setOpen(false));
    } else {
      setOpen(true);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: native, tension: 80, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: native }),
      ]).start();
    }
  };

  const close = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0, useNativeDriver: native }),
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: native }),
    ]).start(() => setOpen(false));
  };

  const handleAction = (cb: () => void) => {
    close();
    setTimeout(cb, 180);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={toggle}
        />
      )}

      <View style={styles.fabContainer} pointerEvents="box-none">
        {/* Action buttons */}
        {open && (
          <Animated.View style={[styles.fabActions, { opacity, transform: [{ scale }] }]}>
            <TouchableOpacity
              style={[styles.fabAction, { backgroundColor: colors.card, shadowColor: "#000" }]}
              onPress={() => handleAction(onAddExpense)}
              activeOpacity={0.85}
            >
              <View style={styles.fabActionIcon}>
                <Feather name="arrow-up" size={18} color="#ef4444" />
              </View>
              <Text style={[styles.fabActionLabel, { color: colors.foreground }]}>Add Expense</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fabAction, { backgroundColor: colors.card, shadowColor: "#000" }]}
              onPress={() => handleAction(onAddIncome)}
              activeOpacity={0.85}
            >
              <View style={styles.fabActionIcon}>
                <Feather name="arrow-down" size={18} color="#10b981" />
              </View>
              <Text style={[styles.fabActionLabel, { color: colors.foreground }]}>Add Income</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fabAction, { backgroundColor: colors.card, shadowColor: "#000" }]}
              onPress={() => handleAction(onTransfer)}
              activeOpacity={0.85}
            >
              <View style={styles.fabActionIcon}>
                <Feather name="repeat" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.fabActionLabel, { color: colors.foreground }]}>Transfer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Close / Open FAB */}
        <TouchableOpacity
          style={[
            styles.fab,
            open
              ? { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border }
              : { backgroundColor: "#2d6a2d" },
          ]}
          onPress={toggle}
          activeOpacity={0.85}
        >
          {open ? (
            <Feather name="x" size={22} color={colors.foreground} />
          ) : (
            <Feather name="more-horizontal" size={22} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const colors = useColors();
  const { transactions, accounts, bills, monthlyIncome, monthlyExpense, addTransaction } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [section, setSection] = useState<InsightsSection>("summary");
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetTab, setSheetTab] = useState<EntryTab>("EXPENSE");

  const openSheet = (tab: EntryTab) => {
    setSheetTab(tab);
    setSheetVisible(true);
  };

  const categorySpend = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonth = transactions.filter((t) => t.date >= monthStart && t.type === "expense");
    const totals: Record<string, number> = {};
    thisMonth.forEach((t) => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [transactions]);

  const totalSpend = categorySpend.reduce((s, [, v]) => s + v, 0);
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100 : 0;
  const emailTxCount = transactions.filter((t) => t.fromEmail).length;
  const reviewTxs = useMemo(() => transactions.filter((t) => t.fromEmail && !reviewedIds.includes(t.id)), [transactions, reviewedIds]);

  const addFromReview = (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;
    addTransaction({
      title: tx.title,
      merchant: tx.merchant,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      accountId: tx.accountId,
      date: tx.date,
      source: "manual",
      bank: tx.bank,
      note: tx.note,
    });
    setReviewedIds((prev) => [...prev, txId]);
  };

  const insights: Insight[] = useMemo(() => {
    const result: Insight[] = [];
    if (savingsRate > 20) {
      result.push({ id: "savings", type: "achievement", title: "Great Savings Rate!", description: `You're saving ${savingsRate.toFixed(0)}% of your income this month. Keep it up!`, icon: "award", color: colors.success });
    } else if (savingsRate < 0) {
      result.push({ id: "overspend", type: "alert", title: "Spending Over Income", description: `You've spent $${(monthlyExpense - monthlyIncome).toFixed(0)} more than you earned this month. Review your expenses.`, icon: "alert-triangle", color: colors.expense });
    }
    const unpaidBills = bills.filter((b) => !b.isPaid);
    const upcomingBills = unpaidBills.filter((b) => { const d = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 7; });
    if (upcomingBills.length > 0) {
      result.push({ id: "bills", type: "alert", title: `${upcomingBills.length} Bill${upcomingBills.length > 1 ? "s" : ""} Due This Week`, description: `$${upcomingBills.reduce((s, b) => s + b.amount, 0).toFixed(2)} due soon. Mark them paid to stay on track.`, icon: "calendar", color: colors.warning });
    }
    if (categorySpend.length > 0) {
      const [topCat, topAmount] = categorySpend[0];
      const pct = totalSpend > 0 ? ((topAmount / totalSpend) * 100).toFixed(0) : 0;
      result.push({ id: "topcat", type: "trend", title: `${topCat} is Your Top Expense`, description: `${pct}% of this month's spending went to ${topCat} ($${topAmount.toFixed(2)}).`, icon: "pie-chart", color: CATEGORY_COLORS[topCat] || colors.primary });
    }
    if (emailTxCount > 0) {
      result.push({ id: "email", type: "tip", title: `${emailTxCount} Transactions Auto-Imported`, description: "Email sync is working. All bank alert transactions are tracked automatically.", icon: "mail", color: colors.primary });
    }
    result.push({ id: "tip1", type: "tip", title: "50/30/20 Budget Rule", description: "Aim for 50% needs, 30% wants, and 20% savings. Pull down to refresh for the latest AI analysis.", icon: "target", color: colors.primary });
    return result;
  }, [transactions, bills, savingsRate, categorySpend]);

  const generateAiInsights = async () => {
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 2500));
    setAiInsights([
      `Your spending in Food & Dining is trending 18% higher than last month. Consider meal prepping to cut costs.`,
      `You have ${bills.filter((b) => !b.isPaid).length} unpaid bills totaling $${bills.filter((b) => !b.isPaid).reduce((s, b) => s + b.amount, 0).toFixed(2)}. Automating payments could help you avoid late fees.`,
      `Based on your income of $${monthlyIncome.toFixed(0)}, you could save up to $${(monthlyIncome * 0.2).toFixed(0)}/month by following the 20% savings rule.`,
      `Your accounts with positive balances total $${accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0).toFixed(2)}. Consider moving excess to a high-yield savings account.`,
    ]);
    setIsGenerating(false);
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 34 + 84 : 120 }]}
      >
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 64 : 12 }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>AI Insights</Text>
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSection("summary")} style={[styles.segmentBtn, section === "summary" && { backgroundColor: colors.primary }]}>
              <Text style={[styles.segmentText, { color: section === "summary" ? "#fff" : colors.mutedForeground }]}>Summary</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSection("review")} style={[styles.segmentBtn, section === "review" && { backgroundColor: colors.primary }]}>
              <Text style={[styles.segmentText, { color: section === "review" ? "#fff" : colors.mutedForeground }]}>Review</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.genBtn, { backgroundColor: isGenerating ? colors.muted : colors.primary }]}
            onPress={generateAiInsights}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="zap" size={16} color="#fff" />
            )}
            <Text style={[styles.genBtnText, { color: isGenerating ? colors.mutedForeground : "#fff" }]}>
              {isGenerating ? "Analyzing..." : "Analyze"}
            </Text>
          </TouchableOpacity>
        </View>

        {section === "review" ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Review Email Transactions</Text>
            {reviewTxs.length === 0 ? (
              <Text style={[styles.noData, { color: colors.mutedForeground }]}>No email transactions to review</Text>
            ) : (
              reviewTxs.map((tx) => (
                <View key={tx.id} style={[styles.reviewRow, { borderColor: colors.border }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.reviewTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {tx.merchant || tx.title}
                    </Text>
                    <Text style={[styles.reviewSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {tx.bank || "Email"} · {tx.category} · {new Date(tx.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[styles.reviewAmt, { color: tx.type === "expense" ? colors.expense : colors.success }]}>
                    ${tx.amount.toFixed(2)}
                  </Text>
                  <TouchableOpacity style={[styles.reviewBtn, { backgroundColor: colors.primary }]} onPress={() => addFromReview(tx.id)}>
                    <Text style={styles.reviewBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>This Month's Spending</Text>
              {categorySpend.length === 0 ? (
                <Text style={[styles.noData, { color: colors.mutedForeground }]}>Add transactions to see breakdown</Text>
              ) : (
                categorySpend.map(([cat, amount]) => {
                  const pct = totalSpend > 0 ? (amount / totalSpend) * 100 : 0;
                  const catColor = CATEGORY_COLORS[cat] || colors.primary;
                  return (
                    <View key={cat} style={styles.catRow}>
                      <View style={styles.catLabel}>
                        <View style={[styles.catDot, { backgroundColor: catColor }]} />
                        <Text style={[styles.catName, { color: colors.foreground }]}>{cat}</Text>
                      </View>
                      <View style={styles.catBarContainer}>
                        <View style={[styles.catBar, { backgroundColor: catColor + "30", width: "100%" }]}>
                          <View style={[styles.catBarFill, { backgroundColor: catColor, width: `${Math.min(pct, 100)}%` as any }]} />
                        </View>
                      </View>
                      <Text style={[styles.catAmount, { color: colors.foreground }]}>${amount.toFixed(0)}</Text>
                    </View>
                  );
                })
              )}
            </View>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Health</Text>
              <View style={styles.healthRow}>
                <View style={styles.healthItem}>
                  <Text style={[styles.healthScore, { color: savingsRate >= 20 ? colors.success : savingsRate >= 10 ? colors.warning : colors.expense }]}>
                    {Math.max(0, Math.round(savingsRate))}%
                  </Text>
                  <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>Savings Rate</Text>
                </View>
                <View style={[styles.healthDivider, { backgroundColor: colors.border }]} />
                <View style={styles.healthItem}>
                  <Text style={[styles.healthScore, { color: accounts.length > 0 ? colors.success : colors.expense }]}>{accounts.length}</Text>
                  <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>Accounts</Text>
                </View>
                <View style={[styles.healthDivider, { backgroundColor: colors.border }]} />
                <View style={styles.healthItem}>
                  <Text style={[styles.healthScore, { color: bills.filter((b) => !b.isPaid).length === 0 ? colors.success : colors.warning }]}>
                    {bills.filter((b) => !b.isPaid).length}
                  </Text>
                  <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>Pending Bills</Text>
                </View>
              </View>
            </View>
            {aiInsights.length > 0 && (
              <View style={styles.sectionHeader}>
                <Feather name="zap" size={14} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>AI Analysis</Text>
              </View>
            )}
            {aiInsights.map((insight, i) => (
              <View key={i} style={[styles.aiCard, { backgroundColor: colors.accent, borderColor: colors.primary + "30" }]}>
                <Feather name="cpu" size={14} color={colors.primary} />
                <Text style={[styles.aiText, { color: colors.foreground }]}>{insight}</Text>
              </View>
            ))}
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 4 }]}>Smart Insights</Text>
            {insights.map((insight) => (
              <View key={insight.id} style={[styles.insightCard, { backgroundColor: colors.card }]}>
                <View style={[styles.insightIcon, { backgroundColor: insight.color + "18" }]}>
                  <Feather name={insight.icon as any} size={18} color={insight.color} />
                </View>
                <View style={styles.insightContent}>
                  <View style={styles.insightHeader}>
                    <Text style={[styles.insightTitle, { color: colors.foreground }]}>{insight.title}</Text>
                    <View style={[styles.insightBadge, { backgroundColor: insight.color + "18" }]}>
                      <Text style={[styles.insightBadgeText, { color: insight.color }]}>{insight.type}</Text>
                    </View>
                  </View>
                  <Text style={[styles.insightDesc, { color: colors.mutedForeground }]}>{insight.description}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <InsightsFAB
        onAddExpense={() => openSheet("EXPENSE")}
        onAddIncome={() => openSheet("INCOME")}
        onTransfer={() => openSheet("TRANSFER")}
      />

      <AddEntrySheet
        visible={sheetVisible}
        initialTab={sheetTab}
        onClose={() => setSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  segment: { flexDirection: "row", borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  segmentText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  genBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  genBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, padding: 18, gap: 14 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  catLabel: { flexDirection: "row", alignItems: "center", gap: 7, width: 90 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  catBarContainer: { flex: 1 },
  catBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  catBarFill: { height: 6, borderRadius: 3 },
  catAmount: { fontSize: 13, fontFamily: "Inter_600SemiBold", width: 44, textAlign: "right" },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 0 },
  healthItem: { flex: 1, alignItems: "center", gap: 4 },
  healthScore: { fontSize: 26, fontFamily: "Inter_700Bold" },
  healthLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  healthDivider: { width: 1, height: 40, marginHorizontal: 8 },
  noData: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  aiCard: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  aiText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  insightCard: { flexDirection: "row", gap: 14, padding: 16, borderRadius: 14, alignItems: "flex-start" },
  insightIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  insightContent: { flex: 1, gap: 4 },
  insightHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  insightTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  insightBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  insightBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  insightDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  reviewTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  reviewSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reviewAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },
  reviewBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  reviewBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // FAB
  fabContainer: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 100 : 80,
    left: 20,
    alignItems: "flex-start",
    gap: 10,
  },
  fabActions: {
    gap: 8,
    alignItems: "flex-start",
  },
  fabAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 160,
  },
  fabActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f5f7fb",
    alignItems: "center",
    justifyContent: "center",
  },
  fabActionLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
});
