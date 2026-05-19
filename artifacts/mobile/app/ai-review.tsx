import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { getApiBase, useApp } from "@/context/AppContext";
import { useAIProvider } from "@/context/AIProviderContext";
import { useColors } from "@/hooks/useColors";

type Verdict = "Good spend" | "Reasonable" | "Worth reviewing" | "Consider cutting";

interface TransactionReview {
  transaction: {
    id: string;
    title: string;
    merchant?: string;
    amount: number;
    type: "income" | "expense";
    category: string;
    date: string;
    bank?: string;
  };
  verdict: Verdict;
  reason: string;
  score: number;
}

interface ReviewResult {
  summary: string;
  topTip: string;
  overallScore: number | null;
  reviews: TransactionReview[];
  totalSpend: number;
  thresholdAmount: number;
  currency: string;
  windowDays: number;
}

const VERDICT_COLORS: Record<string, string> = {
  "Good spend": "#10b981",
  Reasonable: "#3b82f6",
  "Worth reviewing": "#f59e0b",
  "Consider cutting": "#ef4444",
};

const VERDICT_ICONS: Record<string, string> = {
  "Good spend": "check-circle",
  Reasonable: "info",
  "Worth reviewing": "alert-circle",
  "Consider cutting": "x-circle",
};

const THRESHOLD_OPTIONS = [25, 50, 100, 200, 500];
const WINDOW_OPTIONS = [30, 60, 90];

function ScoreDots({ score, max = 10 }: { score: number; max?: number }) {
  const colors = useColors();
  const filled = Math.round(score);
  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
      {Array.from({ length: max }, (_, i) => (
        <View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor:
              i < filled
                ? score >= 7
                  ? "#10b981"
                  : score >= 4
                  ? "#f59e0b"
                  : "#ef4444"
                : colors.border,
          }}
        />
      ))}
      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginLeft: 4, fontFamily: "Inter_600SemiBold" }}>
        {score}/10
      </Text>
    </View>
  );
}

