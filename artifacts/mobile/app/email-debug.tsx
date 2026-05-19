import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface DebugResult {
  from: string;
  subject: string;
  date: string;
  bodySnippet: string;
  isForwarded: boolean;
  originalFrom?: string;
  bankDetected: string | null;
  parseStatus: "matched" | "skipped_non_transaction" | "skipped_unknown_bank" | "skipped_no_pattern";
  rejectReason?: string;
  merchant?: string;
  amount?: number;
  currency?: string;
  direction?: "income" | "expense";
  matchedPattern?: string;
  category?: string;
  lastFour?: string;
}

export default function EmailDebugScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { emailSync } = useApp();
  const [email, setEmail] = useState(emailSync.email || "");
  const [appPassword, setAppPassword] = useState(emailSync.appPassword || "");
  const [daysBack, setDaysBack] = useState("30");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DebugResult[] | null>(null);
  const [summary, setSummary] = useState<{ emailsScanned: number; matchedCount: number; skippedCount: number } | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const getApiBase = () => {
    return process.env.EXPO_PUBLIC_API_URL || "https://fintrack-api-fmfl.onrender.com";
  };

  const runDebug = async () => {
    setLoading(true);
    setResults(null);
    setSummary(null);
    try {
      const res = await fetch(`${getApiBase()}/api/email/debug-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": emailSync.isConnected ? "test" : "",
          "X-Device-ID": "debug",
        },
        body: JSON.stringify({ email, appPassword, daysBack: parseInt(daysBack) || 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResults(data.results);
      setSummary({ emailsScanned: data.emailsScanned, matchedCount: data.matchedCount, skippedCount: data.skippedCount });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "matched": return colors.success;
      case "skipped_no_pattern": return "#f59e0b";
      case "skipped_non_transaction": return colors.mutedForeground;
      case "skipped_unknown_bank": return colors.expense;
      default: return colors.mutedForeground;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "matched": return "✓ Matched";
      case "skipped_no_pattern": return "⚠ No Pattern";
      case "skipped_non_transaction": return "⊘ Non-Transaction";
      case "skipped_unknown_bank": return "✗ Unknown Bank";
      default: return status;
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 20 : insets.top + 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Email Parser Debug</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 16 }}>
            <View style={[styles.inputGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={[styles.inputGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>App Password</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={appPassword}
                onChangeText={setAppPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={[styles.inputGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Days Back</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={daysBack}
                onChangeText={setDaysBack}
                placeholder="30"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
              />
            </View>

            <TouchableOpacity
              style={[styles.runBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
              onPress={runDebug}
              disabled={loading}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="search" size={16} color="#fff" />}
              <Text style={styles.runBtnText}>{loading ? "Scanning..." : "Run Debug Scan"}</Text>
            </TouchableOpacity>

            {summary && (
              <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.foreground }]}>Results</Text>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Text style={[styles.summaryStat, { color: colors.foreground }]}>Scanned: <Text style={{ color: colors.primary }}>{summary.emailsScanned}</Text></Text>
                  <Text style={[styles.summaryStat, { color: colors.foreground }]}>Matched: <Text style={{ color: colors.success }}>{summary.matchedCount}</Text></Text>
                  <Text style={[styles.summaryStat, { color: colors.foreground }]}>Skipped: <Text style={{ color: colors.expense }}>{summary.skippedCount}</Text></Text>
                </View>
              </View>
            )}

            {results && results.length > 0 && (
              <View style={{ gap: 12 }}>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Emails (sorted by match status)</Text>
                {results.map((r, idx) => (
                  <View
                    key={`${r.from}-${idx}`}
                    style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                      onPress={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                    >
                      <View style={[styles.statusDot, { backgroundColor: statusColor(r.parseStatus) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultSubject, { color: colors.foreground }]} numberOfLines={1}>{r.subject}</Text>
                        <Text style={[styles.resultFrom, { color: colors.mutedForeground }]} numberOfLines={1}>{r.from}</Text>
                      </View>
                      <Text style={[styles.statusBadge, { color: statusColor(r.parseStatus) }]}>{statusLabel(r.parseStatus)}</Text>
                      <Feather name={expandedIndex === idx ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>

                    {expandedIndex === idx && (
                      <View style={{ marginTop: 12, gap: 8 }}>
                        <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                          <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Bank Detected:</Text>
                          <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.bankDetected || "None"}</Text>
                        </View>
                        {r.rejectReason && (
                          <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Reason:</Text>
                            <Text style={[styles.detailValue, { color: colors.expense }]}>{r.rejectReason}</Text>
                          </View>
                        )}
                        {r.parseStatus === "matched" && (
                          <>
                            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Merchant:</Text>
                              <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.merchant}</Text>
                            </View>
                            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Amount:</Text>
                              <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.currency} ${r.amount?.toFixed(2)}</Text>
                            </View>
                            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Direction:</Text>
                              <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.direction}</Text>
                            </View>
                            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Pattern:</Text>
                              <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.matchedPattern}</Text>
                            </View>
                            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Category:</Text>
                              <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.category}</Text>
                            </View>
                          </>
                        )}
                        <View style={{ marginTop: 8 }}>
                          <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Body Snippet:</Text>
                          <Text style={[styles.bodySnippet, { color: colors.mutedForeground, backgroundColor: colors.background }]}>{r.bodySnippet}</Text>
                        </View>
                        {r.isForwarded && (
                          <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Forwarded From:</Text>
                            <Text style={[styles.detailValue, { color: colors.foreground }]}>{r.originalFrom}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  inputGroup: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  input: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  runBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  summary: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  summaryStat: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  resultCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  resultSubject: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  resultFrom: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  detailValue: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    flex: 1,
  },
  bodySnippet: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
});
