import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Modal,
  Platform,
  Pressable,
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
  Rect,
  Stop,
  Svg,
  Text as SvgText,
} from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";

import AddEntrySheet from "@/components/AddEntrySheet";
import ConfirmModal from "@/components/ConfirmModal";
import TransactionDetailModal from "@/components/TransactionDetailModal";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/components/TransactionItem";
import { ACCOUNT_CATEGORIES, SubType } from "@/components/AddAccountModal";
import { Account, PLAID_BANKS, Transaction, InvestmentTransaction, computeBalance, isIncludedInNetworth, isLiabilityAccount, getAccountGroupKey, getShortBankName, cleanCardDisplayName, txBelongsToAccount, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate, toLocalYMD } from "@/hooks/useLocalDate";
import DateTimePicker from "@react-native-community/datetimepicker";
import PlaidLinkModal from "@/components/PlaidLinkModal";

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
    const key = parseLocalDate(tx.date).toDateString();
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

// ── Realistic Gold EMV Card Chip ──────────────────────────────────────────────

function EmvChip() {
  return (
    <View style={styles.chipContainer}>
      <ExpoLinearGradient
        colors={["#E6C87C", "#C59B3F", "#A07928"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.chipInnerBorder}>
        <View style={styles.chipLineHorizontal} />
        <View style={styles.chipLineVertical} />
        <View style={styles.chipCenterPad} />
      </View>
    </View>
  );
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
  accountName,
  onSelectTransaction,
}: {
  visible: boolean;
  onClose: () => void;
  transactions: Transaction[];
  accountName?: string;
  onSelectTransaction: (t: Transaction) => void;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"Month View" | "Activity">("Month View");

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const safeTxns = useMemo(() => Array.isArray(transactions) ? transactions : [], [transactions]);

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return safeTxns;
    return safeTxns.filter((t) => {
      const title = String(t.title || "").toLowerCase();
      const cat = String(t.category || "").toLowerCase();
      const note = String(t.note || "").toLowerCase();
      return title.includes(q) || cat.includes(q) || note.includes(q);
    });
  }, [safeTxns, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      try {
        const timeA = parseLocalDate(a.date).getTime();
        const timeB = parseLocalDate(b.date).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      } catch {
        return 0;
      }
    });
  }, [filtered]);

  // Group by month
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of sorted) {
      let key = "RECENT";
      try {
        const d = parseLocalDate(tx.date);
        key = d.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }).toUpperCase();
      } catch {}
      (map.get(key) ? map.get(key)! : map.set(key, []).get(key)!).push(tx);
    }
    return Array.from(map.entries());
  }, [sorted]);

  const renderTxRow = (tx: Transaction) => {
    const icon = (CATEGORY_ICONS[tx.category] || "circle") as any;
    const catColor = CATEGORY_COLORS[tx.category] || "#2563EB";
    let dateStr = "";
    let timeStr = "";
    try {
      const d = parseLocalDate(tx.date);
      dateStr = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      timeStr = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      dateStr = String(tx.date || "");
    }
    const numAmount = typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount || 0)) || 0;
    const isIncome = tx.type === "income";

    return (
      <TouchableOpacity
        key={tx.id}
        style={styles.allTxCardRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSelectTransaction(tx);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.allTxIconWrap, { backgroundColor: catColor + "18" }]}>
          <Feather name={icon} size={18} color={catColor} />
        </View>
        <View style={styles.allTxTextWrap}>
          <Text style={styles.allTxRowTitle} numberOfLines={1}>
            {tx.title || "Transaction"}
          </Text>
          <Text style={styles.allTxRowMeta} numberOfLines={1}>
            {dateStr}{timeStr ? ` · ${timeStr}` : ""}{tx.category ? ` · ${tx.category}` : ""}
          </Text>
        </View>
        <Text style={[styles.allTxRowAmount, { color: isIncome ? "#16A34A" : "#111827" }]}>
          {isIncome ? "+" : "-"}${Math.abs(numAmount).toFixed(2)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "#F4EFE6" }}>
        {/* Header */}
        <View
          style={[
            styles.allTxHeader,
            {
              paddingTop: Platform.OS === "web" ? 16 : insets.top + 8,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            style={styles.allTxBackBtn}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={20} color="#111827" />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center", marginHorizontal: 8 }}>
            <Text style={styles.allTxHeaderTitle}>Transactions</Text>
            {!!accountName && (
              <Text style={styles.allTxHeaderSubtitle} numberOfLines={1}>
                {accountName}
              </Text>
            )}
          </View>

          <View style={styles.allTxCountBadge}>
            <Text style={styles.allTxCountText}>{filtered.length}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.allTxSearchBox}>
          <Feather name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.allTxSearchInput}
            placeholder="Search transactions..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* View mode toggle */}
        <View style={styles.allTxToggleWrap}>
          {(["Month View", "Activity"] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.allTxTogglePill,
                viewMode === v && styles.allTxTogglePillActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setViewMode(v);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.allTxToggleText,
                  viewMode === v && styles.allTxToggleTextActive,
                ]}
              >
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 32,
            paddingTop: 4,
          }}
        >
          {filtered.length === 0 ? (
            <View style={styles.allTxEmptyBox}>
              <View style={styles.allTxEmptyIconCircle}>
                <Feather name="inbox" size={28} color="#9CA3AF" />
              </View>
              <Text style={styles.allTxEmptyTitle}>No transactions</Text>
              <Text style={styles.allTxEmptySub}>
                {search ? "Try searching for something else" : "No transactions found for this account"}
              </Text>
            </View>
          ) : viewMode === "Activity" ? (
            sorted.map((tx) => renderTxRow(tx))
          ) : (
            grouped.map(([month, txns]) => (
              <View key={month}>
                <Text style={styles.allTxMonthHeader}>{month}</Text>
                {txns.map((tx) => renderTxRow(tx))}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Account Menu Sheet ────────────────────────────────────────────────────────

function AccountMenuSheet({
  visible,
  onClose,
  onEdit,
  onDelete,
  onSyncNow,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSyncNow?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <Pressable
          style={[
            styles.menuSheet,
            {
              backgroundColor: colors.card,
              paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 12,
            },
          ]}
          onPress={() => {}}
        >
          {/* Handle bar */}
          <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />

          {/* Sync Now */}
          {onSyncNow && (
            <>
              <TouchableOpacity
                style={styles.menuRow}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                  setTimeout(onSyncNow, 250);
                }}
              >
                <View style={[styles.menuRowIcon, { backgroundColor: "#2563eb22" }]}>
                  <Feather name="refresh-cw" size={20} color="#2563eb" />
                </View>
                <Text style={[styles.menuRowLabel, { color: colors.foreground }]}>
                  Sync Now
                </Text>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>

              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            </>
          )}

          {/* Edit */}
          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
              setTimeout(onEdit, 250);
            }}
          >
            <View style={[styles.menuRowIcon, { backgroundColor: "#3b82f622" }]}>
              <Feather name="edit-2" size={20} color="#3b82f6" />
            </View>
            <Text style={[styles.menuRowLabel, { color: colors.foreground }]}>
              Edit Account
            </Text>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

          {/* Delete */}
          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onClose();
              setTimeout(onDelete, 250);
            }}
          >
            <View style={[styles.menuRowIcon, { backgroundColor: "#ef444422" }]}>
              <Feather name="trash-2" size={20} color="#ef4444" />
            </View>
            <Text style={[styles.menuRowLabel, { color: "#ef4444" }]}>
              Delete Account
            </Text>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Edit Account Modal ────────────────────────────────────────────────────────

