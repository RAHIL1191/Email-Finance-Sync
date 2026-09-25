import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TransactionDetailModal from "@/components/TransactionDetailModal";
import TransactionAvatar from "@/components/TransactionAvatar";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/components/TransactionItem";
import {
  Account,
  formatTxCleanTitle,
  getShortBankName,
  parseNoteAndTag,
  Transaction,
  useApp,
} from "@/context/AppContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate } from "@/hooks/useLocalDate";

const RECENT_SEARCHES_KEY = "@fintrack/recent_tx_searches";
const MAX_RECENT_SEARCHES = 8;

const SUGGESTED_QUERIES = [
  "Groceries",
  "Food",
  "Shopping",
  "Coffee",
  "Utilities",
  "Salary",
  "Gas",
  "Subscription",
];

type TypeFilter = "ALL" | "EXPENSE" | "INCOME" | "TRANSFER";

function fmtDate(dateStr: string): string {
  try {
    const d = parseLocalDate(dateStr);
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function getCategoryColor(category: string): string {
  const norm = category.trim();
  return CATEGORY_COLORS[norm] || CATEGORY_COLORS.Other || "#94a3b8";
}

function getCategoryIcon(category: string): string {
  const norm = category.trim();
  return CATEGORY_ICONS[norm] || CATEGORY_ICONS.Other || "circle";
}

export default function SearchScreen() {
  const colors = useColors();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === "dark";
  const { transactions, accounts } = useApp();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const inputRef = useRef<TextInput>(null);

  // Load recent searches on mount
  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((val) => {
        if (val) {
          try {
            const arr = JSON.parse(val);
            if (Array.isArray(arr)) setRecentSearches(arr);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const saveSearchTerm = useCallback((term: string) => {
    const cleaned = term.trim();
    if (!cleaned || cleaned.length < 2) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== cleaned.toLowerCase());
      const updated = [cleaned, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearRecentSearches = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY).catch(() => {});
  };

  const removeRecentSearch = (itemToRemove: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s !== itemToRemove);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  // Map of accountId -> account search label
  const accountMap = useMemo(() => {
    const map = new Map<string, { label: string; bank: string; mask: string }>();
    accounts.forEach((acc) => {
      const mask = acc.lastFour || (acc.name ? acc.name.slice(-4) : "");
      const bank = getShortBankName(acc.bank, acc.name);
      const label = `${acc.name || ""} ${bank} ${acc.type} ${mask}`.trim();
      map.set(acc.id, { label, bank, mask });
    });
    return map;
  }, [accounts]);

  // Multi-field search matching
  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cleanAmountQ = q.replace(/[$,]/g, "").trim();
    const parsedAmount = cleanAmountQ ? parseFloat(cleanAmountQ) : NaN;
    const isAmountSearch = !isNaN(parsedAmount);

    return transactions
      .filter((t) => {
        // 1. Type Filter
        if (typeFilter === "EXPENSE" && t.type !== "expense") return false;
        if (typeFilter === "INCOME" && t.type !== "income") return false;
        if (typeFilter === "TRANSFER") {
          const isTransfer = t.category?.toLowerCase().includes("transfer");
          if (!isTransfer) return false;
        }

        // If no query string, return all that match type filter
        if (!q) return true;

        // 2. Merchant / Title / Bank
        const title = (t.title || "").toLowerCase();
        const merchant = (t.merchant || "").toLowerCase();
        const bank = (t.bank || "").toLowerCase();
        const projectName = (t.projectName || "").toLowerCase();
        if (
          title.includes(q) ||
          merchant.includes(q) ||
          bank.includes(q) ||
          projectName.includes(q)
        ) {
          return true;
        }

        // 3. Notes & Tags
        const noteRaw = (t.note || "").toLowerCase();
        if (noteRaw.includes(q)) return true;
        const { cleanNote, tag } = parseNoteAndTag(t.note);
        if (cleanNote.toLowerCase().includes(q) || tag.toLowerCase().includes(q)) return true;

        // 4. Category
        const category = (t.category || "").toLowerCase();
        if (category.includes(q)) return true;

        // 5. Amount match
        if (cleanAmountQ.length > 0) {
          const amtStr = t.amount.toString();
          const amtFixed = t.amount.toFixed(2);
          if (amtStr.includes(cleanAmountQ) || amtFixed.includes(cleanAmountQ)) {
            return true;
          }
          if (isAmountSearch && Math.abs(t.amount - parsedAmount) < 0.005) {
            return true;
          }
        }

        // 6. Account name / Bank / Last 4
        if (t.accountId) {
          const acctInfo = accountMap.get(t.accountId);
          if (acctInfo && acctInfo.label.toLowerCase().includes(q)) {
            return true;
          }
        }

        // 7. Date string match (e.g. "sep", "2026", "2026-09-24", "15")
        const dateStr = (t.date || "").toLowerCase();
        if (dateStr.includes(q)) return true;

        return false;
      })
      .sort((a, b) => {
        // Sort descending by date
        const timeA = parseLocalDate(a.date).getTime();
        const timeB = parseLocalDate(b.date).getTime();
        return timeB - timeA;
      });
  }, [transactions, query, typeFilter, accountMap]);

  // Aggregate metrics for search results
  const resultStats = useMemo(() => {
    let expenseTotal = 0;
    let incomeTotal = 0;
    filteredTransactions.forEach((t) => {
      if (t.type === "income") incomeTotal += t.amount;
      else expenseTotal += t.amount;
    });
    return {
      count: filteredTransactions.length,
      expenseTotal,
      incomeTotal,
    };
  }, [filteredTransactions]);

  const handleSelectQuery = (term: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(term);
    saveSearchTerm(term);
  };

  const handleTxPress = (tx: Transaction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (query.trim()) {
      saveSearchTerm(query);
    }
    setSelectedTx(tx);
  };

  const renderTxItem = ({ item }: { item: Transaction }) => {
    const isIncome = item.type === "income";
    const acctInfo = item.accountId ? accountMap.get(item.accountId) : undefined;
    const catColor = getCategoryColor(item.category || "Other");
    const catIcon = getCategoryIcon(item.category || "Other");
    const cleanTitle = formatTxCleanTitle(item.title, item.merchant);
    const dateFormatted = fmtDate(item.date);

    const qLower = query.trim().toLowerCase();
    const hasNoteMatch =
      Boolean(qLower) &&
      Boolean(item.note) &&
      item.note!.toLowerCase().includes(qLower);

    return (
      <TouchableOpacity
        style={[
          styles.txCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        onPress={() => handleTxPress(item)}
        activeOpacity={0.7}
      >
        <TransactionAvatar
          title={item.title}
          merchant={item.merchant}
          category={item.category}
          type={item.type}
          size={42}
          iconSize={20}
          style={{ marginRight: 12 }}
        />

        <View style={styles.txMainInfo}>
          <Text
            style={[styles.txTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {cleanTitle}
          </Text>

          <View style={styles.txMetaRow}>
            <Text style={[styles.txMetaText, { color: colors.mutedForeground }]}>
              {dateFormatted}
            </Text>
            <Text style={[styles.dotSep, { color: colors.mutedForeground }]}>•</Text>
            <Text
              style={[styles.txMetaText, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {item.category || "General"}
            </Text>
            {acctInfo && (
              <>
                <Text style={[styles.dotSep, { color: colors.mutedForeground }]}>•</Text>
                <Text
                  style={[styles.txMetaText, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {acctInfo.bank || "Account"} {acctInfo.mask ? `••${acctInfo.mask}` : ""}
                </Text>
              </>
            )}
          </View>

          {/* Note highlight badge if note matches query */}
          {hasNoteMatch && (
            <View
              style={[
                styles.noteHighlightBadge,
                { backgroundColor: colors.accent, borderColor: colors.border },
              ]}
            >
              <Feather name="file-text" size={11} color={colors.primary} />
              <Text
                style={[styles.noteHighlightText, { color: colors.foreground }]}
                numberOfLines={1}
              >
                Note: {item.note}
              </Text>
            </View>
          )}

          {/* Show regular note snippet if present and no query */}
          {!query && item.note ? (
            <View style={styles.noteSnippetRow}>
              <Feather name="file-text" size={11} color={colors.mutedForeground} />
              <Text
                style={[styles.noteSnippetText, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {item.note}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.txRightCol}>
          <Text
            style={[
              styles.txAmount,
              { color: isIncome ? colors.success : colors.foreground },
            ]}
          >
            {isIncome ? "+" : "-"}${item.amount.toFixed(2)}
          </Text>
          <Feather name="chevron-right" size={15} color={colors.mutedForeground} style={{ marginTop: 2 }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header Search Bar ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>

        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: isDark ? "#1A1D24" : "#F1F3F7",
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="search" size={17} color={colors.mutedForeground} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search notes, merchant, amount, category..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => saveSearchTerm(query)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              hitSlop={8}
              style={styles.clearBtn}
            >
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Type Filter Pills ── */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
        {(["ALL", "EXPENSE", "INCOME", "TRANSFER"] as TypeFilter[]).map((tab) => {
          const active = typeFilter === tab;
          const label =
            tab === "ALL"
              ? "All"
              : tab === "EXPENSE"
              ? "Expenses"
              : tab === "INCOME"
              ? "Income"
              : "Transfers";

          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.filterPill,
                active
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTypeFilter(tab);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: active ? "#ffffff" : colors.mutedForeground },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Main Results / Pre-Search View ── */}
      {query.trim().length === 0 ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.preSearchContent}
        >
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Searches</Text>
                <TouchableOpacity onPress={clearRecentSearches} hitSlop={8}>
                  <Text style={[styles.clearAllText, { color: colors.primary }]}>Clear All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.chipsWrap}>
                {recentSearches.map((term) => (
                  <View
                    key={term}
                    style={[
                      styles.recentChip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => handleSelectQuery(term)}
                      style={styles.recentChipContent}
                    >
                      <Feather name="clock" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.recentChipText, { color: colors.foreground }]}>
                        {term}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeRecentSearch(term)}
                      hitSlop={6}
                      style={styles.recentChipRemove}
                    >
                      <Feather name="x" size={12} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Quick Suggestions */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Suggested Searches</Text>
            <View style={styles.chipsWrap}>
              {SUGGESTED_QUERIES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.suggestChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => handleSelectQuery(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.suggestChipText, { color: colors.foreground }]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Recent Transactions List Preview */}
          <View style={[styles.sectionWrap, { marginTop: 8 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Transactions</Text>
              <Text style={[styles.resultCountMeta, { color: colors.mutedForeground }]}>
                {filteredTransactions.length} total
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              {filteredTransactions.slice(0, 15).map((t) => (
                <View key={t.id}>{renderTxItem({ item: t })}</View>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Result Metrics Bar */}
          <View style={[styles.statsBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.statsCount, { color: colors.foreground }]}>
              {resultStats.count} {resultStats.count === 1 ? "match" : "matches"} found
            </Text>
            <View style={styles.statsTotals}>
              {resultStats.expenseTotal > 0 && (
                <Text style={[styles.statsExpense, { color: colors.expense }]}>
                  -${resultStats.expenseTotal.toFixed(2)}
                </Text>
              )}
              {resultStats.incomeTotal > 0 && (
                <Text style={[styles.statsIncome, { color: colors.success }]}>
                  +${resultStats.incomeTotal.toFixed(2)}
                </Text>
              )}
            </View>
          </View>

          {/* Filtered Transactions List */}
          {filteredTransactions.length > 0 ? (
            <FlatList
              data={filteredTransactions}
              keyExtractor={(item) => item.id}
              renderItem={renderTxItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="search" size={32} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No Transactions Found
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                No transactions matched "{query}". You can search by note, merchant, category, amount (e.g. $45), or account name.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Transaction Detail Modal ── */}
      <TransactionDetailModal
        visible={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  clearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  preSearchContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 20,
  },
  sectionWrap: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  clearAllText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  resultCountMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  recentChipContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 6,
  },
  recentChipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  recentChipRemove: {
    paddingVertical: 7,
    paddingRight: 8,
    paddingLeft: 4,
  },
  suggestChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  suggestChipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statsCount: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  statsTotals: {
    flexDirection: "row",
    gap: 10,
  },
  statsExpense: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  statsIncome: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  catIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txMainInfo: {
    flex: 1,
    gap: 3,
  },
  txTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  txMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  txMetaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  dotSep: {
    fontSize: 12,
  },
  noteHighlightBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  noteHighlightText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  noteSnippetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  noteSnippetText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  txRightCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
  },
  txAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingBottom: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
});
