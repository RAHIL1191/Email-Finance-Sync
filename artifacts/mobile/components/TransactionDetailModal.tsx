import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Transaction, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate, toLocalYMD } from "@/hooks/useLocalDate";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "./TransactionItem";
import DateTimePicker from "@react-native-community/datetimepicker";
import CategoryPickerModal from "./CategoryPickerModal";
import MerchantPickerModal from "./MerchantPickerModal";
import { ProjectPickerModal } from "./AddEntrySheet";
import SimilarTransactionsModal from "./SimilarTransactionsModal";

function parseNoteAndTag(raw: string | undefined): { cleanNote: string; tag: string } {
  if (!raw) return { cleanNote: "", tag: "" };
  const sep = " · Tag: ";
  const idx = raw.indexOf(sep);
  if (idx !== -1) return { cleanNote: raw.slice(0, idx), tag: raw.slice(idx + sep.length) };
  if (raw.startsWith("Tag: ")) return { cleanNote: "", tag: raw.slice(5) };
  return { cleanNote: raw, tag: "" };
}

// ─── Calculator Modal ────────────────────────────────────────────────────────
function CalculatorModal({
  visible,
  initialValue,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onApply: (value: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [expr, setExpr] = React.useState(initialValue || "");

  React.useEffect(() => { if (visible) setExpr(initialValue || ""); }, [visible, initialValue]);

  const append = (ch: string) => setExpr((p) => p + ch);
  const backspace = () => setExpr((p) => p.slice(0, -1));
  const clear = () => setExpr("");

  const calculate = () => {
    try {
      const sanitized = expr.replace(/[^0-9+\-*/.]/g, "");
      if (!sanitized) return;
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${sanitized})`)() as number;
      if (typeof result === "number" && !isNaN(result)) setExpr(String(Math.round(result * 100) / 100));
    } catch { /* ignore */ }
  };

  const apply = () => { if (expr) onApply(expr); onClose(); };

  const keys = [["7","8","9","÷"],["4","5","6","×"],["1","2","3","-"],["0",".","=","+"]];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[s.bottomSheetCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, position: "absolute", bottom: 0, left: 0, right: 0 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Calculator</Text>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={20} color={colors.foreground} /></TouchableOpacity>
        </View>
        <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 14, marginBottom: 12, alignItems: "flex-end" }}>
          <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground }}>{expr || "0"}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: colors.expense + "18", borderRadius: 10, padding: 10, alignItems: "center" }} onPress={clear}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.expense }}>C</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, backgroundColor: colors.muted, borderRadius: 10, padding: 10, alignItems: "center" }} onPress={backspace}>
            <Feather name="delete" size={16} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 2, backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: "center" }} onPress={apply}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Apply</Text>
          </TouchableOpacity>
        </View>
        {keys.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {row.map((k) => {
              const isOp = ["÷","×","-","+"].includes(k);
              const ch = k === "÷" ? "/" : k === "×" ? "*" : k;
              return (
                <TouchableOpacity
                  key={k}
                  style={{ flex: 1, backgroundColor: isOp ? colors.primary + "18" : colors.muted, borderRadius: 10, paddingVertical: 16, alignItems: "center" }}
                  onPress={() => k === "=" ? calculate() : append(ch)}
                >
                  <Text style={{ fontSize: 20, fontFamily: "Inter_600SemiBold", color: isOp ? colors.primary : colors.foreground }}>{k}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </Modal>
  );
}

type EditType = "EXPENSE" | "INCOME" | "TRANSFER" | "BILLS";
const EDIT_TYPES: EditType[] = ["EXPENSE", "INCOME", "TRANSFER", "BILLS"];

function typeToEditType(type: "income" | "expense", category: string): EditType {
  if (type === "income") return "INCOME";
  if (category === "Transfer" || category?.toLowerCase() === "transfer") return "TRANSFER";
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
  const { transactions, accounts, addTransaction, updateTransaction, updateTransactionsCategory, deleteTransaction } = useApp();

  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<EditType>("EXPENSE");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showMerchantPicker, setShowMerchantPicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSplitCatPicker, setShowSplitCatPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [splitCategories, setSplitCategories] = useState<Array<{ category: string; amount: string }>>([]);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [tag, setTag] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);

  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<Transaction[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<{
    targetCategory: string;
    pattern: string;
    merchantExact: string;
    currentTxUpdates: Partial<Transaction>;
  } | null>(null);

  useEffect(() => {
    if (transaction) {
      setTitle(transaction.title);
      setAmount(String(transaction.amount));
      setEditType(typeToEditType(transaction.type, transaction.category));
      setCategory(transaction.category);
      const resolvedId = accounts.find((a) => a.id === transaction.accountId)?.id ?? accounts[0]?.id ?? "";
      setAccountId(resolvedId);
      const { cleanNote, tag: extractedTag } = parseNoteAndTag(transaction.note);
      setNote(cleanNote);
      setTag(extractedTag);
      setProjectId(transaction.projectId);
      setProjectName(transaction.projectName);
      setEditDate(parseLocalDate(transaction.date));
      setMerchant(transaction.merchant || transaction.title || "");
      setSplitCategories([]);
      setIsSplitMode(false);
      setEditing(false);
    }
  }, [transaction, accounts]);

  if (!transaction) return null;

  const account = accounts.find((a) => a.id === (editing ? accountId : transaction.accountId));
  const icon = (CATEGORY_ICONS[transaction.category] || "circle") as any;
  const catColor = CATEGORY_COLORS[transaction.category] || colors.primary;

  const dateObj = parseLocalDate(transaction.date);
  const _now = new Date();
  const isToday = _now.toDateString() === dateObj.toDateString();
  const isCurrentYear = _now.getFullYear() === dateObj.getFullYear();
  const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateLine = isToday ? `Today, ${timeStr}` : `${dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(isCurrentYear ? {} : { year: "numeric" }) })}, ${timeStr}`;

  const createdDate = parseLocalDate(transaction.createdAt);
  const updatedDate = parseLocalDate(transaction.updatedAt);
  const fmtTimestamp = (d: Date) =>
    `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()}`;

  const typeLabel = transaction.type === "income" ? "Income" : "Expense";

  const isSplit = isSplitMode;

  const addSplitCategory = (cat: string) => setSplitCategories((prev) => [...prev, { category: cat, amount: "" }]);
  const removeSplitCategory = (i: number) => setSplitCategories((prev) => prev.filter((_, idx) => idx !== i));
  const updateSplitAmount = (i: number, val: string) =>
    setSplitCategories((prev) => prev.map((s, idx) => idx === i ? { ...s, amount: val } : s));

  const splitTotal = splitCategories.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

  const handleSave = () => {
    const parsed = parseFloat(amount);
    if (!title.trim() || isNaN(parsed) || parsed <= 0) return;
    const fields = editTypeToFields(editType);
    const resolvedCategory = editType === "TRANSFER" ? "Transfer" : editType === "BILLS" ? "Bills" : category;
    const dateStr = editDate ? toLocalYMD(editDate) : transaction.date;

    if (isSplit) {
      if (splitCategories.length === 0) {
        Alert.alert("No Split Categories", "Add at least one category to split into.");
        return;
      }
      const splitTotal = splitCategories.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
      if (Math.abs(splitTotal - parsed) > 0.01) {
        Alert.alert(
          "Amount Mismatch",
          `Split total ($${splitTotal.toFixed(2)}) must equal the transaction amount ($${parsed.toFixed(2)}).`
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const groupId = `split_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const builtNote = [note.trim(), tag.trim() ? `Tag: ${tag.trim()}` : ""].filter(Boolean).join(" · ");
      deleteTransaction(transaction.id);
      splitCategories.forEach((split) => {
        const splitAmt = parseFloat(split.amount);
        if (isNaN(splitAmt) || splitAmt <= 0) return;
        addTransaction({
          title: merchant.trim() || title.trim(),
          merchant: merchant.trim() || undefined,
          amount: splitAmt,
          type: fields.type,
          category: split.category || resolvedCategory,
          accountId,
          note: builtNote || undefined,
          date: dateStr,
          source: transaction.source,
          splitGroupId: groupId,
          projectId: projectId || undefined,
          projectName: projectName || undefined,
          isRefund: tag.trim().toLowerCase() === "refund" ? true : undefined,
        });
      });
      onClose();
    } else {
      const builtNote = [note.trim(), tag.trim() ? `Tag: ${tag.trim()}` : ""].filter(Boolean).join(" · ");
      const currentTxUpdates: Partial<Transaction> = {
        title: merchant.trim() || title.trim(),
        merchant: merchant.trim() || undefined,
        amount: parsed,
        type: fields.type,
        category: resolvedCategory,
        accountId,
        note: builtNote || undefined,
        date: dateStr,
        projectId: projectId || undefined,
        projectName: projectName || undefined,
        isRefund: tag.trim().toLowerCase() === "refund" ? true : undefined,
      };

      // Check if category changed and if similar transactions exist
      const isCategoryChanged = resolvedCategory !== transaction.category;
      if (isCategoryChanged) {
        const isCategoryRelated = (catA: string | undefined, catB: string | undefined): boolean => {
          if (!catA || !catB) return false;
          const a = catA.toLowerCase().trim();
          const b = catB.toLowerCase().trim();
          if (a === b) return true;

          // Same parent category (e.g. "Gifts & Donations - Donations" and "Gifts & Donations")
          const aParent = a.split(" - ")[0].trim();
          const bParent = b.split(" - ")[0].trim();
          if (aParent && bParent && aParent === bParent) return true;

          return false;
        };

        const targetMerchant = (merchant.trim() || transaction.merchant?.trim() || "");
        const targetTitle = (title.trim() || transaction.title?.trim() || "");

        const cleanStr = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

        // Prefer merchant, otherwise fall back to title
        const patternToMatch = cleanStr(targetMerchant || targetTitle);

        if (patternToMatch.length >= 2) {
          const matches = transactions.filter((tx) => {
            if (tx.id === transaction.id) return false;
            // Only find transactions that are currently in the SAME / RELATED category
            if (!isCategoryRelated(tx.category, transaction.category)) return false;
            // Already in the target category
            if (tx.category === resolvedCategory) return false;

            const txMerchant = tx.merchant ? cleanStr(tx.merchant) : "";
            const txTitle = tx.title ? cleanStr(tx.title) : "";

            const matchesPattern = (str: string) => {
              if (!str || str.length < 2) return false;
              if (patternToMatch.length <= 3 || str.length <= 3) {
                if (str === patternToMatch) return true;
                const words = str.split(" ");
                return words.includes(patternToMatch);
              }
              return str.includes(patternToMatch) || patternToMatch.includes(str);
            };

            const merchantMatched = txMerchant ? matchesPattern(txMerchant) : false;
            const titleMatched = txTitle ? matchesPattern(txTitle) : false;

            return merchantMatched || titleMatched;
          });

          if (matches.length > 0) {
            // Sort: same exact category first, then newest date first
            matches.sort((a, b) => {
              const aExact = a.category === transaction.category ? 1 : 0;
              const bExact = b.category === transaction.category ? 1 : 0;
              if (aExact !== bExact) return bExact - aExact;
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            });

            setSimilarMatches(matches);
            setPendingUpdates({
              targetCategory: resolvedCategory,
              pattern: patternToMatch,
              merchantExact: targetMerchant || targetTitle,
              currentTxUpdates,
            });
            setShowSimilarModal(true);
            return;
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateTransaction(transaction.id, currentTxUpdates);
      setEditing(false);
    }
  };

  const handleConfirmBatchUpdate = (selectedIds: string[]) => {
    if (!pendingUpdates) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTransaction(transaction.id, pendingUpdates.currentTxUpdates);
    if (selectedIds.length > 0) {
      updateTransactionsCategory(
        selectedIds,
        pendingUpdates.targetCategory,
        pendingUpdates.pattern,
        pendingUpdates.merchantExact
      );
    }
    setShowSimilarModal(false);
    setPendingUpdates(null);
    setEditing(false);
  };

  const handleConfirmOnlyThis = () => {
    if (!pendingUpdates) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTransaction(transaction.id, pendingUpdates.currentTxUpdates);
    setShowSimilarModal(false);
    setPendingUpdates(null);
    setEditing(false);
  };

  const handleCloseSimilarModal = () => {
    setShowSimilarModal(false);
    setPendingUpdates(null);
  };

  const handleDelete = () => {
    Alert.alert("Delete Transaction", `Remove "${transaction.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setTimeout(() => {
            deleteTransaction(transaction.id);
            onClose();
          }, 0);
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
        <>
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
              <View style={s.headerActions} pointerEvents="box-none">
                <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
                  <Feather name="edit-2" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} hitSlop={16} style={s.deleteBtn}>
                  <Feather name="trash-2" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {editing ? (
            <KeyboardAwareScrollView
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
                      else if (category === "Transfer" || category?.toLowerCase() === "transfer" || category === "Bills" || category === "Income") setCategory("Other");
                    }}
                  >
                    <Text style={[s.typeTabText, { color: editType === et ? colors.primary : colors.mutedForeground }]}>
                      {et}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Amount */}
              <View style={[s.amountRow, { flexDirection: "row", alignItems: "center" }]}>
                <TextInput
                  style={[s.amountInput, { color: colors.foreground, flex: 1 }]}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                />
                <TouchableOpacity
                  onPress={() => setShowCalculator(true)}
                  style={[s.calcBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Feather name="grid" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
                {editType === "EXPENSE" && (
                  <TouchableOpacity
                    onPress={() => setIsSplitMode(true)}
                    style={[s.calcBtn, { borderColor: isSplit ? colors.primary : colors.border, backgroundColor: isSplit ? colors.primary + "18" : colors.card, marginLeft: 6 }]}
                  >
                    <Feather name="scissors" size={16} color={isSplit ? colors.primary : colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Category row / Split */}
              {editType !== "TRANSFER" && editType !== "BILLS" && (
                !isSplit ? (
                  <TouchableOpacity
                    style={[s.editRow, { borderBottomColor: colors.border }]}
                    onPress={() => setShowCatPicker(true)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.editRowIcon, { backgroundColor: editCatColor + "20" }]}>
                      <Feather name={editCatIcon} size={18} color={editCatColor} />
                    </View>
                    <View style={s.editRowInfo}>
                      <Text style={[s.editRowSub, { color: colors.mutedForeground }]}>Category</Text>
                      <Text style={[s.editRowTitle, { color: colors.foreground }]}>
                        {category || "Select category"}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ) : (
                  <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 4 }}>
                      <View style={[s.editRowIcon, { backgroundColor: colors.primary + "18" }]}>
                        <Feather name="layers" size={18} color={colors.primary} />
                      </View>
                      <Text style={[s.editRowTitle, { color: colors.foreground, marginLeft: 12, flex: 1 }]}>Multiple Categories</Text>
                      <TouchableOpacity onPress={() => { setIsSplitMode(false); setSplitCategories([]); }} hitSlop={10}>
                        <Feather name="x" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                    {splitCategories.map((split, i) => (
                      <View
                        key={i}
                        style={[s.editRow, { borderBottomWidth: i < splitCategories.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }]}
                      >
                        <TouchableOpacity
                          onPress={() => removeSplitCategory(i)}
                          style={[s.editRowIcon, { backgroundColor: colors.expense + "18" }]}
                        >
                          <Feather name="minus" size={16} color={colors.expense} />
                        </TouchableOpacity>
                        <Text style={[s.editRowTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                          {split.category}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={{ fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>$</Text>
                          <TextInput
                            style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground, minWidth: 60, textAlign: "right", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 2 }}
                            placeholder="0.00"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="decimal-pad"
                            value={split.amount}
                            onChangeText={(v) => updateSplitAmount(i, v)}
                            returnKeyType="done"
                          />
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[s.editRow, { borderBottomWidth: 0 }]}
                      onPress={() => setShowSplitCatPicker(true)}
                    >
                      <View style={[s.editRowIcon, { backgroundColor: colors.accent }]}>
                        <Feather name="plus" size={16} color={colors.primary} />
                      </View>
                      <Text style={[s.editRowTitle, { color: colors.primary }]}>Add a Category to split</Text>
                    </TouchableOpacity>
                    {amount ? (
                      <Text style={{
                        fontSize: 12,
                        fontFamily: "Inter_400Regular",
                        paddingHorizontal: 16,
                        paddingBottom: 6,
                        color: Math.abs(splitTotal - parseFloat(amount)) > 0.01 ? "#ef4444" : colors.mutedForeground,
                      }}>
                        Split total: ${splitTotal.toFixed(2)} / ${parseFloat(amount).toFixed(2)}
                        {Math.abs(splitTotal - parseFloat(amount)) > 0.01
                          ? `  ·  $${Math.abs(parseFloat(amount) - splitTotal).toFixed(2)} ${splitTotal < parseFloat(amount) ? "remaining" : "over"}`
                          : "  ✓"}
                      </Text>
                    ) : null}
                  </View>
                )
              )}

              {/* Merchant */}
              <TouchableOpacity
                style={[s.editRow, { borderBottomColor: colors.border }]}
                onPress={() => setShowMerchantPicker(true)}
                activeOpacity={0.7}
              >
                <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="shopping-bag" size={18} color={colors.mutedForeground} />
                </View>
                <View style={s.editRowInfo}>
                  <Text style={[s.editRowSub, { color: colors.mutedForeground }]}>Merchant</Text>
                  <Text style={[s.editRowTitle, { color: merchant ? colors.foreground : colors.mutedForeground }]}>
                    {merchant || "Select merchant"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

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
              <TouchableOpacity
                style={[s.editRow, { borderBottomColor: colors.border }]}
                onPress={() => setShowAccountPicker(true)}
                activeOpacity={0.7}
              >
                {editAccount ? (
                  <View style={[s.bankBadge, { backgroundColor: editAccount.color }]}>
                    <Text style={s.bankBadgeText}>{editAccount.bank.slice(0, 2).toUpperCase()}</Text>
                  </View>
                ) : (
                  <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                    <Feather name="credit-card" size={18} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={s.editRowInfo}>
                  <Text style={[s.editRowSub, { color: colors.mutedForeground }]}>Account</Text>
                  <Text style={[s.editRowTitle, { color: editAccount ? colors.foreground : colors.mutedForeground }]}>
                    {editAccount ? `${editAccount.bank} · ${editAccount.name}` : "Select account"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

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
                  <View style={s.bottomSheetWrap}>
                    <View style={[s.bottomSheetCard, { backgroundColor: colors.card }]}>
                      <View style={[s.pickerHandle, { backgroundColor: colors.border }]} />
                      <View style={s.bottomSheetHeader}>
                        <Text style={[s.pickerTitle, { color: colors.foreground }]}>Edit Date</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)} style={[s.donePill, { backgroundColor: colors.primary }]}>
                          <Text style={s.donePillText}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={s.inlinePickerWrap}>
                        <DateTimePicker
                          value={editDate ?? dateObj}
                          mode="date"
                          display="inline"
                          onChange={(_, d) => {
                            if (d) setEditDate(d);
                          }}
                        />
                      </View>
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

              {/* Project */}
              <TouchableOpacity
                style={[s.editRow, { borderBottomColor: colors.border }]}
                onPress={() => setShowProjectPicker(true)}
                activeOpacity={0.7}
              >
                <View style={[s.editRowIcon, { backgroundColor: "#f97316" + "18" }]}>
                  <Feather name="folder" size={18} color="#f97316" />
                </View>
                <View style={s.editRowInfo}>
                  <Text style={[s.editRowSub, { color: colors.mutedForeground }]}>Project</Text>
                  <Text style={[s.editRowTitle, { color: projectName ? colors.foreground : colors.mutedForeground }]}>
                    {projectName || "Tag a project (optional)"}
                  </Text>
                </View>
                {projectId ? (
                  <TouchableOpacity
                    onPress={() => { setProjectId(undefined); setProjectName(undefined); }}
                    hitSlop={10}
                  >
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ) : (
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>

              {/* Tag */}
              <View style={[s.editRow, { borderBottomColor: colors.border }]}>
                <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="tag" size={18} color={colors.mutedForeground} />
                </View>
                <TextInput
                  style={[s.editRowInput, { color: colors.foreground }]}
                  value={tag}
                  onChangeText={setTag}
                  placeholder="Add tag (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                />
                {tag ? (
                  <TouchableOpacity onPress={() => setTag("")} hitSlop={10}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <MerchantPickerModal
                visible={showMerchantPicker}
                onClose={() => setShowMerchantPicker(false)}
                onSelect={(m) => { setMerchant(m); setTitle(m); }}
                selected={merchant}
              />
              <ProjectPickerModal
                visible={showProjectPicker}
                selected={projectId}
                onSelect={(id, name) => { setProjectId(id); setProjectName(name); }}
                onClose={() => setShowProjectPicker(false)}
              />
              <CategoryPickerModal
                visible={showSplitCatPicker}
                onClose={() => setShowSplitCatPicker(false)}
                onSelect={(cat) => { addSplitCategory(cat); setShowSplitCatPicker(false); }}
                type="both"
              />
              <CalculatorModal
                visible={showCalculator}
                initialValue={amount}
                onClose={() => setShowCalculator(false)}
                onApply={(v) => setAmount(v)}
              />

              {/* Add Receipts */}
              <TouchableOpacity style={[s.receiptsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.editRowIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="camera" size={18} color={colors.mutedForeground} />
                </View>
                <Text style={[s.editRowTitle, { color: colors.foreground }]}>Add Receipts</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          ) : (
            <KeyboardAwareScrollView
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

              {/* Mark as transfer / Revert from transfer */}
              <View style={[s.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {transaction.category === "Transfer" || transaction.category?.toLowerCase() === "transfer" ? (
                  <>
                    <TouchableOpacity
                      style={[s.actionPill, { backgroundColor: colors.primary + "20" }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        updateTransaction(transaction.id, {
                          category: transaction.type === "income" ? "Income" : "Other",
                        });
                        onClose();
                      }}
                    >
                      <Feather name="refresh-cw" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={[s.actionPillText, { color: colors.primary }]}>
                        Revert to {transaction.type === "income" ? "Income" : "Expense"}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[s.actionDesc, { color: colors.mutedForeground }]}>
                      This will include it back in {transaction.type === "income" ? "income" : "expense"} calculations.
                    </Text>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={[s.actionPill, { backgroundColor: colors.muted }]} onPress={handleMarkTransfer}>
                      <Text style={[s.actionPillText, { color: colors.foreground }]}>Mark as transfer?</Text>
                    </TouchableOpacity>
                    <Text style={[s.actionDesc, { color: colors.mutedForeground }]}>
                      Then transaction will NOT be considered into expense / income calculations.
                    </Text>
                  </>
                )}
              </View>

              {/* Split Transactions */}
              {transaction.splitGroupId && (() => {
                const siblings = transactions.filter(
                  (t) => t.splitGroupId === transaction.splitGroupId && t.id !== transaction.id
                );
                if (siblings.length === 0) return null;
                return (
                  <View style={[s.accountCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", alignItems: "stretch", gap: 0, padding: 0, overflow: "hidden" }]}>
                    <Text style={[s.accountName, { color: colors.foreground, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, fontSize: 14, fontFamily: "Inter_600SemiBold" }]}>Split Transactions</Text>
                    {siblings.map((t, i) => {
                      const sibIcon = (CATEGORY_ICONS[t.category] || "circle") as any;
                      const sibColor = CATEGORY_COLORS[t.category] || colors.primary;
                      const sibDate = parseLocalDate(t.date);
                      const sibTime = sibDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const sibDateLabel = `${sibDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${sibTime}`;
                      return (
                        <View
                          key={t.id}
                          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderTopWidth: i === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }}
                        >
                          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: sibColor + "20", alignItems: "center", justifyContent: "center" }}>
                            <Feather name={sibIcon} size={20} color={sibColor} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>{t.category}</Text>
                            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{sibDateLabel}</Text>
                          </View>
                          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.expense }}>${t.amount.toFixed(2)}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Project & Tag chips (view mode) */}
              {(transaction.projectName || transaction.isRefund || parseNoteAndTag(transaction.note).tag) ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 4 }}>
                  {transaction.projectName ? (
                    <View style={[s.metaChip, { backgroundColor: "#f97316" + "18" }]}>
                      <Feather name="folder" size={13} color="#f97316" />
                      <Text style={[s.metaChipText, { color: "#f97316" }]}>{transaction.projectName}</Text>
                    </View>
                  ) : null}
                  {parseNoteAndTag(transaction.note).tag ? (
                    <View style={[s.metaChip, { backgroundColor: colors.primary + "18" }]}>
                      <Feather name="tag" size={13} color={colors.primary} />
                      <Text style={[s.metaChipText, { color: colors.primary }]}>{parseNoteAndTag(transaction.note).tag}</Text>
                    </View>
                  ) : null}
                  {transaction.isRefund ? (
                    <View style={[s.metaChip, { backgroundColor: "#10b981" + "18" }]}>
                      <Feather name="rotate-ccw" size={13} color="#10b981" />
                      <Text style={[s.metaChipText, { color: "#10b981" }]}>Refund</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

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
                  Created {fmtTimestamp(createdDate)}
                </Text>
                <Text style={[s.timestampText, { color: colors.mutedForeground }]}>
                  Updated {fmtTimestamp(updatedDate)}
                </Text>
              </View>
            </KeyboardAwareScrollView>
          )}
        </>
      </View>

      <CategoryPickerModal
        visible={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        onSelect={(cat, sub) => setCategory(sub ? `${cat} - ${sub}` : cat)}
        type="both"
      />

      {/* Account picker sheet */}
      <Modal
        visible={showAccountPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountPicker(false)}
      >
        <TouchableOpacity style={s.pickerOverlay} activeOpacity={1} onPress={() => setShowAccountPicker(false)}>
          <View style={[s.pickerSheet, { backgroundColor: colors.card, paddingBottom: pb }]}>
            <View style={[s.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[s.pickerTitle, { color: colors.foreground }]}>Select Account</Text>
            {accounts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[s.pickerRow, { borderBottomColor: colors.border }, accountId === a.id && { backgroundColor: colors.primary + "12" }]}
                onPress={() => { setAccountId(a.id); setShowAccountPicker(false); }}
              >
                <View style={[s.bankBadge, { backgroundColor: a.color }]}>
                  <Text style={s.bankBadgeText}>{a.bank.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.editRowTitle, { color: colors.foreground }]}>{a.bank} · {a.name}</Text>
                  <Text style={[s.editRowSub, { color: colors.mutedForeground }]}>
                    {a.type.charAt(0).toUpperCase() + a.type.slice(1)}{a.lastFour ? ` · ****${a.lastFour}` : ""}
                  </Text>
                </View>
                {accountId === a.id && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {pendingUpdates && (
        <SimilarTransactionsModal
          visible={showSimilarModal}
          onClose={handleCloseSimilarModal}
          merchantName={pendingUpdates.merchantExact}
          previousCategory={transaction.category}
          newCategory={pendingUpdates.targetCategory}
          similarTransactions={similarMatches}
          accounts={accounts}
          onConfirmUpdateSelected={handleConfirmBatchUpdate}
          onConfirmOnlyThis={handleConfirmOnlyThis}
        />
      )}
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
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  amountInput: { fontSize: 48, fontFamily: "Inter_700Bold" },
  calcBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

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

  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  metaChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },

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
  bottomSheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheetCard: {
    width: "100%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
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
  bottomSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlinePickerWrap: {
    borderRadius: 16,
    overflow: "hidden",
  },
  donePill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 999,
  },
  donePillText: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 4,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