function EditAccountModal({
  visible,
  onClose,
  accountId,
}: {
  visible: boolean;
  onClose: () => void;
  accountId: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, updateAccount } = useApp();
  const account = accounts.find((a) => a.id === accountId);

  const [name, setName] = useState(account?.name ?? "");
  const [bank, setBank] = useState(account?.bank ?? "");
  const [balance, setBalance] = useState(
    account ? String(Math.abs(account.balance)) : ""
  );
  const [creditLimit, setCreditLimit] = useState(
    account?.creditLimit ? String(account.creditLimit) : ""
  );
  const [dueDate, setDueDate] = useState(account?.dueDate ?? "");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [lastFour, setLastFour] = useState(account?.lastFour ?? "");
  const [includeInNetworth, setIncludeInNetworth] = useState(
    account?.includeInNetworth !== false
  );
  const [isJoint, setIsJoint] = useState(account?.isJoint ?? false);
  const [accountHolder, setAccountHolder] = useState(account?.accountHolder ?? "");
  const [accountType, setAccountType] = useState<"checking" | "savings" | "credit" | "investment">(
    account?.type ?? "checking"
  );
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [bankSearch, setBankSearch] = useState("");

  // Reset to latest account values whenever modal opens
  React.useEffect(() => {
    if (visible && account) {
      setName(account.name);
      setBank(account.bank ?? "");
      setBalance(String(Math.abs(account.balance)));
      setCreditLimit(account.creditLimit ? String(account.creditLimit) : "");
      setDueDate(account.dueDate ?? "");
      setLastFour(account.lastFour ?? "");
      setIncludeInNetworth(account.includeInNetworth !== false);
      setIsJoint(account.isJoint ?? false);
      setAccountHolder(account.accountHolder ?? "");
      setAccountType(account.type ?? "checking");
    }
  }, [visible]);

  const filteredBanks = PLAID_BANKS.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const handleSave = () => {
    if (!name.trim() || !account) return;
    const raw = parseFloat(balance || "0");
    const rawLimit = parseFloat(creditLimit || "0");
    const newBalance = account.type === "credit" ? -Math.abs(raw) : raw;
    updateAccount(account.id, {
      name: name.trim(),
      bank: bank.trim(),
      balance: newBalance,
      lastFour: lastFour.trim() || undefined,
      creditLimit: rawLimit > 0 ? rawLimit : undefined,
      dueDate: dueDate.trim() || undefined,
      includeInNetworth,
      isJoint,
      accountHolder: accountHolder.trim() || undefined,
      type: accountType,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  if (!account) return null;

  const selectedBank = PLAID_BANKS.find((b) => b.name === bank);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.editRoot,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 12,
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.editHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.editTitle, { color: colors.foreground }]}>
            Edit Account
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!name.trim()}
            hitSlop={8}
          >
            <Text
              style={[
                styles.editSaveBtn,
                { color: name.trim() ? colors.primary : colors.mutedForeground },
              ]}
            >
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 40,
          }}
        >
          {/* Form card */}
          <View
            style={[
              styles.editCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {/* Bank picker row */}
            <TouchableOpacity
              style={styles.editRow}
              activeOpacity={0.7}
              onPress={() => { setBankSearch(""); setShowBankPicker(true); }}
            >
              {selectedBank ? (
                <>
                  <View style={[styles.formIcon, { backgroundColor: selectedBank.color + "22" }]}>
                    <Text style={{ fontSize: 17 }}>{selectedBank.icon}</Text>
                  </View>
                  <Text style={[styles.editLabel, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                    {bank}
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                    <Feather name="briefcase" size={18} color="#4a6fa5" />
                  </View>
                  <Text style={[styles.editInput, { color: bank ? colors.foreground : colors.mutedForeground }]}>
                    {bank || "Select Bank/Institution"}
                  </Text>
                </>
              )}
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={[styles.editDivider, { backgroundColor: colors.border }]} />

            {/* Account name */}
            <View style={styles.editRow}>
              <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                <Feather name="tag" size={18} color="#4a6fa5" />
              </View>
              <TextInput
                style={[styles.editInput, { color: colors.foreground }]}
                placeholder="Account Name"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={[styles.editDivider, { backgroundColor: colors.border }]} />

            {/* Balance */}
            <View style={styles.editRow}>
              <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                <Feather name="dollar-sign" size={18} color="#4a6fa5" />
              </View>
              <TextInput
                style={[styles.editInput, { color: colors.foreground }]}
                placeholder="Balance"
                placeholderTextColor={colors.mutedForeground}
                value={balance}
                onChangeText={setBalance}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.editCurrency, { color: colors.mutedForeground }]}>CAD</Text>
            </View>

            {accountType === "credit" && (
              <>
                <View style={[styles.editDivider, { backgroundColor: colors.border }]} />
                <View style={styles.editRow}>
                  <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                    <Feather name="shield" size={18} color="#4a6fa5" />
                  </View>
                  <TextInput
                    style={[styles.editInput, { color: colors.foreground }]}
                    placeholder="Credit Limit (e.g. 8000)"
                    placeholderTextColor={colors.mutedForeground}
                    value={creditLimit}
                    onChangeText={setCreditLimit}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.editCurrency, { color: colors.mutedForeground }]}>CAD</Text>
                </View>

                <View style={[styles.editDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.editRow}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                    <Feather name="calendar" size={18} color="#4a6fa5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.editInput,
                        {
                          color: dueDate ? colors.foreground : colors.mutedForeground,
                          paddingTop: Platform.OS === "android" ? 0 : 4,
                        },
                      ]}
                    >
                      {dueDate
                        ? `Payment Due: ${parseLocalDate(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : "Payment Due Date (optional)"}
                    </Text>
                  </View>
                  {dueDate ? (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setDueDate("");
                      }}
                      hitSlop={8}
                    >
                      <Feather name="x-circle" size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ) : (
                    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                  )}
                </TouchableOpacity>

                {showDatePicker && Platform.OS === "android" && (
                  <DateTimePicker
                    value={dueDate ? parseLocalDate(dueDate) : new Date()}
                    mode="date"
                    display="default"
                    onChange={(_, selectedDate) => {
                      setShowDatePicker(false);
                      if (selectedDate) setDueDate(toLocalYMD(selectedDate));
                    }}
                  />
                )}

                {showDatePicker && Platform.OS !== "android" && (
                  <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
                    <TouchableOpacity style={styles.dateSheetOverlay} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
                    <View style={styles.dateSheetWrap}>
                      <View style={[styles.dateSheetCard, { backgroundColor: colors.card }]}>
                        <View style={styles.dateSheetHeader}>
                          <Text style={[styles.dateSheetTitle, { color: colors.foreground }]}>Select Due Date</Text>
                          <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.dateSheetDoneBtn}>
                            <Text style={styles.dateSheetDoneText}>Done</Text>
                          </TouchableOpacity>
                        </View>
                        <DateTimePicker
                          value={dueDate ? parseLocalDate(dueDate) : new Date()}
                          mode="date"
                          display="inline"
                          onChange={(_, selectedDate) => {
                            if (selectedDate) setDueDate(toLocalYMD(selectedDate));
                          }}
                        />
                      </View>
                    </View>
                  </Modal>
                )}
              </>
            )}

            <View style={[styles.editDivider, { backgroundColor: colors.border }]} />

            {/* Last four */}
            <View style={styles.editRow}>
              <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                <Feather name="credit-card" size={18} color="#4a6fa5" />
              </View>
              <TextInput
                style={[styles.editInput, { color: colors.foreground }]}
                placeholder="Last 4 digits (optional)"
                placeholderTextColor={colors.mutedForeground}
                value={lastFour}
                onChangeText={(v) => setLastFour(v.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>

            <View style={[styles.editDivider, { backgroundColor: colors.border }]} />

            {/* Include in net worth */}
            <View style={styles.editRow}>
              <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                <Feather name="trending-up" size={18} color="#4a6fa5" />
              </View>
              <Text style={[styles.editLabel, { color: colors.foreground, flex: 1 }]}>
                Include in net worth
              </Text>
              <Switch
                value={includeInNetworth}
                onValueChange={setIncludeInNetworth}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.editDivider, { backgroundColor: colors.border }]} />

            {/* Joint account */}
            <View style={styles.editRow}>
              <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                <Feather name="users" size={18} color="#4a6fa5" />
              </View>
              <Text style={[styles.editLabel, { color: colors.foreground, flex: 1 }]}>
                Joint account
              </Text>
              <Switch
                value={isJoint}
                onValueChange={setIsJoint}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.editDivider, { backgroundColor: colors.border }]} />

            {/* Account holder */}
            <View style={styles.editRow}>
              <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                <Feather name="user" size={18} color="#4a6fa5" />
              </View>
              <TextInput
                style={[styles.editInput, { color: colors.foreground }]}
                placeholder="Account holder name (optional)"
                placeholderTextColor={colors.mutedForeground}
                value={accountHolder}
                onChangeText={setAccountHolder}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.editDivider, { backgroundColor: colors.border }]} />

            {/* Account type */}
            <TouchableOpacity
              style={styles.editRow}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTypePicker(true);
              }}
            >
              <View style={[styles.formIcon, { backgroundColor: "#e8f0fe" }]}>
                <Feather name="layers" size={18} color="#4a6fa5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.editLabel, { color: colors.foreground }]}>Account Type</Text>
                <Text style={[styles.editSublabel, { color: colors.mutedForeground }]}>
                  {accountType === "checking" ? "Chequing"
                    : accountType === "savings" ? "Savings"
                    : accountType === "credit" ? "Credit"
                    : "Investment"}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* Type picker sheet */}
      <Modal
        visible={showTypePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <View style={[styles.editRoot, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 20 : insets.top + 12 }]}>
          <View style={[styles.editHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowTypePicker(false)} hitSlop={8}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.editTitle, { color: colors.foreground }]}>Account Type</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
            {ACCOUNT_CATEGORIES.map((cat) => (
              <View key={cat.label} style={{ marginTop: 20 }}>
                <Text style={[styles.typePickerSection, { color: colors.mutedForeground }]}>{cat.label.toUpperCase()}</Text>
                <View style={[styles.typePickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {cat.items.map((sub: SubType, i: number) => {
                    const active = accountType === sub.type;
                    return (
                      <TouchableOpacity
                        key={sub.label}
                        activeOpacity={0.7}
                        style={[
                          styles.typePickerRow,
                          i < cat.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                          active && { backgroundColor: colors.primary + "12" },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setAccountType(sub.type);
                          setTimeout(() => setShowTypePicker(false), 180);
                        }}
                      >
                        <View style={[styles.typePickerIcon, { backgroundColor: active ? colors.primary + "22" : colors.muted }]}>
                          <Feather name={sub.icon as any} size={16} color={active ? colors.primary : colors.mutedForeground} />
                        </View>
                        <Text style={[styles.typePickerLabel, { color: active ? colors.primary : colors.foreground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                          {sub.label}
                        </Text>
                        {active && <Feather name="check" size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Bank picker sheet */}
      <Modal
        visible={showBankPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBankPicker(false)}
      >
        <View
          style={[
            styles.editRoot,
            {
              backgroundColor: colors.background,
              paddingTop: Platform.OS === "web" ? 20 : insets.top + 12,
            },
          ]}
        >
          <View style={[styles.editHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowBankPicker(false)} hitSlop={8}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.editTitle, { color: colors.foreground }]}>
              Select Bank
            </Text>
            <View style={{ width: 22 }} />
          </View>

          <View
            style={[
              styles.editPickerSearch,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.editInput, { flex: 1 }]}
              placeholder="Search banks…"
              placeholderTextColor={colors.mutedForeground}
              value={bankSearch}
              onChangeText={setBankSearch}
              autoFocus
              clearButtonMode="while-editing"
            />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 24,
            }}
          >
            <View
              style={[
                styles.editCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {filteredBanks.length === 0 && (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                    No banks found
                  </Text>
                </View>
              )}
              {filteredBanks.map((b, idx) => (
                <View key={b.id}>
                  <TouchableOpacity
                    style={styles.editRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setBank(b.name);
                      setShowBankPicker(false);
                    }}
                  >
                    <View style={[styles.formIcon, { backgroundColor: b.color + "22", width: 44, height: 44, borderRadius: 22 }]}>
                      <Text style={{ fontSize: 20 }}>{b.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.editLabel, { color: colors.foreground }]}>{b.name}</Text>
                      <Text style={[styles.editSublabel, { color: colors.mutedForeground }]}>
                        {b.accountTypes.map((t) =>
                          t === "checking" ? "Chequing"
                          : t === "savings" ? "Savings"
                          : t === "credit" ? "Credit"
                          : "Investment"
                        ).join(" · ")}
                      </Text>
                    </View>
                    {bank === b.name && (
                      <Feather name="check-circle" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                  {idx < filteredBanks.length - 1 && (
                    <View style={[styles.editDivider, { backgroundColor: colors.border, marginLeft: 72 }]} />
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

function getCategoryDisplay(account: Account) {
  const group = getAccountGroupKey(account);
  const text = `${account.name} ${account.bank || ""}`.toLowerCase();
  if (group === "checking") {
    return { title: "Chequing", subtitle: "Your everyday banking accounts", label: "Available balance", institution: "RBC Royal Bank" };
  }
  if (group === "savings") {
    return { title: "Savings", subtitle: "Build your future", label: "Available balance", institution: "Tangerine Bank" };
  }
  if (group === "mortgage" || text.includes("mortgage")) {
    return { title: "Mortgage", subtitle: "Property financing & equity", label: "Remaining balance", institution: "Mortgage" };
  }
  if (group === "credit") {
    return { title: "Credit Cards", subtitle: "Track your spending", label: "Current balance", institution: "American Express" };
  }
  return { title: "Other Accounts", subtitle: "Investments, loans & more", label: "Total value", institution: "Wealthsimple" };
}

function getDetailCardMeta(account: Account) {
  const shortBank = getShortBankName(account.bank, account.name);
  const text = `${account.name} ${account.bank || ""}`.toLowerCase();
  const group = getAccountGroupKey(account);

  if (shortBank === "RBC" || text.includes("rbc") || (group === "checking" && !text.includes("tangerine") && !text.includes("cibc") && !text.includes("td"))) {
    return {
      gradient: ["#1E3A8A", "#2563EB"],
      badgeBg: "#1D4ED8",
      badgeText: "RBC",
      badgeColor: "#FDE047",
      institution: "RBC",
    };
  }
  if (group === "mortgage" || text.includes("mortgage")) {
    return {
      gradient: ["#1E293B", "#334155"],
      badgeBg: "#475569",
      badgeText: shortBank !== "Bank" ? shortBank.slice(0, 4).toUpperCase() : "MTG",
      badgeColor: "#FFFFFF",
      institution: shortBank !== "Bank" ? shortBank : "Mortgage",
    };
  }
  if (shortBank === "Tangerine" || text.includes("tangerine") || group === "savings") {
    return {
      gradient: ["#065F46", "#0D9488"],
      badgeBg: "#F97316",
      badgeText: "TNG",
      badgeColor: "#FFFFFF",
      institution: "Tangerine",
    };
  }
  if (group === "credit" || text.includes("amex") || text.includes("platinum") || text.includes("avion") || text.includes("visa")) {
    return {
      gradient: ["#18181B", "#27272A"],
      badgeBg: "#0284C7",
      badgeText: shortBank !== "Bank" ? shortBank.slice(0, 4).toUpperCase() : (text.includes("amex") ? "AMEX" : "CARD"),
      badgeColor: "#FFFFFF",
      institution: shortBank !== "Bank" ? shortBank : "Credit Card",
    };
  }
  if (group === "investment" || text.includes("wealthsimple")) {
    return {
      gradient: ["#4C1D95", "#7C3AED"],
      badgeBg: "#FFFFFF",
      badgeText: "WS",
      badgeColor: "#1E1B18",
      institution: "Wealthsimple",
    };
  }
  return {
    gradient: ["#1E3A8A", "#2563EB"],
    badgeBg: "#1D4ED8",
    badgeText: shortBank.slice(0, 4).toUpperCase(),
    badgeColor: "#FFFFFF",
    institution: shortBank,
  };
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, transactions, investmentTransactions, updateAccount, deleteAccount, plaidSync, syncPlaidTransactions, reconnectPlaidItem, isSyncing, bills } = useApp();

  const account = accounts.find((a) => a.id === id);
  const accountTxns = useMemo(
    () =>
      transactions
        .filter((t) => account ? txBelongsToAccount(t, account) : t.accountId === id)
        .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()),
    [transactions, id, account]
  );

  const liveBalance = account ? computeBalance(account, accountTxns) : 0;

  const history = useMemo(
    () =>
      account
        ? buildBalanceHistory(liveBalance, accountTxns, 30)
        : [],
    [account, accountTxns, liveBalance]
  );

  const accountInvTxns = useMemo(
    () =>
      investmentTransactions
        .filter((t) =>
          t.accountId === id ||
          (account?.plaidAccountId && t.plaidAccountId === account.plaidAccountId)
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [investmentTransactions, id, account]
  );

  const [txOpen, setTxOpen] = useState(true);
  const [invTxOpen, setInvTxOpen] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showAllTx, setShowAllTx] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [syncDoneBanner, setSyncDoneBanner] = useState(false);
  const [showPlaidRelink, setShowPlaidRelink] = useState(false);
  const [relinkTargetItem, setRelinkTargetItem] = useState<{ itemId: string; bankName: string } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [accountSyncTime, setAccountSyncTime] = useState<string | null>(null);

  // Live timer ticking every 15s to keep relative sync time dynamically updated
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const plaidItem = useMemo(() => {
    if (!account) return null;
    if (account.plaidItemId) {
      const match = plaidSync.items.find((i) => i.itemId === account.plaidItemId);
      if (match) return match;
    }
    const byAccId = plaidSync.items.find((i) => i.accountIds?.includes(account.id));
    if (byAccId) return byAccId;

    const byMap = plaidSync.items.find((i) => {
      if (!i.plaidAccountMap) return false;
      return (
        Object.values(i.plaidAccountMap).includes(account.id) ||
        (account.plaidAccountId && i.plaidAccountMap[account.plaidAccountId] === account.id)
      );
    });
    if (byMap) return byMap;

    if (account.bank) {
      const byBank = plaidSync.items.find(
        (i) => i.bankName.toLowerCase() === account.bank.toLowerCase()
      );
      if (byBank) return byBank;
    }

    return null;
  }, [account, plaidSync.items]);

  // Load or initialize sync timestamp for this account
  useEffect(() => {
    if (!account?.id) return;
    const storageKey = `@fintrack/card_last_sync_${account.id}`;
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (saved) {
        setAccountSyncTime(saved);
      } else if (plaidItem?.lastSynced) {
        setAccountSyncTime(plaidItem.lastSynced);
      } else {
        const initial = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        setAccountSyncTime(initial);
        AsyncStorage.setItem(storageKey, initial);
      }
    });
  }, [account?.id, plaidItem?.lastSynced]);

  if (!account) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
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

  const catDisplay = getCategoryDisplay(account);
  const cardMeta = getDetailCardMeta(account);
  const hasSyncError = plaidItem?.needsRelogin || plaidItem?.syncError;
  const recentTxns = accountTxns.slice(0, 8);

  const group = getAccountGroupKey(account);
  const textLower = `${account.name || ""} ${account.bank || ""}`.toLowerCase();
  const isMortgage = group === "mortgage" || textLower.includes("mortgage");
  const isCredit =
    !isMortgage &&
    (account.type === "credit" ||
    group === "credit" ||
    textLower.includes("credit") ||
    textLower.includes("card") ||
    textLower.includes("visa") ||
    textLower.includes("mastercard") ||
    textLower.includes("amex") ||
    textLower.includes("avion") ||
    textLower.includes("cobalt"));

  // Credit card specific fields
  const creditLimit = account.creditLimit || 8000;
  const currentCcBalance = Math.abs(liveBalance);
  const availableCredit = Math.max(0, creditLimit - currentCcBalance);
  const utilizationPct = Math.min(100, Math.round((currentCcBalance / creditLimit) * 100));

  let ccNetwork = "VISA";
  if (textLower.includes("mastercard") || textLower.includes("mc")) {
    ccNetwork = "MASTERCARD";
  } else if (textLower.includes("amex") || textLower.includes("american express")) {
    ccNetwork = "AMEX";
  } else if (textLower.includes("discover")) {
    ccNetwork = "DISCOVER";
  }

  const ccBankName = getShortBankName(account.bank, account.name);

  const linkedBill = bills?.find(
    (b) =>
      (b.accountId === account.id ||
        (account.name && b.title.toLowerCase().includes(account.name.toLowerCase())) ||
        (account.bank && b.title.toLowerCase().includes(account.bank.toLowerCase()))) &&
      !b.isPaid
  );

  let dueLabel = "Due Oct 4";
  let dueAmount = currentCcBalance;
  if (account.dueDate) {
    try {
      const d = parseLocalDate(account.dueDate);
      dueLabel = `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    } catch {}
  } else if (linkedBill) {
    try {
      const d = parseLocalDate(linkedBill.dueDate);
      dueLabel = `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      dueAmount = linkedBill.amount;
    } catch {}
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    dueLabel = `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }

  // Dynamic relative sync time formatting - pick the freshest timestamp
  const effectiveSyncIso = useMemo(() => {
    if (isSyncing) return null;
    const candidates: number[] = [];
    if (accountSyncTime) {
      const t = new Date(accountSyncTime).getTime();
      if (!isNaN(t)) candidates.push(t);
    }
    if (plaidItem?.lastSynced) {
      const t = new Date(plaidItem.lastSynced).getTime();
      if (!isNaN(t)) candidates.push(t);
    }
    if (candidates.length === 0) return null;
    return new Date(Math.max(...candidates)).toISOString();
  }, [isSyncing, accountSyncTime, plaidItem?.lastSynced]);

  const lastSyncText = isSyncing
    ? "Syncing now…"
    : (() => {
        if (!effectiveSyncIso) return "Not synced yet";
        const t = new Date(effectiveSyncIso).getTime();
        if (isNaN(t)) return "Not synced yet";
        const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
        if (diffSec < 45) return "Just now";
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin} min ago`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return diffHrs === 1 ? "1 hour ago" : `${diffHrs} hours ago`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;
        return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      })();

  const connectionBankName = plaidItem?.bankName ? getShortBankName(plaidItem.bankName) : ccBankName;

  let connectionStatusText = "Healthy";
  let connectionStatusColor = "#10B981";

  if (isSyncing) {
    connectionStatusText = "Syncing…";
    connectionStatusColor = "#2563EB";
  } else if (plaidItem?.needsRelogin) {
    connectionStatusText = `Needs reconnect (${connectionBankName})`;
    connectionStatusColor = "#F59E0B";
  } else if (hasSyncError || plaidItem?.syncError) {
    connectionStatusText = `Error (${connectionBankName})`;
    connectionStatusColor = "#EF4444";
  } else if (!plaidItem && !account.plaidItemId && !accountSyncTime) {
    connectionStatusText = "Not connected";
    connectionStatusColor = "#6B7280";
  }

  const cardErrorLabel = plaidItem?.needsRelogin
    ? "Needs reconnect"
    : (hasSyncError || plaidItem?.syncError)
    ? (plaidItem?.syncError?.toLowerCase().includes("login") || plaidItem?.syncError?.toLowerCase().includes("reconnect")
        ? "Needs reconnect"
        : "Needs review")
    : null;

  const handleReconnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const targetItemId = account.plaidItemId || plaidItem?.itemId || (accounts.find((a) => a.bank === account.bank && a.plaidItemId)?.plaidItemId);
    const targetBank = plaidItem?.bankName || account.bank || connectionBankName || "Bank";
    if (targetItemId) {
      setRelinkTargetItem({ itemId: targetItemId, bankName: targetBank });
      setShowPlaidRelink(true);
    } else {
      Alert.alert(
        "Connection Info",
        `Could not find an active Plaid connection for ${connectionBankName}. To connect or update this bank, tap "Connect Bank" in the Accounts tab.`
      );
    }
  };

  const handleSyncNow = async () => {
    if (isSyncing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newTimestamp = new Date().toISOString();
    setAccountSyncTime(newTimestamp);
    setNowMs(Date.now());
    if (account?.id) {
      await AsyncStorage.setItem(`@fintrack/card_last_sync_${account.id}`, newTimestamp);
    }
    const targetItemId = account?.plaidItemId || plaidItem?.itemId;
    try {
      if (targetItemId) {
        await syncPlaidTransactions(targetItemId, true);
      } else if (plaidSync?.items?.length) {
        for (const item of plaidSync.items) {
          await syncPlaidTransactions(item.itemId, true);
        }
      }
    } catch {}
    setSyncDoneBanner(true);
    setTimeout(() => setSyncDoneBanner(false), 2500);
  };

  const displaySubname = useMemo(() => {
    const cleaned = cleanCardDisplayName(account.name, ccBankName, account.type, ccNetwork);
    if (cleaned && cleaned.toLowerCase() !== "credit card") {
      return cleaned;
    }
    if (account.type === "checking") return "Chequing";
    if (account.type === "savings") return "Savings";
    if (account.type === "investment") return "Investment";
    return account.name || "Account";
  }, [account, ccBankName, ccNetwork]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.container, { backgroundColor: "#F4EFE6" }]}
    >
      {/* ── Navigation Header ── */}
      <View
        style={[
          styles.ccNavHeader,
          { paddingTop: Platform.OS === "web" ? 24 : insets.top ? 8 : 12 },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.ccCircleBackBtn}
          hitSlop={10}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={22} color="#111827" />
        </TouchableOpacity>

        <Text style={styles.ccNavTitle} numberOfLines={1}>
          {displaySubname}
        </Text>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowMenu(true);
          }}
          style={styles.ccCircleDotsBtn}
          hitSlop={10}
          activeOpacity={0.7}
        >
          <Feather name="more-vertical" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 36,
        }}
      >
        {/* ── Physical Card Widget ── */}
        <View style={styles.ccCardContainer}>
          <ExpoLinearGradient
            colors={["#2C221C", "#1D1613", "#14100D"]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Top row: Bank + Gold EMV Chip on Right Top */}
          <View style={styles.ccTopRow}>
            <Text style={styles.ccBankText} numberOfLines={1}>{ccBankName.toUpperCase()}</Text>
            <EmvChip />
          </View>

          {/* Middle: Card Network / Brand / Subtype + Balance */}
          <Text style={styles.ccSubnameText} numberOfLines={1}>
            {displaySubname}
          </Text>
          <Text style={styles.ccBalanceText}>
            {liveBalance < 0 ? "-" : ""}${Math.abs(liveBalance).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          {/* Bottom row: Last 4 + Limit (Credit card only) or Needs Reconnect */}
          <View style={styles.ccBottomRow}>
            <Text style={styles.ccLastFourText}>•••• {account.lastFour || (account.name.match(/\d{4}$/) ? account.name.match(/\d{4}$/)![0] : "4242")}</Text>
            {cardErrorLabel ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleReconnect}
                style={styles.cardNeedsReconnectBadge}
              >
                <Feather name="alert-triangle" size={11} color="#FBBF24" />
                <Text style={styles.cardNeedsReconnectText}>{cardErrorLabel}</Text>
              </TouchableOpacity>
            ) : isCredit ? (
              <Text style={styles.ccLimitText}>Limit ${creditLimit.toLocaleString("en-US")}</Text>
            ) : null}
          </View>

          {/* Progress Bar for Utilization (Credit card only) */}
          {isCredit && (
            <View style={styles.ccProgressTrack}>
              <View
                style={[
                  styles.ccProgressFill,
                  cardErrorLabel ? { backgroundColor: "#F59E0B" } : null,
                  { width: `${Math.max(2, Math.min(100, utilizationPct))}%` },
                ]}
              />
            </View>
          )}
        </View>

        {/* ── 3 Stat Boxes Row (Credit card only) ── */}
        {isCredit && (
          <View style={styles.ccThreeBoxesRow}>
            {/* Box 1: Available */}
            <View style={styles.ccStatBox}>
              <Text style={styles.ccStatBoxLabel}>Available</Text>
              <Text style={styles.ccStatBoxValue} numberOfLines={1}>
                ${availableCredit.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            {/* Box 2: Used */}
            <View style={styles.ccStatBox}>
              <Text style={styles.ccStatBoxLabel}>Used</Text>
              <Text style={styles.ccStatBoxValue}>{utilizationPct}%</Text>
            </View>

            {/* Box 3: Due Date */}
            <View style={styles.ccStatBox}>
              <Text style={styles.ccStatBoxLabel}>{dueLabel}</Text>
              <Text style={styles.ccStatBoxValue} numberOfLines={1}>
                ${dueAmount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          </View>
        )}

        {/* ── Information & Connection Card ── */}
        <View style={styles.ccInfoCard}>
          <View style={styles.ccInfoRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.ccInfoLabel}>Last Plaid sync</Text>
              <Text style={styles.ccInfoTime}>{lastSyncText}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.ccSyncNowBtn,
                syncDoneBanner && styles.ccSyncNowBtnSuccess,
                isSyncing && { opacity: 0.8 },
              ]}
              onPress={handleSyncNow}
              disabled={isSyncing}
              activeOpacity={0.7}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : syncDoneBanner ? (
                <Feather name="check" size={13} color="#16A34A" />
              ) : (
                <Feather name="refresh-cw" size={13} color="#2563EB" />
              )}
              <Text
                style={[
                  styles.ccSyncNowText,
                  syncDoneBanner && styles.ccSyncNowTextSuccess,
                ]}
              >
                {isSyncing ? "Syncing…" : syncDoneBanner ? "Synced!" : "Sync now"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.ccInfoDivider} />

          <View style={styles.ccInfoRow}>
            <Text style={styles.ccInfoLabel}>Connection</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={[styles.ccStatusDot, { backgroundColor: connectionStatusColor }]} />
              <Text style={[styles.ccInfoValue, { color: connectionStatusColor }]}>
                {connectionStatusText}
              </Text>
            </View>
          </View>

          {!!plaidItem?.syncError && (
            <View
              style={{
                marginTop: 10,
                padding: 10,
                backgroundColor: "#FEF2F2",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#FECACA",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Feather name="alert-triangle" size={16} color="#DC2626" />
              <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "500", flex: 1 }}>
                {connectionBankName}: {plaidItem.syncError}
              </Text>
            </View>
          )}
        </View>

        {/* ── View Transactions Link Button (below Connection) ── */}
        <TouchableOpacity
          style={styles.ccViewTxBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowAllTx(true);
          }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.ccTxIconCircle}>
              <Feather name="list" size={18} color="#111827" />
            </View>
            <Text style={styles.ccViewTxText}>View transactions</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#6B7280" />
        </TouchableOpacity>

        {/* ── Include in Networth toggle ── */}
        <TouchableOpacity
          style={styles.ccNetworthRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            updateAccount(account.id, {
              includeInNetworth: account.includeInNetworth === false ? true : false,
            });
          }}
          activeOpacity={0.8}
        >
          <View style={styles.ccNetworthIcon}>
            <Feather name="trending-up" size={18} color="#111827" />
          </View>
          <Text style={styles.ccNetworthLabel}>Include in Networth</Text>
          <Switch
            value={isIncludedInNetworth(account)}
            onValueChange={(val) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateAccount(account.id, { includeInNetworth: val });
            }}
            trackColor={{ false: "#D1D5DB", true: "#111827" }}
            thumbColor="#FFFFFF"
          />
        </TouchableOpacity>

        {/* ── Action Buttons & Disconnect Account at the End ── */}
        <View style={styles.ccBtnGroup}>
          {(connectionStatusText.startsWith("Needs reconnect") || connectionStatusText.startsWith("Error")) && (
            <TouchableOpacity
              style={styles.ccReconnectBtn}
              activeOpacity={0.8}
              onPress={handleReconnect}
            >
              <Feather name="refresh-cw" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.ccReconnectBtnText}>Reconnect {connectionBankName}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.ccDisconnectBtn}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowDeleteConfirm(true);
            }}
          >
            <Text style={styles.ccDisconnectBtnText}>Disconnect account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Floating Add Button ── */}
      <TouchableOpacity
        style={styles.ccFab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAddTx(true);
        }}
        activeOpacity={0.8}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Shared Modals ── */}
      <TransactionDetailModal
        visible={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
      />

      <AllTransactionsModal
        visible={showAllTx}
        onClose={() => setShowAllTx(false)}
        transactions={accountTxns}
        accountName={account.name}
        onSelectTransaction={(tx) => {
          setShowAllTx(false);
          setTimeout(() => setSelectedTx(tx), 350);
        }}
      />

      <AddEntrySheet
        visible={showAddTx}
        initialTab="EXPENSE"
        onClose={() => setShowAddTx(false)}
      />

      <AccountMenuSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onEdit={() => setShowEdit(true)}
        onDelete={() => {
          setShowMenu(false);
          setTimeout(() => setShowDeleteConfirm(true), 150);
        }}
        onSyncNow={handleSyncNow}
      />

      <EditAccountModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        accountId={id!}
      />

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Disconnect Account"
        message={`Are you sure you want to disconnect "${account.name}"? This cannot be undone.`}
        confirmLabel="Disconnect"
        confirmDestructive
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteAccount(id!);
          setTimeout(() => router.back(), 80);
        }}
      />

      {showPlaidRelink && relinkTargetItem && (
        <PlaidLinkModal
          onClose={() => {
            setShowPlaidRelink(false);
            const updatedItemId = relinkTargetItem?.itemId;
            setRelinkTargetItem(null);
            if (updatedItemId) {
              syncPlaidTransactions(updatedItemId, true).catch(() => {});
            }
            const newTimestamp = new Date().toISOString();
            setAccountSyncTime(newTimestamp);
            setNowMs(Date.now());
            if (account?.id) {
              AsyncStorage.setItem(`@fintrack/card_last_sync_${account.id}`, newTimestamp).catch(() => {});
            }
          }}
          relinkItemId={relinkTargetItem.itemId}
          relinkBankName={relinkTargetItem.bankName}
        />
      )}
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
  accountMeta: { alignItems: "center", gap: 8, marginTop: 2 },
  accountMetaBank: { fontSize: 13, fontFamily: "Inter_400Regular" },
  accountCardChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  accountCardNumber: { fontSize: 14, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  accountTypePill: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
  },
  accountTypeLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },

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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  allTxBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  allTxHeaderTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  allTxHeaderSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    marginTop: 1,
  },
  allTxCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  allTxCountText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
  },
  allTxSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  allTxSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    padding: 0,
  },
  allTxToggleWrap: {
    flexDirection: "row",
    backgroundColor: "#E7E2D9",
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 3,
  },
  allTxTogglePill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 18,
    alignItems: "center",
  },
  allTxTogglePillActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  allTxToggleText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
  },
  allTxToggleTextActive: {
    color: "#111827",
  },
  allTxMonthHeader: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#6B7280",
    letterSpacing: 0.8,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 6,
  },
  allTxCardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  allTxIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  allTxTextWrap: {
    flex: 1,
    gap: 2,
    marginRight: 8,
  },
  allTxRowTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  allTxRowMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  allTxRowAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  allTxEmptyBox: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 18,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  allTxEmptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  allTxEmptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginBottom: 4,
  },
  allTxEmptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
  },

  // Not found
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backLink: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Account menu sheet
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  menuHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 20,
  },
  menuRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, gap: 14,
  },
  menuRowIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  menuRowLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },
  menuDivider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },

  // Edit account modal
  editRoot: { flex: 1 },
  editHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  editSaveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  editCard: {
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  editRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 12, minHeight: 54,
  },
  editDivider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  formIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  editLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  editSublabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  editInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  editCurrency: { fontSize: 13, fontFamily: "Inter_500Medium" },
  editPickerSearch: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginVertical: 12,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  typePickerSection: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8, marginBottom: 6, marginLeft: 4,
  },
  typePickerCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  typePickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  typePickerIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  typePickerLabel: { flex: 1, fontSize: 15 },

  // Category Header (Screens 2-5)
  catHeaderSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  catTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  catSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 2,
  },

  // Stacked 3D Card Deck
  deckWrap: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  deckLayerBehind: {
    width: "92%",
    height: 18,
    alignSelf: "center",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: -10,
    zIndex: 1,
  },
  deckMainCard: {
    borderRadius: 22,
    overflow: "hidden",
    padding: 20,
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  deckCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deckBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deckBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  deckCardName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  deckCardLastFour: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginTop: 1,
  },
  deckBalanceRow: {
    marginVertical: 20,
  },
  deckBalanceText: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  deckBalanceLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  deckCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deckSyncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  greenSyncDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#22C55E",
  },
  deckSyncText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  deckArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Screen 12: Sync Error Card
  syncErrorCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  syncErrorTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  syncErrorIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  syncErrorTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#DC2626",
  },
  syncErrorDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#4B5563",
    marginTop: 3,
    lineHeight: 16,
  },
  syncErrorLastDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 10,
  },
  syncErrorBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  syncRetryBtn: {
    flex: 1,
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  syncRetryBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  syncDetailsBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  syncDetailsBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },

  // Screen 11: Fresh Status Card
  freshStatusWrap: {
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  freshBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  freshCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  freshBannerTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#15803D",
  },
  freshBannerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#16A34A",
  },
  syncStatusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
  },
  syncStatusHeading: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
    marginBottom: 2,
  },
  statusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  statusDotGrey: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#9CA3AF",
  },
  syncStatusMetaLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  syncStatusMetaVal: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#111827",
  },
  syncNowActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
  },
  syncNowActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
  },

  // Account Details Card
  detailsCardSection: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  detailsSectionHeading: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
    marginBottom: 10,
  },
  detailsCardBody: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  detailsRowLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  detailsRowValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  detailsRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  greenSyncDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },

  // View Transactions Link
  viewTxLinkBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  viewTxLinkText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
  },

  // ── Credit Card Screen Styles ──
  ccNavHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  ccCircleBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  ccNavTitle: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    textAlign: "center",
    flex: 1,
    marginHorizontal: 12,
  },
  ccCircleDotsBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  ccCardContainer: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 22,
    padding: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  ccTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  ccBankText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#D1D5DB",
    letterSpacing: 1.5,
    flexShrink: 1,
  },
  dateSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  dateSheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "flex-end",
  },
  dateSheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  dateSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dateSheetTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  dateSheetDoneBtn: {
    backgroundColor: "#18181B",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dateSheetDoneText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  chipContainer: {
    width: 38,
    height: 26,
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255, 230, 150, 0.35)",
  },
  chipInnerBorder: {
    width: 30,
    height: 19,
    borderWidth: 0.6,
    borderColor: "rgba(100, 75, 20, 0.22)",
    borderRadius: 4,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  chipLineHorizontal: {
    position: "absolute",
    width: "100%",
    height: 0.6,
    backgroundColor: "rgba(100, 75, 20, 0.18)",
  },
  chipLineVertical: {
    position: "absolute",
    height: "100%",
    width: 0.6,
    backgroundColor: "rgba(100, 75, 20, 0.18)",
  },
  chipCenterPad: {
    width: 12,
    height: 8,
    borderRadius: 2,
    borderWidth: 0.6,
    borderColor: "rgba(100, 75, 20, 0.22)",
    backgroundColor: "rgba(255, 235, 170, 0.12)",
  },
  ccSubnameText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginTop: 22,
  },
  ccBalanceText: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  ccBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
  },
  ccLastFourText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  ccLimitText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#D1D5DB",
  },
  cardNeedsReconnectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.45)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  cardNeedsReconnectText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#FBBF24",
    letterSpacing: 0.2,
  },
  ccProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
    marginTop: 10,
  },
  ccProgressFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  ccThreeBoxesRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
  },
  ccStatBox: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  ccStatBoxLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    marginBottom: 6,
  },
  ccStatBoxValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  ccInfoCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  ccInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
  },
  ccInfoLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#374151",
  },
  ccInfoTime: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
    marginTop: 2,
  },
  ccInfoValue: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  ccSyncNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  ccSyncNowBtnSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  ccSyncNowText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
  },
  ccSyncNowTextSuccess: {
    color: "#16A34A",
  },
  ccInfoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#F3F4F6",
  },
  ccStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ccBtnGroup: {
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  ccSimulateBtn: {
    backgroundColor: "#EAE6DF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ccSimulateBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#1F2937",
  },
  ccReconnectBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  ccReconnectBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  ccDisconnectBtn: {
    backgroundColor: "#C84638",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ccDisconnectBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  ccViewTxBtn: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  ccTxIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  ccViewTxText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  ccRecentSection: {
    marginTop: 20,
    marginHorizontal: 16,
  },
  ccRecentHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  ccRecentTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  ccSeeAllText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
  },
  ccEmptyTxBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: "center",
    gap: 8,
  },
  ccEmptyTxText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
  },
  ccTxListBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  ccTxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    gap: 12,
  },
  ccTxIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  ccTxTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  ccTxDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  ccTxAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  ccTxDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#F3F4F6",
  },
  ccNetworthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  ccNetworthIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  ccNetworthLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  ccFab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
