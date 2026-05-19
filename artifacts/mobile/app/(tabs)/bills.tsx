import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AddEntrySheet from "@/components/AddEntrySheet";
import BillDetailSheet from "@/components/BillDetailSheet";
import EditBillSheet from "@/components/EditBillSheet";
import BillFilterModal, {
  BillFilterSettings,
  DEFAULT_FILTER,
} from "@/components/BillFilterModal";
import { Bill, useApp } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

// ─── Overdue Bills Modal ─────────────────────────────────────────────────────
const WIN_H = Dimensions.get("window").height;

function OverdueBillsModal({ bills, visible, onClose, onMarkPaid, onDelete }: {
  bills: Bill[]; visible: boolean; onClose: () => void;
  onMarkPaid: (ids: string[]) => void; onDelete: (ids: string[]) => void;
}) {
  const colors = useColors();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = selected.size === bills.length && bills.length > 0;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(bills.map(b => b.id)));
  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleMarkPaid = () => {
    if (!selected.size) return;
    onMarkPaid([...selected]);
    setSelected(new Set());
  };
  const handleDelete = () => {
    if (!selected.size) return;
    Alert.alert("Delete Bills", `Delete ${selected.size} bill${selected.size > 1 ? "s" : ""}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { onDelete([...selected]); setSelected(new Set()); } },
    ]);
  };

  // Group by month
  const grouped = useMemo(() => {
    const map: Record<string, Bill[]> = {};
    bills.forEach(b => {
      const key = new Date(b.dueDate).toLocaleString("default", { month: "long", year: "numeric" });
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return Object.entries(map);
  }, [bills]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ovSt.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[ovSt.sheet, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={ovSt.header}>
            <Text style={[ovSt.headerTitle, { color: colors.foreground }]}>
              {selected.size > 0 ? `${selected.size} selected` : `${bills.length} Overdue`}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Actions row */}
          <View style={[ovSt.actionsRow, { borderBottomColor: colors.border }]}>
            <TouchableOpacity style={ovSt.selectAllRow} onPress={toggleAll} activeOpacity={0.7}>
              <View style={[ovSt.checkbox, { borderColor: allSelected ? colors.primary : colors.border, backgroundColor: allSelected ? colors.primary : "transparent" }]}>
                {allSelected && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text style={[ovSt.selectAllText, { color: colors.foreground }]}>Select all</Text>
            </TouchableOpacity>
            <View style={ovSt.actionBtns}>
              <TouchableOpacity
                onPress={handleMarkPaid}
                hitSlop={8}
                style={[ovSt.actionBtn, { opacity: selected.size ? 1 : 0.35 }]}
              >
                <Feather name="check" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                hitSlop={8}
                style={[ovSt.actionBtn, { opacity: selected.size ? 1 : 0.35 }]}
              >
                <Feather name="trash-2" size={20} color={colors.expense} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bills list */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {grouped.map(([month, monthBills]) => {
              const monthTotal = monthBills.reduce((s, b) => s + b.amount, 0);
              return (
                <View key={month}>
                  <View style={ovSt.monthRow}>
                    <Text style={[ovSt.monthLabel, { color: colors.foreground }]}>{month.split(" ")[0]}</Text>
                    <Text style={[ovSt.monthTotal, { color: colors.foreground }]}>${monthTotal.toFixed(2)}</Text>
                  </View>
                  {monthBills.map(bill => {
                    const cfg = catConfig(bill.category);
                    const daysLate = Math.abs(daysUntil(bill.dueDate));
                    const isSelected = selected.has(bill.id);
                    const dueDateFmt = new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    const daysAgoLabel = daysLate === 1 ? "Yesterday" : dueDateFmt;
                    return (
                      <TouchableOpacity
                        key={bill.id}
                        onPress={() => toggle(bill.id)}
                        activeOpacity={0.8}
                        style={[ovSt.billRow, { backgroundColor: "#7c1f1f22", borderColor: "#ef444430" }]}
                      >
                        {/* Icon with checkbox overlay */}
                        <View>
                          <View style={[ovSt.iconBg, { backgroundColor: cfg.bg }]}>
                            <Feather name={cfg.icon as any} size={18} color={cfg.fg} />
                          </View>
                          {isSelected && (
                            <View style={ovSt.checkOverlay}>
                              <Feather name="check" size={10} color="#fff" />
                            </View>
                          )}
                        </View>
                        {/* Info */}
                        <View style={{ flex: 1 }}>
                          <Text style={[ovSt.billName, { color: colors.foreground }]} numberOfLines={1}>{bill.name}</Text>
                          <Text style={ovSt.billDue}>
                            {daysAgoLabel}{" "}
                            <Text style={{ color: "#ef4444" }}>· {daysLate} day{daysLate !== 1 ? "s" : ""} past</Text>
                          </Text>
                        </View>
                        <Text style={[ovSt.billAmt, { color: colors.foreground }]}>${bill.amount.toFixed(2)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const ovSt = StyleSheet.create({
  backdrop:      { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 34 : 16, maxHeight: WIN_H * 0.85 },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16 },
  headerTitle:   { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  actionsRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, marginBottom: 8 },
  selectAllRow:  { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  selectAllText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  actionBtns:    { flexDirection: "row", gap: 20 },
  actionBtn:     { padding: 4 },
  monthRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4 },
  monthLabel:    { fontSize: 15, fontFamily: "Inter_700Bold" },
  monthTotal:    { fontSize: 15, fontFamily: "Inter_700Bold" },
  billRow:       { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  iconBg:        { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  checkOverlay:  { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  billName:      { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  billDue:       { fontSize: 12, fontFamily: "Inter_400Regular", color: "#aaa", marginTop: 2 },
  billAmt:       { fontSize: 15, fontFamily: "Inter_700Bold" },
});

// ─── Category config ──────────────────────────────────────────────────────────
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

function catConfig(category: string) {
  return CAT_ICON[category] ?? CAT_ICON.Other;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function daysUntil(dueDate: string) {
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
}

// ─── Recurring occurrence generator ──────────────────────────────────────────
function addFreq(date: Date, freq: string): Date {
  const d = new Date(date);
  switch (freq) {
    case "daily":     d.setDate(d.getDate() + 1);        break;
    case "weekly":    d.setDate(d.getDate() + 7);        break;
    case "biweekly":  d.setDate(d.getDate() + 14);       break;
    case "monthly":   d.setMonth(d.getMonth() + 1);      break;
    case "quarterly": d.setMonth(d.getMonth() + 3);      break;
    case "semiannual":d.setMonth(d.getMonth() + 6);      break;
    case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

function occurrenceLimit(freq: string): Date {
  const limit = new Date();
  if (freq === "daily" || freq === "weekly" || freq === "biweekly") {
    limit.setMonth(limit.getMonth() + 3);       // 3 months for high-frequency
  } else {
    limit.setFullYear(limit.getFullYear() + 1);  // 1 year for others
  }
  return limit;
}

function generateOccurrences(bill: Bill): Bill[] {
  if (!bill.isRecurring || !bill.frequency || bill.isPaid) return [];
  const result: Bill[] = [];
  const limit = occurrenceLimit(bill.frequency);
  let next = addFreq(new Date(bill.dueDate), bill.frequency);
  while (next <= limit) {
    result.push({
      ...bill,
      id: `${bill.id}_occ_${next.getTime()}`,
      dueDate: next.toISOString(),
      isPaid: false,
    });
    next = addFreq(next, bill.frequency);
  }
  return result;
}

function statusLabel(bill: Bill) {
  if (bill.isPaid) return "Paid";
  const d = daysUntil(bill.dueDate);
  if (d < 0)   return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  return `Due ${new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─── Sort helper ──────────────────────────────────────────────────────────────
function sortBills(list: Bill[], sortBy: BillFilterSettings["sortBy"]): Bill[] {
  const s = list.slice();
  switch (sortBy) {
    case "date_asc":    return s.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    case "date_desc":   return s.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
    case "amount_high": return s.sort((a, b) => b.amount - a.amount);
    case "amount_low":  return s.sort((a, b) => a.amount - b.amount);
    case "title_asc":   return s.sort((a, b) => a.title.localeCompare(b.title));
    default:            return s;
  }
}

// ─── Group helper ─────────────────────────────────────────────────────────────
function groupBills(
  list: Bill[],
  groupBy: BillFilterSettings["groupBy"],
  startDay: number
): Record<string, Bill[]> {
  const groups: Record<string, Bill[]> = {};

  list.forEach((b) => {
    const d = new Date(b.dueDate);
    let key: string;

    if (groupBy === "weekly") {
      // ISO week label
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      key = `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else if (groupBy === "biweekly") {
      // 2-week buckets from Jan 1
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
      const period = Math.floor(dayOfYear / 14);
      const pStart = new Date(jan1);
      pStart.setDate(pStart.getDate() + period * 14);
      const pEnd = new Date(pStart);
      pEnd.setDate(pEnd.getDate() + 13);
      key = `${pStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${pEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else if (groupBy === "custom") {
      // Month starting from startDay
      let yr = d.getFullYear();
      let mo = d.getMonth();
      if (d.getDate() < startDay) {
        mo -= 1;
        if (mo < 0) { mo = 11; yr -= 1; }
      }
      const ref = new Date(yr, mo, startDay);
      key = `${ref.toLocaleDateString("en-US", { month: "long", year: "numeric" })} (from day ${startDay})`;
    } else {
      // monthly (default)
      key = d.toLocaleString("default", { month: "long", year: "numeric" });
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  return groups;
}

// ─── Single bill row ──────────────────────────────────────────────────────────
function BillRow({
  bill,
  onPay,
  onDelete,
  onPress,
}: {
  bill: Bill;
  onPay: () => void;
  onDelete: () => void;
  onPress: () => void;
}) {
  const colors = useColors();
  const isVirtual = bill.id.includes("_occ_");
  const cfg = catConfig(bill.category);
  const d = daysUntil(bill.dueDate);
  const isOverdue = !bill.isPaid && d < 0;
  const isDueSoon = !bill.isPaid && d >= 0 && d <= 3;
  const label = statusLabel(bill);

  const statusColor = bill.isPaid
    ? colors.success
    : isOverdue
    ? colors.expense
    : isDueSoon
    ? "#f59e0b"
    : colors.mutedForeground;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      onLongPress={isVirtual ? undefined : () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.alert(bill.title, "What would you like to do?", [
          { text: "Cancel", style: "cancel" },
          !bill.isPaid
            ? {
                text: "Mark as Paid",
                onPress: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onPay();
                },
              }
            : null,
          { text: "Delete", style: "destructive", onPress: onDelete },
        ].filter(Boolean) as any);
      }}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.catIcon, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon as any} size={18} color={cfg.fg} />
      </View>

      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{bill.title}</Text>
        <View style={styles.rowMeta}>
          {bill.isRecurring && (
            <>
              <Feather name="repeat" size={10} color={colors.mutedForeground} />
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{bill.frequency}</Text>
              <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
            </>
          )}
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
            {new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
        </View>
        {!bill.isPaid && !isVirtual && (
          <TouchableOpacity
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onPay();
            }}
            hitSlop={8}
          >
            <Text style={[styles.payNow, { color: colors.expense }]}>Pay now</Text>
          </TouchableOpacity>
        )}
        {isVirtual && (
          <Text style={[styles.rowSub, { color: colors.mutedForeground, fontStyle: "italic" }]}>Projected</Text>
        )}
        {bill.isPaid && (
          <View style={styles.paidBadge}>
            <Feather name="check-circle" size={11} color={colors.success} />
            <Text style={[styles.paidText, { color: colors.success }]}>Paid</Text>
          </View>
        )}
      </View>

      <View style={styles.rowRight}>
        <Text style={[styles.rowAmt, { color: colors.foreground }]}>
          ${bill.amount.toFixed(2)}
        </Text>
        {!bill.isPaid && (
          <View style={[styles.daysBadge, { backgroundColor: statusColor + "22", borderColor: statusColor }]}>
            <Text style={[styles.daysBadgeText, { color: statusColor }]}>
              {isOverdue
                ? `${Math.abs(d)}d late`
                : d === 0
                ? "Today"
                : d === 1
                ? "Tomorrow"
                : `${d} days`}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Month/period group ───────────────────────────────────────────────────────
function BillGroup({
  label,
  bills,
  onPay,
  onDelete,
  onPress,
}: {
  label: string;
  bills: Bill[];
  onPay: (id: string) => void;
  onDelete: (id: string) => void;
  onPress: (bill: Bill) => void;
}) {
  const colors = useColors();
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <View style={styles.monthGroup}>
      <View style={[styles.monthHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.monthName, { color: colors.primary }]}>{label}</Text>
        <Text style={[styles.monthTotal, { color: colors.primary }]}>
          ${total.toFixed(2)}
        </Text>
      </View>
      {bills.map((b) => (
        <BillRow
          key={b.id}
          bill={b}
          onPay={() => onPay(b.id)}
          onDelete={() => onDelete(b.id)}
          onPress={() => onPress(b)}
        />
      ))}
    </View>
  );
}

// ─── Calendar tab ─────────────────────────────────────────────────────────────
function CalendarView({
  bills,
  onPay,
  onDelete,
  onPress,
}: {
  bills: Bill[];
  onPay: (id: string) => void;
  onDelete: (id: string) => void;
  onPress: (bill: Bill) => void;
}) {
  const colors = useColors();
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel  = new Date(viewYear, viewMonth).toLocaleString("default", { month: "long", year: "numeric" });

  const byDay: Record<number, Bill[]> = {};
  bills.forEach((b) => {
    const d = new Date(b.dueDate);
    if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
      const day = d.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(b);
    }
  });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const selectedBills = selectedDay ? (byDay[selectedDay] || []) : [];

  const prevMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <View>
      <View style={[styles.calNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={prevMonth} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.calMonthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={12}>
          <Feather name="chevron-right" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.calDayRow}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <Text key={d} style={[styles.calDayName, { color: colors.mutedForeground }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.calCell} />;
          const hasBill   = !!byDay[day];
          const isToday   = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          const isSelected = day === selectedDay;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.calCell, isSelected && { backgroundColor: colors.primary + "20", borderRadius: 8 }]}
              onPress={() => setSelectedDay(isSelected ? null : day)}
            >
              <View style={[styles.calDayCircle, isToday && { backgroundColor: colors.primary }]}>
                <Text style={[styles.calDayNum, { color: isToday ? "#fff" : colors.foreground }]}>{day}</Text>
              </View>
              {hasBill && <View style={[styles.calDot, { backgroundColor: colors.expense }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedDay && (
        <View style={[styles.calSelected, { borderTopColor: colors.border }]}>
          <Text style={[styles.calSelectedTitle, { color: colors.foreground }]}>
            {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </Text>
          {selectedBills.length === 0 ? (
            <Text style={[styles.calNoBills, { color: colors.mutedForeground }]}>No bills due this day</Text>
          ) : (
            selectedBills.map((b) => (
              <BillRow key={b.id} bill={b} onPay={() => onPay(b.id)} onDelete={() => onDelete(b.id)} onPress={() => onPress(b)} />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────
function SummaryStrip() {
  const colors = useColors();
  const { bills } = useApp();
  const upcoming = bills.filter((b) => !b.isPaid).reduce((s, b) => s + b.amount, 0);
  const overdue  = bills.filter((b) => !b.isPaid && daysUntil(b.dueDate) < 0).length;
  const paid     = bills.filter((b) => b.isPaid).length;

  return (
    <View style={[styles.strip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.stripItem}>
        <Text style={[styles.stripAmt, { color: colors.foreground }]}>${upcoming.toFixed(0)}</Text>
        <Text style={[styles.stripLabel, { color: colors.mutedForeground }]}>Upcoming</Text>
      </View>
      <View style={[styles.stripDivider, { backgroundColor: colors.border }]} />
      <View style={styles.stripItem}>
        <Text style={[styles.stripAmt, { color: overdue > 0 ? colors.expense : colors.foreground }]}>{overdue}</Text>
        <Text style={[styles.stripLabel, { color: colors.mutedForeground }]}>Overdue</Text>
      </View>
      <View style={[styles.stripDivider, { backgroundColor: colors.border }]} />
      <View style={styles.stripItem}>
        <Text style={[styles.stripAmt, { color: colors.success }]}>{paid}</Text>
        <Text style={[styles.stripLabel, { color: colors.mutedForeground }]}>Paid</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
type Tab = "upcoming" | "calendar" | "recurring" | "paid";
const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming",  label: "UPCOMING"  },
  { key: "calendar",  label: "CALENDAR"  },
  { key: "recurring", label: "RECURRING" },
  { key: "paid",      label: "PAID"      },
];

export default function BillsScreen() {
  const colors = useColors();
  const { openDrawer } = useDrawer();
  const { bills, addBill, updateBill, markBillPaid, deleteBill } = useApp();
  const [tab, setTab]           = useState<Tab>("upcoming");
  const [showAdd, setShowAdd]   = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterSettings, setFilterSettings] = useState<BillFilterSettings>(DEFAULT_FILTER);
  const [detailBill,        setDetailBill]        = useState<Bill | null>(null);
  const [editBill,           setEditBill]           = useState<Bill | null>(null);
  const [thisOnlyParent,     setThisOnlyParent]     = useState<Bill | null>(null);
  const [showOverdueModal,   setShowOverdueModal]   = useState(false);

  // Called when user picks "THIS ONLY" for edit on a recurring bill
  const onEditThisOnly = (bill: Bill) => {
    setDetailBill(null);
    // Open EditBillSheet in create-mode with isRecurring:false for this specific date
    setEditBill({ ...bill, isRecurring: false, frequency: undefined });
    setThisOnlyParent(bill);
  };

  // Called when EditBillSheet saves in create-mode
  const handleCreateThisOnly = (data: Omit<Bill, "id">) => {
    addBill({ ...data, isRecurring: false, frequency: undefined });
    if (thisOnlyParent?.frequency) {
      const next = addFreq(new Date(thisOnlyParent.dueDate), thisOnlyParent.frequency);
      updateBill(thisOnlyParent.id, { dueDate: next.toISOString() });
    }
    setThisOnlyParent(null);
    setEditBill(null);
  };

  // Called when user picks "THIS ONLY" for delete on a recurring bill
  const onDeleteThisOnly = (bill: Bill) => {
    if (bill.frequency) {
      const next = addFreq(new Date(bill.dueDate), bill.frequency);
      updateBill(bill.id, { dueDate: next.toISOString() });
    }
  };

  const onPressBill = (b: Bill) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (b.id.includes("_occ_")) {
      const parentId = b.id.split("_occ_")[0];
      setDetailBill(bills.find((bill) => bill.id === parentId) ?? null);
      return;
    }
    setDetailBill(b);
  };
  // Has any non-default filter active?
  const isFiltered =
    filterSettings.sortBy !== DEFAULT_FILTER.sortBy ||
    filterSettings.groupBy !== DEFAULT_FILTER.groupBy ||
    filterSettings.accountIds.length > 0;

  // Apply account filter then sort, then group
  function prepare(list: Bill[]) {
    let result = list;
    if (filterSettings.accountIds.length > 0) {
      result = result.filter(
        (b) => b.accountId && filterSettings.accountIds.includes(b.accountId)
      );
    }
    result = sortBills(result, filterSettings.sortBy);
    return groupBills(result, filterSettings.groupBy, filterSettings.startDay);
  }

  // Overdue non-recurring unpaid bills (past due, one-time)
  const overdueBills = useMemo(
    () => bills.filter((b) => !b.isPaid && !b.isRecurring && daysUntil(b.dueDate) < 0),
    [bills]
  );
  // Upcoming = unpaid AND (recurring OR due today/future) + virtual future occurrences
  const upcomingBills = useMemo(() => {
    const base = bills.filter((b) => !b.isPaid && (b.isRecurring || daysUntil(b.dueDate) >= 0));
    const virtual = bills
      .filter((b) => b.isRecurring && !b.isPaid)
      .flatMap(generateOccurrences)
      .filter((b) => daysUntil(b.dueDate) >= 0);
    return [...base, ...virtual];
  }, [bills]);
  const recurringBills = useMemo(() => bills.filter((b) => b.isRecurring), [bills]);
  const paidBills      = useMemo(() => bills.filter((b) => b.isPaid), [bills]);

  const overdueGroups   = useMemo(() => prepare(overdueBills),   [overdueBills,   filterSettings]);
  const upcomingGroups  = useMemo(() => prepare(upcomingBills),  [upcomingBills,  filterSettings]);
  const recurringGroups = useMemo(() => prepare(recurringBills), [recurringBills, filterSettings]);
  const paidGroups      = useMemo(() => prepare(paidBills),      [paidBills,      filterSettings]);

  function renderGroups(groups: Record<string, Bill[]>) {
    const entries = Object.entries(groups);
    if (entries.length === 0) {
      return (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="file-text" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No bills here</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)}>
            <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Bill</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return entries.map(([label, list]) => (
      <BillGroup
        key={label}
        label={label}
        bills={list}
        onPay={markBillPaid}
        onDelete={deleteBill}
        onPress={onPressBill}
      />
    ));
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 64 : 14, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity hitSlop={8} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }}>
          <Feather name="menu" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bills</Text>
        <View style={styles.headerIcons}>
          {/* Filter button — dot indicator when active */}
          <TouchableOpacity
            hitSlop={8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowFilter(true);
            }}
          >
            <View>
              <Feather name="sliders" size={20} color={colors.primary} />
              {isFiltered && (
                <View style={[styles.filterDot, { backgroundColor: colors.expense }]} />
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8}>
            <Feather name="download" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary strip */}
      <SummaryStrip />

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[
              styles.tabItem,
              tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTab(t.key);
            }}
          >
            <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === "calendar" ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }]}
        >
          <CalendarView
            bills={bills}
            onPay={markBillPaid}
            onDelete={deleteBill}
            onPress={onPressBill}
          />
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }]}
        >
          {tab === "upcoming" && (
            <>
              {overdueBills.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowOverdueModal(true); }}
                  style={styles.overdueBanner}
                >
                  <View style={styles.overdueBannerLeft}>
                    <View style={styles.overdueDot} />
                    <View>
                      <Text style={styles.overdueBannerTitle}>Overdue</Text>
                      <Text style={styles.overdueBannerNames} numberOfLines={1}>
                        {overdueBills.map(b => b.name).join(", ")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.overdueBannerRight}>
                    <Text style={styles.overdueBannerAmt}>
                      ${overdueBills.reduce((s, b) => s + b.amount, 0).toFixed(0)}
                    </Text>
                    <Feather name="chevron-right" size={18} color="#ef4444" />
                  </View>
                </TouchableOpacity>
              )}
              {renderGroups(upcomingGroups)}
            </>
          )}
          {tab === "recurring" && renderGroups(recurringGroups)}
          {tab === "paid"      && renderGroups(paidGroups)}
        </ScrollView>
      )}

      <OverdueBillsModal
        bills={overdueBills}
        visible={showOverdueModal}
        onClose={() => setShowOverdueModal(false)}
        onMarkPaid={(ids) => { ids.forEach(id => markBillPaid(id)); setShowOverdueModal(false); }}
        onDelete={(ids) => { ids.forEach(id => deleteBill(id)); setShowOverdueModal(false); }}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAdd(true);
        }}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <AddEntrySheet visible={showAdd} initialTab="BILLS" onClose={() => setShowAdd(false)} />

      <BillDetailSheet
        bill={detailBill}
        visible={!!detailBill}
        onClose={() => setDetailBill(null)}
        onEdit={(b) => { setDetailBill(null); setEditBill(b); }}
        onEditThisOnly={onEditThisOnly}
        onDeleteThisOnly={onDeleteThisOnly}
      />

      <EditBillSheet
        bill={editBill}
        visible={!!editBill}
        onClose={() => { setEditBill(null); setThisOnlyParent(null); }}
        onCreateBill={thisOnlyParent ? handleCreateThisOnly : undefined}
      />

      <BillFilterModal
        visible={showFilter}
        current={filterSettings}

        onApply={(s) => {
          setFilterSettings(s);
          setShowFilter(false);
        }}
        onClose={() => setShowFilter(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerIcons: { flexDirection: "row", gap: 18, alignItems: "center" },
  filterDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  // Summary strip
  strip: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 18, borderBottomWidth: 1 },
  stripItem: { flex: 1, alignItems: "center", gap: 2 },
  stripAmt: { fontSize: 18, fontFamily: "Inter_700Bold" },
  stripLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  stripDivider: { width: 1, marginVertical: 4 },
  // Tabs
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 14, gap: 20 },
  // Month/period group
  monthGroup: { gap: 10 },
  monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1 },
  monthName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  monthTotal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  // Bill row
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  catIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dot: { fontSize: 12 },
  payNow: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  paidText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  rowRight:      { alignItems: "flex-end", gap: 5 },
  rowAmt:        { fontSize: 15, fontFamily: "Inter_700Bold" },
  daysBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  daysBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  // Overdue banner
  overdueBanner:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#7c1f1f", borderWidth: 1, borderColor: "#ef444450", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 4 },
  overdueBannerLeft:  { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  overdueDot:         { width: 12, height: 12, borderRadius: 6, backgroundColor: "#ef4444", borderWidth: 2, borderColor: "#fff" },
  overdueBannerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#ef4444" },
  overdueBannerNames: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#fff", marginTop: 2, maxWidth: 200 },
  overdueBannerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  overdueBannerAmt:   { fontSize: 16, fontFamily: "Inter_700Bold", color: "#ef4444" },
  // Empty
  empty: { padding: 40, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 12, marginTop: 16 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  emptyAction: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  // Calendar
  calNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1 },
  calMonthLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  calDayRow: { flexDirection: "row", paddingTop: 10, paddingBottom: 4 },
  calDayName: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", alignItems: "center", paddingVertical: 4, gap: 2 },
  calDayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  calDayNum: { fontSize: 13, fontFamily: "Inter_500Medium" },
  calDot: { width: 5, height: 5, borderRadius: 3 },
  calSelected: { borderTopWidth: 1, marginTop: 8, paddingTop: 12, gap: 10 },
  calSelectedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  calNoBills: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 12 },
  // FAB
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
