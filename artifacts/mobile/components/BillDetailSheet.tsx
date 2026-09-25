import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Alert,
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
import DateTimePicker from "@react-native-community/datetimepicker";

import { Bill, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate, toLocalYMD } from "@/hooks/useLocalDate";

// ─── Category icon map ────────────────────────────────────────────────────────
const CAT_ICON: Record<string, { icon: string; bg: string; fg: string }> = {
  Housing:       { icon: "home",        bg: "#6366f1", fg: "#fff" },
  Utilities:     { icon: "zap",         bg: "#f59e0b", fg: "#fff" },
  Insurance:     { icon: "shield",      bg: "#3b82f6", fg: "#fff" },
  Subscriptions: { icon: "refresh-cw",  bg: "#8b5cf6", fg: "#fff" },
  Health:        { icon: "heart",       bg: "#ef4444", fg: "#fff" },
  Transport:     { icon: "navigation",  bg: "#10b981", fg: "#fff" },
  Food:          { icon: "coffee",      bg: "#f97316", fg: "#fff" },
  Entertainment: { icon: "film",        bg: "#ec4899", fg: "#fff" },
  Other:         { icon: "file-text",   bg: "#94a3b8", fg: "#fff" },
};
function catCfg(category: string) {
  const key = Object.keys(CAT_ICON).find((k) =>
    category.toLowerCase().includes(k.toLowerCase())
  );
  return key ? CAT_ICON[key] : CAT_ICON.Other;
}

function daysUntil(dateStr: string) {
  return Math.ceil((parseLocalDate(dateStr).getTime() - Date.now()) / 86400000);
}