export default function AIReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions, deviceId, householdId } = useApp();
  const { mode } = useAIProvider();

  const [threshold, setThreshold] = useState(50);
  const [windowDays, setWindowDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const expenseCount = transactions.filter(
    (t) =>
      t.type === "expense" &&
      t.amount >= threshold &&
      t.date >=
        new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
  ).length;

  const handleAnalyze = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/ai/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdId,
          "X-Device-ID": deviceId,
        },
        body: JSON.stringify({
          transactions,
          thresholdAmount: threshold,
          currency: "CAD",
          windowDays,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Analysis Failed", (err as any).error ?? "Something went wrong. Please try again.");
        return;
      }
      const data: ReviewResult = await res.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(data);
    } catch {
      Alert.alert("Network Error", "Could not reach the server. Make sure you're connected.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.headerIcon, { backgroundColor: "#8b5cf6" + "18" }]}>
            <Feather name="cpu" size={18} color="#8b5cf6" />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>AI Spend Review</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro card */}
        <View style={[styles.introCard, { backgroundColor: "#8b5cf6" + "12", borderColor: "#8b5cf6" + "30" }]}>
          <Text style={[styles.introTitle, { color: "#8b5cf6" }]}>How it works</Text>
          <Text style={[styles.introText, { color: colors.foreground }]}>
            FinTrack uses AI to scan your bigger purchases and tell you if each one was a good deal, reasonable, or worth reconsidering. You'll also get an overall spend score and a personalized tip.
          </Text>
        </View>

        {/* Provider badge */}
        <View style={[styles.providerBadge, { backgroundColor: mode === "local" ? "#f59e0b12" : colors.muted, borderColor: mode === "local" ? "#f59e0b40" : colors.border }]}>
          <Feather name={mode === "local" ? "cpu" : "globe"} size={13} color={mode === "local" ? "#f59e0b" : colors.mutedForeground} />
          <Text style={[styles.providerBadgeText, { color: mode === "local" ? "#f59e0b" : colors.mutedForeground }]}>
            {mode === "local"
              ? "On-Device mode active \u2014 Spend Review uses API for reliable structured output"
              : "Using API (configure model in api-server/.env)"}
          </Text>
        </View>

        {/* Threshold selector */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MINIMUM AMOUNT (CAD)</Text>
          <View style={styles.chipRow}>
            {THRESHOLD_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.chip,
                  {
                    backgroundColor: threshold === t ? "#8b5cf6" : colors.muted,
                    borderColor: threshold === t ? "#8b5cf6" : colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setThreshold(t);
                  setResult(null);
                }}
              >
                <Text style={[styles.chipText, { color: threshold === t ? "#fff" : colors.foreground }]}>
                  ${t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Window selector */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LOOK BACK</Text>
          <View style={styles.chipRow}>
            {WINDOW_OPTIONS.map((w) => (
              <TouchableOpacity
                key={w}
                style={[
                  styles.chip,
                  {
                    backgroundColor: windowDays === w ? "#8b5cf6" : colors.muted,
                    borderColor: windowDays === w ? "#8b5cf6" : colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setWindowDays(w);
                  setResult(null);
                }}
              >
                <Text style={[styles.chipText, { color: windowDays === w ? "#fff" : colors.foreground }]}>
                  {w} days
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Analyze button */}
        <TouchableOpacity
          style={[
            styles.analyzeBtn,
            { backgroundColor: "#8b5cf6", opacity: loading ? 0.75 : 1 },
          ]}
          onPress={handleAnalyze}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.analyzeBtnText}>Analyzing with AI…</Text>
            </>
          ) : (
            <>
              <Feather name="zap" size={17} color="#fff" />
              <Text style={styles.analyzeBtnText}>
                Analyze {expenseCount > 0 ? `${expenseCount} purchase${expenseCount !== 1 ? "s" : ""}` : "Purchases"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {expenseCount === 0 && !loading && (
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            No expenses over ${threshold} in the last {windowDays} days. Try lowering the threshold or adding some transactions first.
          </Text>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Overall summary */}
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryHeader}>
                <View style={[styles.summaryIconWrap, { backgroundColor: "#8b5cf6" + "18" }]}>
                  <Feather name="bar-chart-2" size={18} color="#8b5cf6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Spending Summary</Text>
                  {result.overallScore !== null && (
                    <ScoreDots score={result.overallScore} />
                  )}
                </View>
                <View style={styles.totalBadge}>
                  <Text style={[styles.totalAmount, { color: "#ef4444" }]}>
                    ${result.totalSpend.toFixed(0)}
                  </Text>
                  <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>total</Text>
                </View>
              </View>
              <Text style={[styles.summaryText, { color: colors.foreground }]}>{result.summary}</Text>
              {!!result.topTip && (
                <View style={[styles.tipRow, { backgroundColor: "#f59e0b" + "12", borderColor: "#f59e0b" + "30" }]}>
                  <Feather name="lightbulb" size={14} color="#f59e0b" />
                  <Text style={[styles.tipText, { color: colors.foreground }]}>{result.topTip}</Text>
                </View>
              )}
            </View>

            {/* Individual reviews */}
            {result.reviews.length === 0 ? (
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{result.summary}</Text>
            ) : (
              result.reviews.map((review) => {
                const verdictColor = VERDICT_COLORS[review.verdict] ?? colors.mutedForeground;
                const verdictIcon = VERDICT_ICONS[review.verdict] ?? "circle";
                return (
                  <View
                    key={review.transaction.id}
                    style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.reviewHeader}>
                      <View style={[styles.verdictBadge, { backgroundColor: verdictColor + "15" }]}>
                        <Feather name={verdictIcon as any} size={13} color={verdictColor} />
                        <Text style={[styles.verdictText, { color: verdictColor }]}>{review.verdict}</Text>
                      </View>
                      <Text style={[styles.reviewAmount, { color: colors.foreground }]}>
                        CAD ${review.transaction.amount.toFixed(2)}
                      </Text>
                    </View>

                    <Text style={[styles.reviewMerchant, { color: colors.foreground }]}>
                      {review.transaction.merchant || review.transaction.title}
                    </Text>
                    <Text style={[styles.reviewMeta, { color: colors.mutedForeground }]}>
                      {review.transaction.category}
                      {review.transaction.bank ? ` · ${review.transaction.bank}` : ""}
                      {" · "}
                      {new Date(review.transaction.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                    </Text>

                    <Text style={[styles.reviewReason, { color: colors.foreground }]}>{review.reason}</Text>

                    <ScoreDots score={review.score} />
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },

  introCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  introTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  introText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  providerBadge: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  providerBadgeText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  section: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  analyzeBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  emptyHint: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    paddingHorizontal: 20,
  },

  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  summaryHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  summaryText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  totalBadge: { alignItems: "flex-end" },
  totalAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  totalLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  tipText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },

  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  verdictBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  verdictText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  reviewAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  reviewMerchant: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  reviewMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reviewReason: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
