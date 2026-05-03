import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Svg,
  Text as SvgText,
} from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionDetailModal from "@/components/TransactionDetailModal";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/components/TransactionItem";
import { Transaction, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Balance history ───────────────────────────────────────────────────────────

function buildBalanceHistory(
  currentBalance: number,
  txns: Transaction[],
  days = 30
): { balance: number; label: string }[] {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const txByDate: Record<string, Transaction[]> = {};
  for (const tx of txns) {
    const key = new Date(tx.date).toDateString();
    (txByDate[key] = txByDate[key] || []).push(tx);
  }

  const dates: Date[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayEnd);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
  }

  const balances = new Array<number>(days).fill(0);
  balances[days - 1] = currentBalance;

  for (let i = days - 2; i >= 0; i--) {
    const dayKey = dates[i + 1].toDateString();
    const dayTxns = txByDate[dayKey] || [];
    let b = balances[i + 1];
    for (const tx of dayTxns) {
      if (tx.type === "expense") b += tx.amount;
      else b -= tx.amount;
    }
    balances[i] = b;
  }

  return dates.map((d, i) => ({
    balance: balances[i],
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}

// ── Balance Timeline Chart ────────────────────────────────────────────────────

function BalanceChart({
  balances,
  labels,
}: {
  balances: number[];
  labels: string[];
}) {
  const colors = useColors();

  const padL = 44;
  const padR = 8;
  const padT = 8;
  const padB = 26;
  const totalW = SCREEN_W - 32; // card has 16px margin each side
  const chartW = totalW - padL - padR;
  const chartH = 200;

  const rawMax = Math.max(...balances);
  const rawMin = Math.min(0, Math.min(...balances));
  const yMax = Math.ceil(rawMax / 500) * 500 || 500;
  const yMin = Math.floor(rawMin / 500) * 500;
  const yRange = yMax - yMin || 1;

  const numGridLines = 6;
  const yStep = yRange / (numGridLines - 1);
  const yGridVals = Array.from({ length: numGridLines }, (_, i) =>
    Math.round(yMax - i * yStep)
  );

  const toX = (i: number) =>
    padL + (i / Math.max(balances.length - 1, 1)) * chartW;
  const toY = (v: number) =>
    padT + ((yMax - v) / yRange) * (chartH - padT - padB);

  let linePath = "";
  balances.forEach((b, i) => {
    const x = toX(i).toFixed(1);
    const y = toY(b).toFixed(1);
    if (i === 0) {
      linePath += `M ${x} ${y}`;
    } else {
      const px = toX(i - 1);
      const py = toY(balances[i - 1]);
      const cpx = ((px + parseFloat(x)) / 2).toFixed(1);
      linePath += ` C ${cpx} ${py.toFixed(1)} ${cpx} ${y} ${x} ${y}`;
    }
  });

  const midIdx = Math.floor((balances.length - 1) / 2);
  const xLabelIndices = [0, midIdx, balances.length - 1];

  return (
    <Svg width={totalW} height={chartH}>
      {/* Grid lines + Y labels */}
      {yGridVals.map((v, i) => {
        const y = toY(v);
        const label =
          Math.abs(v) >= 1000
            ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
            : String(v);
        return (
          <React.Fragment key={i}>
            <Line
              x1={padL}
              y1={y}
              x2={padL + chartW}
              y2={y}
              stroke={colors.border}
              strokeWidth="0.7"
            />
            <SvgText
              x={padL - 5}
              y={y + 4}
              fontSize="10"
              fill={colors.mutedForeground}
              textAnchor="end"
            >
              {label}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* X-axis labels */}
      {xLabelIndices.map((idx) => (
        <SvgText
          key={idx}
          x={toX(idx)}
          y={chartH - 4}
          fontSize="10"
          fill={colors.mutedForeground}
          textAnchor={
            idx === 0 ? "start" : idx === balances.length - 1 ? "end" : "middle"
          }
        >
          {labels[idx]}
        </SvgText>
      ))}

      {/* Line */}
      {linePath ? (
        <Path
          d={linePath}
          stroke={colors.primary}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Dots */}
      {balances.map((b, i) => (
        <Circle
          key={i}
          cx={toX(i)}
          cy={toY(b)}
          r="3.5"
          fill={colors.primary}
        />
      ))}
    </Svg>
  );
}

// ── All Transactions Modal ────────────────────────────────────────────────────

function AllTransactionsModal({
  visible,
  onClose,
  transactions,
  onSelectTransaction,
}: {
  visible: boolean;
  onClose: () => void;
  transactions: Transaction[];
  onSelectTransaction: (t: Transaction) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"Month View" | "Activity">("Month View");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? transactions.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q)
        )
      : transactions;
  }, [transactions, search]);

  // Group by month
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    for (const tx of sorted) {
      const d = new Date(tx.date);
      const key = d.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }).toUpperCase();
      (map.get(key) ? map.get(key)! : map.set(key, []).get(key)!).push(tx);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View
          style={[
            styles.allTxHeader,
            {
              paddingTop: (Platform.OS === "web" ? 20 : insets.top) + 12,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={onClose} style={styles.allTxClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.muted, marginHorizontal: 16, marginTop: 12 },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search transactions ..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Toggle */}
        <View style={[styles.viewToggleWrap, { backgroundColor: colors.muted, marginHorizontal: 16, marginTop: 12 }]}>
          {(["Month View", "Activity"] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.viewTogglePill,
                viewMode === v && { backgroundColor: colors.background },
              ]}
              onPress={() => setViewMode(v)}
            >
              <Text
                style={[
                  styles.viewToggleText,
                  { color: viewMode === v ? colors.primary : colors.mutedForeground },
                ]}
              >
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        >
          {grouped.length === 0 ? (
            <View style={styles.allTxEmpty}>
              <Feather name="inbox" size={36} color={colors.mutedForeground} />
              <Text style={[styles.allTxEmptyText, { color: colors.mutedForeground }]}>
                No transactions
              </Text>
            </View>
          ) : (
            grouped.map(([month, txns]) => (
              <View key={month}>
                <Text
                  style={[styles.monthLabel, { color: colors.foreground, backgroundColor: colors.background }]}
                >
                  {month}
                </Text>
                {txns.map((tx) => {
                  const icon = (CATEGORY_ICONS[tx.category] || "circle") as any;
                  const catColor = CATEGORY_COLORS[tx.category] || colors.primary;
                  const d = new Date(tx.date);
                  const dateStr = d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const timeStr = d.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  return (
                    <TouchableOpacity
                      key={tx.id}
                      style={[
                        styles.allTxRow,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onSelectTransaction(tx);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.allTxIcon, { backgroundColor: catColor + "22" }]}>
                        <Feather name={icon} size={20} color={catColor} />
                      </View>
                      <View style={styles.allTxInfo}>
                        <Text style={[styles.allTxTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {tx.title}
                        </Text>
                        <Text style={[styles.allTxMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {dateStr}, {timeStr}
                          {tx.category ? ` › ${tx.category}` : ""}
                          {tx.note ? ` · ${tx.note}` : ""}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.allTxAmount,
                          { color: tx.type === "income" ? "#10b981" : colors.foreground },
                        ]}
                      >
                        ${tx.amount.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

function bankInitials(bank: string, name: string) {
  const src = bank || name;
  const words = src.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, transactions, updateAccount } = useApp();

  const account = accounts.find((a) => a.id === id);
  const accountTxns = useMemo(
    () =>
      transactions
        .filter((t) => t.accountId === id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions, id]
  );

  const history = useMemo(
    () =>
      account
        ? buildBalanceHistory(account.balance, accountTxns, 30)
        : [],
    [account, accountTxns]
  );

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showAllTx, setShowAllTx] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);

  if (!account) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.notFound}>
          <Feather name="alert-circle" size={36} color={colors.mutedForeground} />
          <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
            Account not found
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: colors.primary }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isNeg = account.balance < 0;
  const initials = bankInitials(account.bank, account.name);
  const recentTxns = accountTxns.slice(0, 8);

  const lastTxDate =
    accountTxns.length > 0
      ? new Date(accountTxns[0].date).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : null;

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* ── Navigation Header ── */}
      <View
        style={[
          styles.navHeader,
          {
            paddingTop: Platform.OS === "web" ? 52 : 8,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.navBack}
        >
          <Feather name="arrow-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Account</Text>
        <View style={styles.navIcons}>
          <TouchableOpacity hitSlop={8}>
            <Feather name="download" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8}>
            <Feather name="refresh-cw" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8}>
            <Feather name="more-vertical" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }}
      >
        {/* ── Account Identity ── */}
        <View style={styles.accountIdentity}>
          <View style={[styles.accountBadgeLg, { backgroundColor: account.color }]}>
            <Text style={styles.accountBadgeLgText}>{initials}</Text>
          </View>
          <Text style={[styles.accountNameLg, { color: colors.foreground }]}>
            {account.name}
          </Text>
        </View>

        {/* ── Balance ── */}
        <View style={styles.balanceSection}>
          <View style={styles.balanceRow}>
            <Text style={[styles.balanceAmount, { color: isNeg ? colors.expense : colors.foreground }]}>
              {isNeg ? "-" : ""}$
              {Math.abs(account.balance).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <TouchableOpacity hitSlop={8} style={styles.editIcon}>
              <Feather name="edit-2" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {lastTxDate && (
            <Text style={[styles.lastUpdated, { color: colors.mutedForeground }]}>
              Last updated {lastTxDate}
            </Text>
          )}
        </View>

        {/* ── Balance Timeline ── */}
        <View
          style={[
            styles.chartCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>
            Balance Timeline
          </Text>
          {history.length > 1 ? (
            <BalanceChart
              balances={history.map((h) => h.balance)}
              labels={history.map((h) => h.label)}
            />
          ) : (
            <View style={styles.chartEmpty}>
              <Text style={[styles.chartEmptyText, { color: colors.mutedForeground }]}>
                Add transactions to see the balance timeline
              </Text>
            </View>
          )}
        </View>

        {/* ── Recent Transactions ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>
            Recent Transactions
          </Text>
          {accountTxns.length > 0 && (
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAllTx(true);
              }}
            >
              <Text style={[styles.viewAllText, { color: colors.primary }]}>
                View All
              </Text>
              <Feather name="chevron-right" size={15} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {recentTxns.length === 0 ? (
          <View
            style={[
              styles.emptyTx,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxText, { color: colors.mutedForeground }]}>
              No transactions yet
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.txList,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {recentTxns.map((tx, i) => {
              const icon = (CATEGORY_ICONS[tx.category] || "circle") as any;
              const catColor = CATEGORY_COLORS[tx.category] || colors.primary;
              const d = new Date(tx.date);
              const dateLabel = d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              return (
                <TouchableOpacity
                  key={tx.id}
                  style={[
                    styles.txRow,
                    i < recentTxns.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedTx(tx);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.txIcon, { backgroundColor: catColor + "22" }]}>
                    <Feather name={icon} size={20} color={catColor} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text
                      style={[styles.txTitle, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {tx.title}
                    </Text>
                    <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                      {dateLabel}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: tx.type === "income" ? "#10b981" : colors.foreground },
                    ]}
                  >
                    ${tx.amount.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Include in Networth toggle ── */}
        <TouchableOpacity
          style={[
            styles.networthToggleRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            updateAccount(account.id, {
              includeInNetworth: account.includeInNetworth === false ? true : false,
            });
          }}
          activeOpacity={0.8}
        >
          <View style={[styles.networthIcon, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="dollar-sign" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.networthLabel, { color: colors.foreground }]}>
            Include in Networth
          </Text>
          <Switch
            value={account.includeInNetworth !== false}
            onValueChange={(val) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateAccount(account.id, { includeInNetworth: val });
            }}
            trackColor={{ false: "#d1d5db", true: colors.primary }}
            thumbColor="#fff"
          />
        </TouchableOpacity>
      </ScrollView>

      {/* ── Floating Add Button ── */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAddTx(true);
        }}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* ── Modals ── */}
      <TransactionDetailModal
        visible={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
      />

      <AllTransactionsModal
        visible={showAllTx}
        onClose={() => setShowAllTx(false)}
        transactions={accountTxns}
        onSelectTransaction={(tx) => {
          setShowAllTx(false);
          setTimeout(() => setSelectedTx(tx), 350);
        }}
      />

      <AddTransactionModal
        visible={showAddTx}
        onClose={() => setShowAddTx(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav header
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBack: { marginRight: 8 },
  navTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  navIcons: { flexDirection: "row", gap: 18, alignItems: "center" },

  // Account identity
  accountIdentity: { alignItems: "center", paddingTop: 24, gap: 10 },
  accountBadgeLg: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
  },
  accountBadgeLgText: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  accountNameLg: { fontSize: 20, fontFamily: "Inter_700Bold" },

  // Balance
  balanceSection: { alignItems: "center", paddingTop: 12, gap: 4 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  balanceAmount: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  editIcon: { marginTop: 6 },
  lastUpdated: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Chart card
  chartCard: {
    marginHorizontal: 16, marginTop: 20,
    borderRadius: 16, borderWidth: 1,
    padding: 16, gap: 12,
  },
  chartTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  chartEmpty: { height: 80, alignItems: "center", justifyContent: "center" },
  chartEmptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Sections
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginHorizontal: 16, marginTop: 24, marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewAllText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Transaction list
  txList: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 14, gap: 12 },
  txIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1, gap: 2 },
  txTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  txAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  emptyTx: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    padding: 40, alignItems: "center", gap: 10,
  },
  emptyTxText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  // Include in networth toggle
  networthToggleRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  networthIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  networthLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // FAB
  fab: {
    position: "absolute", right: 20,
    bottom: Platform.OS === "web" ? 34 + 84 + 16 : 100,
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },

  // All transactions modal
  allTxHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  allTxClose: { padding: 4 },
  searchBar: {
    flexDirection: "row", alignItems: "center",
    gap: 10, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  viewToggleWrap: {
    flexDirection: "row", borderRadius: 50, padding: 3,
  },
  viewTogglePill: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 50 },
  viewToggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  monthLabel: {
    fontSize: 12, fontFamily: "Inter_700Bold",
    letterSpacing: 0.6, paddingHorizontal: 16,
    paddingTop: 18, paddingBottom: 6,
  },
  allTxRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginVertical: 4,
    borderRadius: 14, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 14, gap: 12,
  },
  allTxIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  allTxInfo: { flex: 1, gap: 2 },
  allTxTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  allTxMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  allTxAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  allTxEmpty: { paddingVertical: 60, alignItems: "center", gap: 12 },
  allTxEmptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },

  // Not found
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backLink: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