function fmtDate(dateStr: string) {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(dateStr: string) {
  return parseLocalDate(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  bill: Bill | null;
  visible: boolean;
  onClose: () => void;
  onEdit: (bill: Bill) => void;
  onEditThisOnly: (bill: Bill) => void;
  onDeleteThisOnly: (bill: Bill) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BillDetailSheet({ bill: billProp, visible, onClose, onEdit, onEditThisOnly, onDeleteThisOnly }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, updateBill, deleteBill, markBillPaid } = useApp();

  const [notes, setNotes]               = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [showPaidDatePicker, setShowPaidDatePicker] = useState(false);
  const [paidDateObj, setPaidDateObj] = useState(new Date());

  const bill = bills.find((b) => b.id === billProp?.id) ?? billProp;

  useEffect(() => {
    if (bill) {
      setNotes(bill.notes ?? "");
      if (bill.paidDate) {
        setPaidDateObj(parseLocalDate(bill.paidDate));
      } else if (bill.updatedAt && bill.isPaid) {
        setPaidDateObj(parseLocalDate(bill.updatedAt));
      } else {
        setPaidDateObj(new Date());
      }
    }
  }, [bill?.id, bill?.paidDate, bill?.isPaid, visible]);

  if (!bill) return null;

  const cfg      = catCfg(bill.category);
  const d        = daysUntil(bill.dueDate);
  const isOverdue = !bill.isPaid && d < 0;
  const isDueSoon = !bill.isPaid && d >= 0 && d <= 3;

  const statusText = bill.isPaid
    ? (bill.paidDate ? `Paid on ${fmtDate(bill.paidDate)}` : "Paid")
    : isOverdue
    ? `${Math.abs(d)} days past`
    : d === 0
    ? "Due today"
    : isDueSoon
    ? `Due in ${d} day${d !== 1 ? "s" : ""}`
    : `Due in ${d} days`;

  const statusColor = bill.isPaid
    ? colors.success
    : isOverdue
    ? "#ef4444"
    : isDueSoon
    ? "#f59e0b"
    : colors.mutedForeground;

  const statusIcon = bill.isPaid ? "check-circle" : isOverdue ? "clock" : "calendar";

  const handleDelete = () => {
    if (bill.isRecurring) {
      Alert.alert(
        "Delete?",
        "Delete all future occurrences of this repeat entry, or this occurrence only?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "THIS & ALL FUTURE",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              deleteBill(bill.id);
              onClose();
            },
          },
          {
            text: "THIS ONLY",
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDeleteThisOnly(bill);
              onClose();
            },
          },
        ]
      );
    } else {
      Alert.alert(
        "Delete Bill",
        `Are you sure you want to delete "${bill.title}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              deleteBill(bill.id);
              onClose();
            },
          },
        ]
      );
    }
  };

  const handleEdit = () => {
    if (bill.isRecurring) {
      Alert.alert(
        "Edit?",
        "Edit all future occurrences of this repeat bill, or this occurrence only?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "THIS & ALL FUTURE",
            onPress: () => onEdit(bill),
          },
          {
            text: "THIS ONLY",
            onPress: () => onEditThisOnly(bill),
          },
        ]
      );
    } else {
      onEdit(bill);
    }
  };

  const handleMarkPaid = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markBillPaid(bill.id, undefined, { paidDate: toLocalYMD(new Date()) });
    onClose();
  };

  const handleUpdatePaidDate = (newDate: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPaidDateObj(newDate);
    updateBill(bill.id, { paidDate: toLocalYMD(newDate) });
  };

  const handleSaveNotes = () => {
    updateBill(bill.id, { notes });
    setEditingNotes(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>

        {/* ── Header ── */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 10, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Details</Text>

          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleEdit} hitSlop={12} style={styles.headerIcon}>
              <Feather name="edit-2" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} hitSlop={12} style={styles.headerIcon}>
              <Feather name="trash-2" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Body ── */}
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >

          {/* Hero section */}
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: cfg.bg }]}>
              <Feather name={cfg.icon as any} size={30} color={cfg.fg} />
            </View>

            <Text style={[styles.heroTitle, { color: colors.foreground }]}>{bill.title}</Text>

            <Text style={[styles.heroAmount, { color: colors.foreground }]}>
              ${bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </Text>

            {/* Badges */}
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="calendar" size={12} color={colors.mutedForeground} />
                <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                  By {fmtDate(bill.dueDate)}
                </Text>
              </View>

              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: statusColor + "22",
                    borderColor: statusColor,
                  },
                ]}
              >
                <Feather name={statusIcon as any} size={12} color={statusColor} />
                <Text style={[styles.badgeText, { color: statusColor }]}>{statusText}</Text>
              </View>
            </View>

            {/* Mark Paid */}
            {!bill.isPaid && (
              <TouchableOpacity
                style={[styles.markPaidBtn, { borderColor: colors.primary }]}
                onPress={handleMarkPaid}
              >
                <Feather name="check" size={16} color={colors.primary} />
                <Text style={[styles.markPaidText, { color: colors.primary }]}>Mark Paid</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Info card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

            {/* Notes */}
            <TouchableOpacity
              style={[styles.infoRow, { borderBottomColor: colors.border }]}
              onPress={() => { setEditingNotes(true); }}
              activeOpacity={0.7}
            >
              <View style={[styles.infoIconWrap, { backgroundColor: colors.primary + "25" }]}>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              {editingNotes ? (
                <TextInput
                  style={[styles.notesInput, { color: colors.foreground }]}
                  value={notes}
                  onChangeText={setNotes}
                  autoFocus
                  multiline
                  onBlur={handleSaveNotes}
                  placeholder="Enter notes..."
                  placeholderTextColor={colors.mutedForeground}
                />
              ) : (
                <Text
                  style={[
                    styles.infoLabel,
                    { color: notes ? colors.foreground : colors.mutedForeground, flex: 1 },
                  ]}
                >
                  {notes || "Enter Notes"}
                </Text>
              )}
              <Feather name="edit-2" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Category */}
            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.infoIconWrap, { backgroundColor: colors.primary + "25" }]}>
                <Feather name="grid" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.infoLabel, { color: colors.foreground }]}>Category</Text>
              <Text style={[styles.infoValue, { color: colors.mutedForeground }]}>{bill.category}</Text>
            </View>

            {/* Paid Date */}
            {bill.isPaid && (
              <TouchableOpacity
                style={[styles.infoRow, { borderBottomColor: colors.border }]}
                onPress={() => setShowPaidDatePicker(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.infoIconWrap, { backgroundColor: "#10b98125" }]}>
                  <Feather name="check-circle" size={18} color="#10b981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.foreground }]}>Paid Date</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>Tap to change</Text>
                </View>
                <Text style={[styles.infoValue, { color: "#10b981", fontFamily: "Inter_600SemiBold" }]}>
                  {bill.paidDate ? fmtDate(bill.paidDate) : fmtDate(bill.updatedAt || bill.dueDate)}
                </Text>
                <Feather name="edit-2" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}

            {/* Reminder / Recurrence */}
            <View style={[styles.infoRow, { borderBottomWidth: bill.endDate ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }]}>
              <View style={[styles.infoIconWrap, { backgroundColor: colors.primary + "25" }]}>
                <Feather name="bell" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.infoLabel, { color: colors.foreground }]}>Reminder</Text>
              <Text style={[styles.infoValue, { color: colors.mutedForeground }]}>
                {bill.isRecurring
                  ? `Repeats ${bill.frequency ?? "monthly"}`
                  : "One-time bill"}
              </Text>
            </View>

            {/* End Date */}
            {bill.endDate && (
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <View style={[styles.infoIconWrap, { backgroundColor: colors.primary + "25" }]}>
                  <Feather name="calendar" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.infoLabel, { color: colors.foreground }]}>End Date</Text>
                <Text style={[styles.infoValue, { color: colors.mutedForeground }]}>
                  Ends {fmtDate(bill.endDate)}
                </Text>
              </View>
            )}
          </View>

          {/* Timestamps */}
          {(bill.createdAt || bill.updatedAt) && (
            <View style={styles.timestamps}>
              {bill.updatedAt && (
                <Text style={[styles.tsText, { color: colors.mutedForeground }]}>
                  Updated {fmtDateTime(bill.updatedAt)}
                </Text>
              )}
              {bill.createdAt && (
                <Text style={[styles.tsText, { color: colors.mutedForeground }]}>
                  Created {fmtDate(bill.createdAt)}
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        {/* Paid Date Picker */}
        {Platform.OS === "android" && showPaidDatePicker && (
          <DateTimePicker
            value={paidDateObj}
            mode="date"
            display="default"
            onChange={(_, d) => {
              setShowPaidDatePicker(false);
              if (d) handleUpdatePaidDate(d);
            }}
          />
        )}

        {Platform.OS !== "android" && (
          <Modal visible={showPaidDatePicker} transparent animationType="fade" onRequestClose={() => setShowPaidDatePicker(false)}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowPaidDatePicker(false)} />
            <View style={styles.dateSheetWrap}>
              <View style={[styles.dateSheetCard, { backgroundColor: colors.card }]}>
                <View style={[styles.dateSheetHandle, { backgroundColor: colors.border }]} />
                <View style={styles.dateSheetHeader}>
                  <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Paid Date</Text>
                  <TouchableOpacity onPress={() => setShowPaidDatePicker(false)} style={[styles.donePill, { backgroundColor: colors.primary }]}>
                    <Text style={styles.donePillText}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={paidDateObj}
                  mode="date"
                  display="inline"
                  onChange={(_, d) => { if (d) handleUpdatePaidDate(d); }}
                />
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerRight: { flexDirection: "row", gap: 12 },
  headerIcon:  { padding: 4 },

  body: { paddingHorizontal: 16, paddingTop: 24, gap: 16 },

  hero: { alignItems: "center", gap: 10 },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle:  { fontSize: 22, fontFamily: "Inter_700Bold" },
  heroAmount: { fontSize: 32, fontFamily: "Inter_700Bold" },

  badgeRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  markPaidBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 4,
  },
  markPaidText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel:  { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  infoValue:  { fontSize: 14, fontFamily: "Inter_400Regular" },
  notesInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 24 },

  timestamps: { alignItems: "center", gap: 4, paddingTop: 8 },
  tsText:     { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Date picker sheet (iOS)
  overlay:         { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  dateSheetWrap:   { position: "absolute", bottom: 0, left: 0, right: 0 },
  dateSheetCard:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, paddingHorizontal: 16 },
  dateSheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 8, marginBottom: 4 },
  dateSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 12 },
  pickerTitle:     { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  donePill:        { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  donePillText:    { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
