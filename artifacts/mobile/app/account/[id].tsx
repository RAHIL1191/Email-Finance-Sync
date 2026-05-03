import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
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
  Stop,
  Svg,
  Text as SvgText,
} from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AddEntrySheet from "@/components/AddEntrySheet";
import ConfirmModal from "@/components/ConfirmModal";
import TransactionDetailModal from "@/components/TransactionDetailModal";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/components/TransactionItem";
import { ACCOUNT_CATEGORIES, SubType } from "@/components/AddAccountModal";
import { PLAID_BANKS, Transaction, useApp } from "@/context/AppContext";
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

// ── Account Menu Sheet ────────────────────────────────────────────────────────

function AccountMenuSheet({
  visible,
  onClose,
  onEdit,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
  const [lastFour, setLastFour] = useState(account?.lastFour ?? "");
  const [includeInNetworth, setIncludeInNetworth] = useState(
    account?.includeInNetworth !== false
  );
  const [isJoint, setIsJoint] = useState(account?.isJoint ?? false);
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
      setLastFour(account.lastFour ?? "");
      setIncludeInNetworth(account.includeInNetworth !== false);
      setIsJoint(account.isJoint ?? false);
      setAccountType(account.type ?? "checking");
    }
  }, [visible]);

  const filteredBanks = PLAID_BANKS.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const handleSave = () => {
    if (!name.trim() || !account) return;
    const raw = parseFloat(balance || "0");
    const newBalance = account.type === "credit" ? -Math.abs(raw) : raw;
    updateAccount(account.id, {
      name: name.trim(),
      bank: bank.trim(),
      balance: newBalance,
      lastFour: lastFour.trim() || undefined,
      includeInNetworth,
      isJoint,
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
  const { accounts, transactions, updateAccount, deleteAccount } = useApp();

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
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
          <TouchableOpacity
            hitSlop={8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowMenu(true);
            }}
          >
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
          <View style={styles.accountMeta}>
            {account.bank ? (
              <Text style={[styles.accountMetaBank, { color: colors.mutedForeground }]}>
                {account.bank}
              </Text>
            ) : null}
            {account.lastFour ? (
              <View style={[styles.accountCardChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="credit-card" size={12} color={colors.mutedForeground} />
                <Text style={[styles.accountCardNumber, { color: colors.foreground }]}>
                  •••• {account.lastFour}
                </Text>
              </View>
            ) : null}
            <View style={[styles.accountTypePill, { backgroundColor: account.color + "22" }]}>
              <Text style={[styles.accountTypeLabel, { color: account.color }]}>
                {account.type === "checking" ? "Chequing"
                  : account.type === "savings" ? "Savings"
                  : account.type === "credit" ? "Credit"
                  : "Investment"}
              </Text>
            </View>
          </View>
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
      />

      <EditAccountModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        accountId={id!}
      />

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Account"
        message={`Are you sure you want to delete "${account?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmDestructive
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteAccount(id!);
          setTimeout(() => router.back(), 80);
        }}
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
});
