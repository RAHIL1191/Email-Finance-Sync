import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Transaction, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = [
  "Income", "Food", "Groceries", "Shopping", "Transport",
  "Entertainment", "Housing", "Utilities", "Health", "Insurance", "Other",
];

const CATEGORY_ICONS: Record<string, string> = {
  Income: "arrow-down-circle",
  Shopping: "shopping-bag",
  Food: "coffee",
  Groceries: "shopping-cart",
  Entertainment: "play-circle",
  Transport: "navigation",
  Housing: "home",
  Utilities: "zap",
  Health: "activity",
  Insurance: "shield",
  Other: "circle",
};

interface Props {
  visible: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

export default function TransactionDetailModal({ visible, onClose, transaction }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, updateTransaction, deleteTransaction } = useApp();

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("Other");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (transaction) {
      setTitle(transaction.title);
      setAmount(String(transaction.amount));
      setType(transaction.type);
      setCategory(transaction.category);
      setAccountId(transaction.accountId);
      setNote(transaction.note || "");
      setEditing(false);
    }
  }, [transaction]);

  if (!transaction) return null;

  const account = accounts.find((a) => a.id === transaction.accountId);
  const isIncome = transaction.type === "income";
  const icon = CATEGORY_ICONS[transaction.category] || "circle";

  const dateObj = new Date(transaction.date);
  const dateStr = dateObj.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = dateObj.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  const handleSave = () => {
    const parsed = parseFloat(amount);
    if (!title.trim() || isNaN(parsed) || parsed <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTransaction(transaction.id, {
      title: title.trim(),
      amount: parsed,
      type,
      category,
      accountId,
      note: note.trim() || undefined,
    });
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Transaction",
      `Remove "${transaction.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteTransaction(transaction.id);
            onClose();
          },
        },
      ]
    );
  };

  const pb = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: pb }]}>
            {/* Handle */}
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={[s.header, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[s.headerTitle, { color: colors.foreground }]}>
                {editing ? "Edit Transaction" : "Transaction"}
              </Text>
              {editing ? (
                <TouchableOpacity onPress={handleSave} hitSlop={8}>
                  <Text style={[s.saveText, { color: colors.primary }]}>Save</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.headerActions}>
                  <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
                    <Feather name="edit-2" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDelete} hitSlop={8}>
                    <Feather name="trash-2" size={18} color={colors.expense ?? "#ef4444"} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, gap: 20, paddingBottom: 8 }}
            >
              {editing ? (
                <>
                  {/* Type toggle */}
                  <View style={s.typeRow}>
                    {(["expense", "income"] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[s.typeBtn, { backgroundColor: type === t ? (t === "income" ? "#10b981" : "#ef4444") : colors.muted }]}
                        onPress={() => setType(t)}
                      >
                        <Text style={[s.typeBtnText, { color: type === t ? "#fff" : colors.mutedForeground }]}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Amount */}
                  <View style={s.amountRow}>
                    <Text style={[s.currencySymbol, { color: colors.primary }]}>$</Text>
                    <TextInput
                      style={[s.amountInput, { color: colors.foreground }]}
                      keyboardType="decimal-pad"
                      value={amount}
                      onChangeText={setAmount}
                    />
                  </View>

                  {/* Title */}
                  <View style={s.field}>
                    <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                      value={title}
                      onChangeText={setTitle}
                      placeholder="What was this for?"
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>

                  {/* Category */}
                  <View style={s.field}>
                    <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
                        {CATEGORIES.map((c) => (
                          <TouchableOpacity
                            key={c}
                            style={[s.chip, { backgroundColor: category === c ? colors.primary : colors.muted }]}
                            onPress={() => setCategory(c)}
                          >
                            <Text style={[s.chipText, { color: category === c ? "#fff" : colors.mutedForeground }]}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  {/* Account */}
                  <View style={s.field}>
                    <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Account</Text>
                    {accounts.map((a) => (
                      <TouchableOpacity
                        key={a.id}
                        style={[s.accountOption, { backgroundColor: accountId === a.id ? colors.accent : colors.background, borderColor: accountId === a.id ? colors.primary : colors.border }]}
                        onPress={() => setAccountId(a.id)}
                      >
                        <View style={[s.accountDot, { backgroundColor: a.color }]} />
                        <Text style={[s.accountOptionText, { color: colors.foreground }]}>{a.name}</Text>
                        {accountId === a.id && <Feather name="check" size={16} color={colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Note */}
                  <View style={s.field}>
                    <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Note (optional)</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                      value={note}
                      onChangeText={setNote}
                      placeholder="Add a note..."
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </>
              ) : (
                <>
                  {/* Amount hero */}
                  <View style={s.amountHero}>
                    <View style={[s.iconCircle, { backgroundColor: isIncome ? "#10b98118" : "#ef444418" }]}>
                      <Feather name={icon as any} size={28} color={isIncome ? "#10b981" : "#ef4444"} />
                    </View>
                    <Text style={[s.heroAmount, { color: isIncome ? "#10b981" : "#ef4444" }]}>
                      {isIncome ? "+" : "-"}${transaction.amount.toFixed(2)}
                    </Text>
                    <Text style={[s.heroTitle, { color: colors.foreground }]}>{transaction.title}</Text>
                  </View>

                  {/* Details rows */}
                  <View style={[s.detailCard, { backgroundColor: colors.background }]}>
                    <DetailRow label="Category" value={transaction.category} colors={colors} />
                    <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
                    <DetailRow label="Type" value={isIncome ? "Income" : "Expense"} colors={colors} />
                    <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
                    <DetailRow label="Date" value={dateStr} colors={colors} />
                    <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
                    <DetailRow label="Time" value={timeStr} colors={colors} />
                    {account && (
                      <>
                        <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
                        <DetailRow label="Account" value={`${account.name} · ${account.bank}`} colors={colors} />
                      </>
                    )}
                    {transaction.fromEmail && (
                      <>
                        <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
                        <DetailRow label="Source" value="Email import" colors={colors} icon="mail" />
                      </>
                    )}
                    {transaction.note && (
                      <>
                        <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
                        <DetailRow label="Note" value={transaction.note} colors={colors} />
                      </>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, colors, icon }: { label: string; value: string; colors: any; icon?: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={[s.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon && <Feather name={icon as any} size={13} color={colors.mutedForeground} />}
        <Text style={[s.detailValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    maxHeight: "90%",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  headerActions: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  saveText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  amountHero: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
  heroAmount: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  heroTitle: {
    fontSize: 17,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  detailCard: {
    borderRadius: 14,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  detailValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
    maxWidth: "60%",
  },
  rowDivider: { height: 1, marginHorizontal: 16 },
  typeRow: { flexDirection: "row", gap: 12 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  typeBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  currencySymbol: { fontSize: 36, fontFamily: "Inter_700Bold" },
  amountInput: { fontSize: 48, fontFamily: "Inter_700Bold", minWidth: 100 },
  field: { gap: 10 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  accountOption: {
    flexDirection: "row", alignItems: "center",
    padding: 14, borderRadius: 12, borderWidth: 1.5, gap: 10,
    marginBottom: 8,
  },
  accountDot: { width: 10, height: 10, borderRadius: 5 },
  accountOptionText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
});
