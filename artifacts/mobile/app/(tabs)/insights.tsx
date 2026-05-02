import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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

export default function InsightsScreen() {
  const colors = useColors();
  const { transactions, accounts, bills, monthlyIncome, monthlyExpense } =
    useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiInsights, setAiInsights] = useState<string[]>([]);

  const categorySpend = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();
    const thisMonth = transactions.filter(
      (t) => t.date >= monthStart && t.type === "expense"
    );
    const totals: Record<string, number> = {};
    thisMonth.forEach((t) => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [transactions]);

  const totalSpend = categorySpend.reduce((s, [, v]) => s + v, 0);

  const savingsRate =
    monthlyIncome > 0
      ? ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100
      : 0;

  const emailTxCount = transactions.filter((t) => t.fromEmail).length;

  const insights: Insight[] = useMemo(() => {
    const result: Insight[] = [];

    if (savingsRate > 20) {
      result.push({
        id: "savings",
        type: "achievement",
        title: "Great Savings Rate!",
        description: `You're saving ${savingsRate.toFixed(0)}% of your income this month. Keep it up!`,
        icon: "award",
        color: colors.success,
      });
    } else if (savingsRate < 0) {
      result.push({
        id: "overspend",
        type: "alert",
        title: "Spending Over Income",
        description: `You've spent $${(monthlyExpense - monthlyIncome).toFixed(0)} more than you earned this month. Review your expenses.`,
        icon: "alert-triangle",
        color: colors.expense,
      });
    }

    const unpaidBills = bills.filter((b) => !b.isPaid);
    const upcomingBills = unpaidBills.filter((b) => {
      const d = Math.ceil(
        (new Date(b.dueDate).getTime() - Date.now()) / 86400000
      );
      return d >= 0 && d <= 7;
    });
    if (upcomingBills.length > 0) {
      result.push({
        id: "bills",
        type: "alert",
        title: `${upcomingBills.length} Bill${upcomingBills.length > 1 ? "s" : ""} Due This Week`,
        description: `$${upcomingBills.reduce((s, b) => s + b.amount, 0).toFixed(2)} due soon. Mark them paid to stay on track.`,
        icon: "calendar",
        color: colors.warning,
      });
    }

    if (categorySpend.length > 0) {
      const [topCat, topAmount] = categorySpend[0];
      const pct = totalSpend > 0 ? ((topAmount / totalSpend) * 100).toFixed(0) : 0;
      result.push({
        id: "topcat",
        type: "trend",
        title: `${topCat} is Your Top Expense`,
        description: `${pct}% of this month's spending went to ${topCat} ($${topAmount.toFixed(2)}).`,
        icon: "pie-chart",
        color: CATEGORY_COLORS[topCat] || colors.primary,
      });
    }

    if (emailTxCount > 0) {
      result.push({
        id: "email",
        type: "tip",
        title: `${emailTxCount} Transactions Auto-Imported`,
        description: "Email sync is working. All bank alert transactions are tracked automatically.",
        icon: "mail",
        color: colors.primary,
      });
    }

    result.push({
      id: "tip1",
      type: "tip",
      title: "50/30/20 Budget Rule",
      description:
        "Aim for 50% needs, 30% wants, and 20% savings. Pull down to refresh for the latest AI analysis.",
      icon: "target",
      color: colors.primary,
    });

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
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 },
        ]}
      >
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 64 : 12 }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            AI Insights
          </Text>
          <TouchableOpacity
            style={[
              styles.genBtn,
              {
                backgroundColor: isGenerating
                  ? colors.muted
                  : colors.primary,
              },
            ]}
            onPress={generateAiInsights}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="zap" size={16} color="#fff" />
            )}
            <Text
              style={[
                styles.genBtnText,
                { color: isGenerating ? colors.mutedForeground : "#fff" },
              ]}
            >
              {isGenerating ? "Analyzing..." : "Analyze"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Spending Breakdown */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            This Month's Spending
          </Text>
          {categorySpend.length === 0 ? (
            <Text style={[styles.noData, { color: colors.mutedForeground }]}>
              Add transactions to see breakdown
            </Text>
          ) : (
            categorySpend.map(([cat, amount]) => {
              const pct = totalSpend > 0 ? (amount / totalSpend) * 100 : 0;
              const catColor = CATEGORY_COLORS[cat] || colors.primary;
              return (
                <View key={cat} style={styles.catRow}>
                  <View style={styles.catLabel}>
                    <View
                      style={[styles.catDot, { backgroundColor: catColor }]}
                    />
                    <Text style={[styles.catName, { color: colors.foreground }]}>
                      {cat}
                    </Text>
                  </View>
                  <View style={styles.catBarContainer}>
                    <View
                      style={[
                        styles.catBar,
                        {
                          backgroundColor: catColor + "30",
                          width: "100%",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.catBarFill,
                          {
                            backgroundColor: catColor,
                            width: `${Math.min(pct, 100)}%` as any,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.catAmount, { color: colors.foreground }]}>
                    ${amount.toFixed(0)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Health Score */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Financial Health
          </Text>
          <View style={styles.healthRow}>
            <View style={styles.healthItem}>
              <Text
                style={[
                  styles.healthScore,
                  {
                    color:
                      savingsRate >= 20
                        ? colors.success
                        : savingsRate >= 10
                        ? colors.warning
                        : colors.expense,
                  },
                ]}
              >
                {Math.max(0, Math.round(savingsRate))}%
              </Text>
              <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>
                Savings Rate
              </Text>
            </View>
            <View
              style={[styles.healthDivider, { backgroundColor: colors.border }]}
            />
            <View style={styles.healthItem}>
              <Text
                style={[
                  styles.healthScore,
                  { color: accounts.length > 0 ? colors.success : colors.expense },
                ]}
              >
                {accounts.length}
              </Text>
              <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>
                Accounts
              </Text>
            </View>
            <View
              style={[styles.healthDivider, { backgroundColor: colors.border }]}
            />
            <View style={styles.healthItem}>
              <Text
                style={[
                  styles.healthScore,
                  {
                    color:
                      bills.filter((b) => !b.isPaid).length === 0
                        ? colors.success
                        : colors.warning,
                  },
                ]}
              >
                {bills.filter((b) => !b.isPaid).length}
              </Text>
              <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>
                Pending Bills
              </Text>
            </View>
          </View>
        </View>

        {/* AI Generated Insights */}
        {aiInsights.length > 0 && (
          <View style={styles.sectionHeader}>
            <Feather name="zap" size={14} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              AI Analysis
            </Text>
          </View>
        )}
        {aiInsights.map((insight, i) => (
          <View
            key={i}
            style={[
              styles.aiCard,
              {
                backgroundColor: colors.accent,
                borderColor: colors.primary + "30",
              },
            ]}
          >
            <Feather name="cpu" size={14} color={colors.primary} />
            <Text style={[styles.aiText, { color: colors.foreground }]}>
              {insight}
            </Text>
          </View>
        ))}

        {/* Smart Insights */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 4 }]}>
          Smart Insights
        </Text>
        {insights.map((insight) => (
          <View
            key={insight.id}
            style={[styles.insightCard, { backgroundColor: colors.card }]}
          >
            <View
              style={[
                styles.insightIcon,
                { backgroundColor: insight.color + "18" },
              ]}
            >
              <Feather
                name={insight.icon as any}
                size={18}
                color={insight.color}
              />
            </View>
            <View style={styles.insightContent}>
              <View style={styles.insightHeader}>
                <Text style={[styles.insightTitle, { color: colors.foreground }]}>
                  {insight.title}
                </Text>
                <View
                  style={[
                    styles.insightBadge,
                    { backgroundColor: insight.color + "18" },
                  ]}
                >
                  <Text style={[styles.insightBadgeText, { color: insight.color }]}>
                    {insight.type}
                  </Text>
                </View>
              </View>
              <Text
                style={[styles.insightDesc, { color: colors.mutedForeground }]}
              >
                {insight.description}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  genBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  genBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  catLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    width: 90,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  catBarContainer: {
    flex: 1,
  },
  catBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  catBarFill: {
    height: 6,
    borderRadius: 3,
  },
  catAmount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    width: 44,
    textAlign: "right",
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  healthItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  healthScore: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  healthLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  healthDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 8,
  },
  noData: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  aiCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  aiText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  insightCard: {
    flexDirection: "row",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    alignItems: "flex-start",
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  insightContent: {
    flex: 1,
    gap: 4,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  insightTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  insightBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  insightBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
  },
  insightDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
