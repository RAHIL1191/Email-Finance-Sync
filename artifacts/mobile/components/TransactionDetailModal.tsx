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
import { CATEGORY_COLORS, CATEGORY_ICONS } from "./TransactionItem";
import DateTimePicker from "@react-native-community/datetimepicker";

const CATEGORIES = [
  "Income", "Food", "Groceries", "Shopping", "Transport",
  "Entertainment", "Housing", "Utilities", "Health", "Insurance",
  "Education", "Transfer", "Bills", "Other",
];

type EditType = "EXPENSE" | "INCOME" | "TRANSFER" | "BILLS";
const EDIT_TYPES: EditType[] = ["EXPENSE", "INCOME", "TRANSFER", "BILLS"];

function typeToEditType(type: "income" | "expense", category: string): EditType {
  if (type === "income") return "INCOME";
  if (category === "Transfer") return "TRANSFER";
  if (category === "Bills") return "BILLS";
  return "EXPENSE";
}

function editTypeToFields(et: EditType): { type: "income" | "expense"; category?: string } {
  if (et === "INCOME") return { type: "income" };
  if (et === "TRANSFER") return { type: "expense", category: "Transfer" };
  if (et === "BILLS") return { type: "expense", category: "Bills" };
  return { type: "expense" };
}

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
  const [editType, setEditType] = useState<EditType>("EXPENSE");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (transaction) {
      setTitle(transaction.title);
      setAmount(String(transaction.amount));
      setEditType(typeToEditType(transaction.type, transaction.category));
      setCategory(transaction.category);
      setAccountId(transaction.accountId);
      setNote(transaction.note || "");
      setEditDate(new Date(transaction.date));
      setEditing(false);
    }
  }, [transaction]);

  if (!transaction) return null;

  const account = accounts.find((a) => a.id === (editing ? accountId : transaction.accountId));
  const icon = (CATEGORY_ICONS[transaction.category] || "circle") as any;
  const catColor = CATEGORY_COLORS[transaction.category] || colors.primary;

  const dateObj = new Date(transaction.date);
  const isToday = new Date().toDateString() === dateObj.toDateString();
  const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateLine = isToday ? `Today, ${timeStr}` : `${dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${timeStr}`;

  const typeLabel = transaction.type === "income" ? "Income" : "Expense";

  const handleSave = () => {
    const parsed = parseFloat(amount);
    if (!title.trim() || isNaN(parsed) || parsed <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const fields = editTypeToFields(editType);
    updateTransaction(transaction.id, {
      title: title.trim(),
      amount: parsed,
      type: fields.type,
      category: editType === "TRANSFER" ? "Transfer" : editType === "BILLS" ? "Bills" : category,
      accountId,
      note: note.trim() || undefined,
      date: editDate?.toISOString() ?? transaction.date,
    });
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete Transaction", `Remove "${transaction.title}"?`, [
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
    ]);
  };

  const handleMarkTransfer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateTransaction(transaction.id, { category: "Transfer" });
    onClose();
  };

  const pt = Platform.OS === "web" ? 16 : insets.top + 8;
  const pb = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const editCatIcon = (CATEGORY_ICONS[category] || "circle") as any;
  const editCatColor = CATEGORY_COLORS[category] || colors.primary;
  const editAccount = accounts.find((a) => a.id === accountId);
  const editTitleLabel =
    editType === "INCOME" ? "Edit Income" :
    editType === "TRANSFER" ? "Edit Transfer" :
    editType === "BILLS" ? "Edit Bill" : "Edit Expense";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "fullScreen" : "fullScreen"}
      onRequestClose={() => editing ? setEditing(false) : onClose()}
    >
      <View style={[s.screen, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View style={[s.header, { paddingTop: pt, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => editing ? setEditing(false) : onClose()} hitSlop={8} style={s.headerBtn}>
              <Feather name="arrow-left" size={22} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>
              {editing ? editTitleLabel : "Transaction"}
            </Text>
            {editing ? (
              <TouchableOpacity onPress={handleSave} hitSlop={8} style={s.headerBtn}>
                <Feather name="check" size={22} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={s.headerActions}>
                <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
                  <Feather name="edit-2" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} hitSlop={8}>
                  <Feather name="trash-2" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {editing ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[s.editScroll, { paddingBottom: pb }]}
            >
              {/* Type tabs */}
              <View style={[s.typeTabs, { borderBottomColor: colors.border }]}>
                {EDIT_TYPES.map((et) => (
                  <TouchableOpacity
                    key={et}
                    style={[s.typeTab, editType === et && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                    onPress={() => {
                      setEditType(et);
                      if (et === "TRANSFER") setCategory("Transfer");
                      else if (et === "BILLS") setCategory("Bills");
                      else if (et === "INCOME") setCategory("Income");
                      else if (category === "Transfer" || category === "Bills" || category === "Income") setCategory("Other");
                    }}
                  >
                    <Text style={[s.typeTabText, { color: editType === et ? colors.primary : colors.mutedForeground }]}>
                      {et}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Amount */}
              <View style={s.amountRow}>
                <TextInput
                  style={[s.amountInput, { color: colors.foreground }]}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              {/* Category row */}
              {editType !== "TRANSFER" && editType !== "BILLS" && (
                <View style={[s.editRow, { borderBottomColor: colors.border }]}>
                  <View style={[s.editRowIcon, { backgroundColor: editCatColor + "20" }]}>
                    <Feather name={editCatIcon} size={18} color={editCatColor} />
                  </View>
                  <View style={s.editRowInfo}>
                    <Text style={[s.editRowTitle, { color: colors.foreground }]}>{category}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {CATEGORIES.filter(c => c !== "Transfer" && c !== "Bills").map((c) => (
                          <TouchableOpacity
                            key={c}
                            style={[s.catChip, { backgroundColor: category === c ? colors.primary : colors.muted }]}
                            onPress={() => setCategory(c)}
                          >
                            <Text style={[s.catChipText, { color: category === c ? "#fff" : colors.mutedForeground }]}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>
              )}

              {/* Title / Description */}
              <View style={[s.editRow, { borderBottomColor: colors.border }]}>
                <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="tag" size={18} color={colors.mutedForeground} />
                </View>
                <TextInput
                  style={[s.editRowInput, { color: colors.foreground }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Description"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              {/* Account */}
              <View style={[s.editRow, { borderBottomColor: colors.border }]}>
                {editAccount ? (
                  <>
                    <View style={[s.bankBadge, { backgroundColor: editAccount.color }]}>
                      <Text style={s.bankBadgeText}>{editAccount.bank.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={s.editRowInfo}>
                      <Text style={[s.editRowTitle, { color: colors.foreground }]}>{editAccount.name}</Text>
                      <Text style={[s.editRowSub, { color: colors.mutedForeground }]}>
                        {`From: ${editAccount.type.charAt(0).toUpperCase() + editAccount.type.slice(1)} · ${editAccount.bank}`}
                      </Text>
                      <Text style={[s.editRowSub, { color: colors.mutedForeground }]}>
                        {`Balance: $${editAccount.balance.toFixed(2)}`}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setAccountId("")} hitSlop={8}>
                      <Feather name="x" size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                      <Feather name="credit-card" size={18} color={colors.mutedForeground} />
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                        {accounts.map((a) => (
                          <TouchableOpacity
                            key={a.id}
                            style={[s.catChip, { backgroundColor: accountId === a.id ? a.color : colors.muted }]}
                            onPress={() => setAccountId(a.id)}
                          >
                            <Text style={[s.catChipText, { color: accountId === a.id ? "#fff" : colors.mutedForeground }]}>{a.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>

              {/* Date */}
              <TouchableOpacity style={[s.editRow, { borderBottomColor: colors.border }]} onPress={() => setShowDatePicker(true)}>
                <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="calendar" size={18} color={colors.mutedForeground} />
                </View>
                <View style={s.editRowInfo}>
                  <Text style={[s.editRowTitle, { color: colors.foreground }]}>{dateLine}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {Platform.OS === "android" ? (
                showDatePicker && (
                  <DateTimePicker
                    value={editDate ?? dateObj}
                    mode="date"
                    display="default"
                    onChange={(_, d) => {
                      setShowDatePicker(false);
                      if (d) setEditDate(d);
                    }}
                  />
                )
              ) : (
                <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
                  <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
                  <View style={s.centerPicker}>
                    <View style={[s.centerPickerCard, { backgroundColor: colors.card, minHeight: 260 }]}>
                      <View style={[s.pickerHandle, { backgroundColor: colors.border }]} />
                      <Text style={[s.pickerTitle, { color: colors.foreground }]}>Edit Date</Text>
                      <DateTimePicker
                        value={editDate ?? dateObj}
                        mode="date"
                        display="spinner"
                        onChange={(_, d) => {
                          if (d) setEditDate(d);
                        }}
                      />
                      <TouchableOpacity onPress={() => setShowDatePicker(false)} style={[s.centerPickerBtn, { backgroundColor: colors.primary }]}>
                        <Text style={s.centerPickerBtnText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              )}

              {/* Notes */}
              <View style={[s.editRow, { borderBottomColor: colors.border }]}>
                <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="file-text" size={18} color={colors.mutedForeground} />
                </View>
                <TextInput
                  style={[s.editRowInput, { color: colors.foreground }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Notes..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
                <View style={[s.abcBadge, { borderColor: colors.border }]}>
                  <Text style={[s.abcText, { color: colors.mutedForeground }]}>ABC</Text>
                </View>
              </View>

              {/* Add Receipts */}
              <TouchableOpacity style={[s.receiptsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="camera" size={18} color={colors.mutedForeground} />
                </View>
                <Text style={[s.editRowTitle, { color: colors.foreground }]}>Add Receipts</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[s.viewScroll, { paddingBottom: pb }]}
            >
              {/* Category icon + title */}
              <View style={s.heroSection}>
                <View style={[s.heroIcon, { backgroundColor: catColor + "20" }]}>
                  <Feather name={icon} size={28} color={catColor} />
                </View>
                <Text style={[s.heroTitle, { color: colors.foreground }]}>{transaction.title}</Text>
                <Text style={[s.heroAmount, { color: colors.foreground }]}>
                  ${transaction.amount.toFixed(2)}
                </Text>
                <Text style={[s.heroMeta, { color: colors.mutedForeground }]}>
                  {typeLabel} | {dateLine}
                </Text>
              </View>

              {/* Account card */}
              {account && (
                <View style={[s.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[s.bankBadge, { backgroundColor: account.color }]}>
                    <Text style={s.bankBadgeText}>{account.bank.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={s.accountInfo}>
                    <Text style={[s.accountName, { color: colors.foreground }]}>{account.name}</Text>
                    <Text style={[s.accountSub, { color: colors.mutedForeground }]}>
                      {account.type.charAt(0).toUpperCase() + account.type.slice(1)} · {account.bank}
                    </Text>
                  </View>
                </View>
              )}

              {/* Mark as transfer */}
              {transaction.category !== "Transfer" && (
                <View style={[s.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity style={[s.actionPill, { backgroundColor: colors.muted }]} onPress={handleMarkTransfer}>
                    <Text style={[s.actionPillText, { color: colors.foreground }]}>Mark as transfer?</Text>
                  </TouchableOpacity>
                  <Text style={[s.actionDesc, { color: colors.mutedForeground }]}>
                    Then transaction will NOT be considered into expense / income calculations.
                  </Text>
                </View>
              )}

              {/* Notes */}
              <View style={[s.notesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.notesIconWrap, { backgroundColor: colors.muted }]}>
                  <Feather name="file-text" size={16} color={colors.mutedForeground} />
                </View>
                <TextInput
                  style={[s.notesInput, { color: transaction.note ? colors.foreground : colors.mutedForeground }]}
                  value={note}
                  onChangeText={(v) => {
                    setNote(v);
                    updateTransaction(transaction.id, { note: v || undefined });
                  }}
                  placeholder="Enter Notes"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
                <Feather name="edit-3" size={16} color={colors.primary} />
              </View>

              {/* Sync */}
              <View style={[s.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity style={[s.actionPill, { backgroundColor: colors.muted }]}>
                  <Text style={[s.actionPillText, { color: colors.foreground }]}>Sync this transaction</Text>
                </TouchableOpacity>
                <Text style={[s.actionDesc, { color: colors.mutedForeground }]}>
                  Use this option when transaction is not visible on your other devices, in case using the app on multiple devices.
                </Text>
              </View>

              {/* Timestamps */}
              <View style={[s.timestampCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.timestampText, { color: colors.mutedForeground }]}>
                  Created {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })},{" "}
                  {timeStr.toLowerCase()}
                </Text>
                <Text style={[s.timestampText, { color: colors.mutedForeground }]}>
                  Updated {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })},{" "}
                  {timeStr.toLowerCase()}
                </Text>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerActions: { flexDirection: "row", gap: 18, alignItems: "center" },

  viewScroll: { paddingHorizontal: 16, paddingTop: 8, gap: 14 },

  heroSection: { alignItems: "center", paddingVertical: 20, gap: 6 },
  heroIcon: { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 4 },
  heroAmount: { fontSize: 32, fontFamily: "Inter_700Bold" },
  heroMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },

  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  bankBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  bankBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  accountInfo: { flex: 1, gap: 3 },
  accountName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  accountSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  actionCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    alignItems: "flex-start",
  },
  actionPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    alignSelf: "center",
  },
  actionPillText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  actionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, textAlign: "center", alignSelf: "center" },

  notesCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  notesIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  notesInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingTop: 0 },

  timestampCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    alignItems: "center",
  },
  timestampText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  editScroll: { gap: 0 },

  typeTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  typeTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  typeTabText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  amountRow: {
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  amountInput: { fontSize: 48, fontFamily: "Inter_700Bold" },

  editRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
    minHeight: 64,
  },
  editRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  editRowInfo: { flex: 1, gap: 3 },
  editRowTitle: { fontSize: 15, fontFamily: "Inter_400Regular" },
  editRowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  editRowInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },

  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  catChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  abcBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  abcText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  receiptsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  centerPicker: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  centerPickerCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  pickerHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    alignSelf: "center",
    marginBottom: 6,
  },
  pickerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  centerPickerBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  centerPickerBtnText: {
    fontFamily: "Inter_600SemiBold",
  },
});
