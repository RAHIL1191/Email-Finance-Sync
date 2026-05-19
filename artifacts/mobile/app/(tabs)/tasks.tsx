import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useMemo } from "react";
import {
  Alert,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp, Task } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

// ─── Constants ────────────────────────────────────────────────────────────────
const TASK_CATEGORIES = ["Subscription", "Appointment", "Payment", "Reminder", "Bill Cancel", "Other"];
const PAYMENT_MODES   = ["Credit Card", "Debit Card", "PayPal", "Bank Transfer", "Cash", "Other"];

const PRIORITY_COLORS: Record<Task["priority"], string> = {
  low: "#22c55e", medium: "#f59e0b", high: "#ef4444",
};
const PRIORITY_LABELS: Record<Task["priority"], string> = {
  low: "Low", medium: "Medium", high: "High",
};

// ─── TaskFormSheet ─────────────────────────────────────────────────────────────
function TaskFormSheet({
  visible, initial, onClose, onSave,
}: {
  visible: boolean;
  initial: Task | null;
  onClose: () => void;
  onSave: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [title,           setTitle]           = useState("");
  const [category,        setCategory]        = useState("Subscription");
  const [email,           setEmail]           = useState("");
  const [paymentMode,     setPaymentMode]     = useState("");
  const [dueDate,         setDueDate]         = useState(new Date());
  const [showDuePicker,   setShowDuePicker]   = useState(false);
  const [priority,        setPriority]        = useState<Task["priority"]>("medium");
  const [reminderEnabled,    setReminderEnabled]    = useState(false);
  const [reminderDate,       setReminderDate]       = useState(new Date());
  const [showRemDatePicker,  setShowRemDatePicker]  = useState(false);
  const [showRemTimePicker,  setShowRemTimePicker]  = useState(false);
  const [notes,           setNotes]           = useState("");

  React.useEffect(() => {
    if (!visible) return;
    if (initial) {
      setTitle(initial.title);
      setCategory(initial.category);
      setEmail(initial.email ?? "");
      setPaymentMode(initial.paymentMode ?? "");
      setDueDate(new Date(initial.dueDate));
      setPriority(initial.priority);
      setReminderEnabled(initial.reminderEnabled);
      setReminderDate(initial.reminderDate ? new Date(initial.reminderDate) : new Date());
      setShowRemDatePicker(false); setShowRemTimePicker(false);
      setNotes(initial.notes ?? "");
    } else {
      setTitle(""); setCategory("Subscription"); setEmail(""); setPaymentMode("");
      setDueDate(new Date()); setPriority("medium");
      setReminderEnabled(false); setReminderDate(new Date());
      setShowRemDatePicker(false); setShowRemTimePicker(false); setNotes("");
    }
  }, [visible, initial]);

  const save = () => {
    if (!title.trim()) { Alert.alert("Missing Title", "Please enter a task title."); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      title:           title.trim(),
      category,
      email:           email.trim() || undefined,
      paymentMode:     paymentMode || undefined,
      dueDate:         dueDate.toISOString(),
      priority,
      reminderEnabled,
      reminderDate:    reminderEnabled ? reminderDate.toISOString() : undefined,
      notes:           notes.trim() || undefined,
      isCompleted:     initial?.isCompleted ?? false,
    });
    onClose();
  };

  const inputStyle = [f.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[f.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}>

        {/* Header */}
        <View style={[f.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={[f.cancel, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[f.headerTitle, { color: colors.foreground }]}>{initial ? "Edit Task" : "New Task"}</Text>
          <TouchableOpacity onPress={save} hitSlop={8}>
            <Text style={[f.save, { color: colors.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={f.body} keyboardShouldPersistTaps="handled">

          {/* Title */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Title *</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. Cancel Netflix trial before renewal"
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
          />

          {/* Category */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={f.chipRow}>
            {TASK_CATEGORIES.map((c) => {
              const on = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  style={[f.chip, { backgroundColor: on ? colors.primary : colors.background, borderColor: on ? colors.primary : colors.border }]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[f.chipTxt, { color: on ? "#fff" : colors.foreground }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Priority */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Priority</Text>
          <View style={f.priorityRow}>
            {(["low", "medium", "high"] as Task["priority"][]).map((p) => {
              const on = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[f.priorityBtn, { borderColor: PRIORITY_COLORS[p], backgroundColor: on ? PRIORITY_COLORS[p] : "transparent" }]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[f.priorityBtnTxt, { color: on ? "#fff" : PRIORITY_COLORS[p] }]}>{PRIORITY_LABELS[p]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Due Date */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Due Date</Text>
          <TouchableOpacity style={[f.datePick, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => setShowDuePicker(true)}>
            <Feather name="calendar" size={16} color={colors.primary} />
            <Text style={[f.datePickTxt, { color: colors.foreground }]}>
              {dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </Text>
          </TouchableOpacity>
          {showDuePicker && (
            <DateTimePicker
              value={dueDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, d) => { if (d) setDueDate(d); setShowDuePicker(false); }}
            />
          )}

          {/* Email */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Email (optional)</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. billing@netflix.com"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {/* Payment Mode */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Payment Mode (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={f.chipRow}>
            {PAYMENT_MODES.map((m) => {
              const on = paymentMode === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[f.chip, { backgroundColor: on ? colors.primary + "22" : colors.background, borderColor: on ? colors.primary : colors.border }]}
                  onPress={() => setPaymentMode(on ? "" : m)}
                >
                  <Text style={[f.chipTxt, { color: on ? colors.primary : colors.foreground }]}>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Reminder */}
          <View style={[f.reminderRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[f.label, { color: colors.mutedForeground, marginBottom: 0 }]}>Reminder</Text>
              {reminderEnabled && (
                <Text style={[f.reminderSub, { color: colors.mutedForeground }]}>
                  {reminderDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {"  ·  "}
                  {reminderDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              )}
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={setReminderEnabled}
              trackColor={{ false: colors.border, true: "#22c55e" }}
              thumbColor="#fff"
            />
          </View>
          {reminderEnabled && (
            <View style={{ gap: 8 }}>
              {/* Date row */}
              <TouchableOpacity style={[f.datePick, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => setShowRemDatePicker(true)}>
                <Feather name="calendar" size={16} color={colors.primary} />
                <Text style={[f.datePickTxt, { color: colors.foreground }]}>
                  {reminderDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </TouchableOpacity>
              {showRemDatePicker && (
                <DateTimePicker
                  value={reminderDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, d) => {
                    setShowRemDatePicker(false);
                    if (d) {
                      const merged = new Date(reminderDate);
                      merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                      setReminderDate(merged);
                    }
                  }}
                />
              )}
              {/* Time row */}
              <TouchableOpacity style={[f.datePick, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => setShowRemTimePicker(true)}>
                <Feather name="clock" size={16} color={colors.primary} />
                <Text style={[f.datePickTxt, { color: colors.foreground }]}>
                  {reminderDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </TouchableOpacity>
              {showRemTimePicker && (
                <DateTimePicker
                  value={reminderDate}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, d) => {
                    setShowRemTimePicker(false);
                    if (d) {
                      const merged = new Date(reminderDate);
                      merged.setHours(d.getHours(), d.getMinutes());
                      setReminderDate(merged);
                    }
                  }}
                />
              )}
            </View>
          )}

          {/* Notes */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Notes</Text>
          <TextInput
            style={[inputStyle, f.textArea]}
            placeholder="Additional notes..."
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onEdit, onDelete }: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const dueDate  = new Date(task.dueDate);
  const now      = new Date();
  const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
  const isOver   = daysLeft < 0 && !task.isCompleted;
  const isSoon   = daysLeft >= 0 && daysLeft <= 3 && !task.isCompleted;
  const pColor   = PRIORITY_COLORS[task.priority];

  const dueTxt = task.isCompleted
    ? dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : isOver   ? `${Math.abs(daysLeft)}d overdue`
    : daysLeft === 0 ? "Due today"
    : daysLeft === 1 ? "Due tomorrow"
    : `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const dueColor = task.isCompleted ? colors.mutedForeground : isOver ? "#ef4444" : isSoon ? "#f59e0b" : colors.mutedForeground;

  return (
    <TouchableOpacity
      style={[ts.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onEdit}
      activeOpacity={0.8}
    >
      <View style={[ts.priorityBar, { backgroundColor: pColor }]} />

      <View style={ts.cardContent}>
        <View style={ts.cardRow}>
          {/* Completion circle */}
          <TouchableOpacity onPress={onToggle} hitSlop={8}>
            <View style={[ts.check, {
              borderColor:       task.isCompleted ? colors.primary : colors.border,
              backgroundColor:   task.isCompleted ? colors.primary : "transparent",
            }]}>
              {task.isCompleted && <Feather name="check" size={11} color="#fff" />}
            </View>
          </TouchableOpacity>

          {/* Content */}
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={[ts.cardTitle, { color: colors.foreground, textDecorationLine: task.isCompleted ? "line-through" : "none", opacity: task.isCompleted ? 0.55 : 1 }]}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            <View style={ts.metaRow}>
              <View style={[ts.catBadge, { backgroundColor: colors.primary + "18" }]}>
                <Text style={[ts.catBadgeTxt, { color: colors.primary }]}>{task.category}</Text>
              </View>
              <Text style={[ts.dueTxt, { color: dueColor }]}>{dueTxt}</Text>
            </View>
            {(task.email || task.paymentMode) && (
              <View style={ts.subRow}>
                {task.email && (
                  <View style={ts.subItem}>
                    <Feather name="mail" size={11} color={colors.mutedForeground} />
                    <Text style={[ts.subTxt, { color: colors.mutedForeground }]} numberOfLines={1}>{task.email}</Text>
                  </View>
                )}
                {task.paymentMode && (
                  <View style={ts.subItem}>
                    <Feather name="credit-card" size={11} color={colors.mutedForeground} />
                    <Text style={[ts.subTxt, { color: colors.mutedForeground }]}>{task.paymentMode}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Delete */}
          <TouchableOpacity onPress={onDelete} hitSlop={10} style={{ paddingLeft: 8 }}>
            <Feather name="trash-2" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Reminder badge */}
        {task.reminderEnabled && task.reminderDate && (
          <View style={[ts.remBadge, { backgroundColor: "#f59e0b18" }]}>
            <Feather name="bell" size={11} color="#f59e0b" />
            <Text style={[ts.remTxt, { color: "#f59e0b" }]}>
              Reminder · {new Date(task.reminderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {"  "}{new Date(task.reminderDate).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TasksScreen() {
  const colors = useColors();
  const { openDrawer } = useDrawer();
  const { tasks, addTask, updateTask, deleteTask } = useApp();

  const [filter,   setFilter]   = useState<"all" | "pending" | "completed">("all");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const sortedTasks = useMemo(() => {
    let list = [...tasks].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    if (filter === "pending")   return list.filter((t) => !t.isCompleted);
    if (filter === "completed") return list.filter((t) =>  t.isCompleted);
    return list;
  }, [tasks, filter]);

  const counts = useMemo(() => ({
    all:       tasks.length,
    pending:   tasks.filter((t) => !t.isCompleted).length,
    completed: tasks.filter((t) =>  t.isCompleted).length,
  }), [tasks]);

  const openAdd  = () => { setEditTask(null); setShowForm(true); };
  const openEdit = (t: Task) => { setEditTask(t); setShowForm(true); };

  const handleToggle = (t: Task) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateTask(t.id, { isCompleted: !t.isCompleted });
  };
  const handleDelete = (t: Task) => {
    Alert.alert("Delete Task", `Delete "${t.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteTask(t.id); } },
    ]);
  };

  return (
    <SafeAreaView style={[ts.root, { backgroundColor: colors.background }]} edges={["top"]}>

      {/* Header */}
      <View style={[ts.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }} hitSlop={8}>
          <Feather name="menu" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[ts.headerTitle, { color: colors.foreground }]}>Tasks</Text>
        <TouchableOpacity style={[ts.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={[ts.filterRow, { borderBottomColor: colors.border }]}>
        {(["all", "pending", "completed"] as const).map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[ts.filterTab, active && { borderBottomColor: colors.primary }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[ts.filterTxt, { color: active ? colors.primary : colors.mutedForeground }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
              <View style={[ts.countBadge, { backgroundColor: active ? colors.primary + "22" : colors.muted }]}>
                <Text style={[ts.countTxt, { color: active ? colors.primary : colors.mutedForeground }]}>{counts[f]}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ts.scroll}>
        {sortedTasks.length === 0 ? (
          <View style={ts.empty}>
            <View style={[ts.emptyIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="check-square" size={36} color={colors.primary} />
            </View>
            <Text style={[ts.emptyTitle, { color: colors.foreground }]}>
              {filter === "completed" ? "No completed tasks" : "No tasks yet"}
            </Text>
            <Text style={[ts.emptySub, { color: colors.mutedForeground }]}>
              {filter === "pending" ? "All tasks are complete! 🎉" : "Tap + to track your first task"}
            </Text>
            {filter !== "completed" && (
              <TouchableOpacity style={[ts.emptyBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={ts.emptyBtnTxt}>Add Task</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          sortedTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onToggle={() => handleToggle(t)}
              onEdit={() => openEdit(t)}
              onDelete={() => handleDelete(t)}
            />
          ))
        )}
      </ScrollView>

      <TaskFormSheet
        visible={showForm}
        initial={editTask}
        onClose={() => setShowForm(false)}
        onSave={(data) => {
          if (editTask) updateTask(editTask.id, data);
          else addTask(data);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const f = StyleSheet.create({
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" },
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  cancel:      { fontSize: 15, fontFamily: "Inter_400Regular" },
  save:        { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  body:        { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 4 },
  label:       { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.4, textTransform: "uppercase", marginTop: 14, marginBottom: 6 },
  input:       { height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  textArea:    { height: 80, paddingTop: 12 },
  chipRow:     { gap: 8, paddingBottom: 4 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipTxt:     { fontSize: 13, fontFamily: "Inter_500Medium" },
  priorityRow: { flexDirection: "row", gap: 10 },
  priorityBtn: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  priorityBtnTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  datePick:    { flexDirection: "row", alignItems: "center", gap: 10, height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14 },
  datePickTxt: { fontSize: 14, fontFamily: "Inter_400Regular" },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  reminderSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
});

const ts = StyleSheet.create({
  root:       { flex: 1 },
  header:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:{ flex: 1, fontSize: 22, fontFamily: "Inter_700Bold", marginLeft: 12 },
  addBtn:     { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  filterRow:  { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  filterTab:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  filterTxt:  { fontSize: 13, fontFamily: "Inter_500Medium" },
  countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  countTxt:   { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  scroll:     { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 120, gap: 10 },

  card:       { flexDirection: "row", borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  priorityBar:{ width: 4 },
  cardContent:{ flex: 1, padding: 12, gap: 8 },
  cardRow:    { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  check:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  cardTitle:  { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  metaRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  catBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catBadgeTxt:{ fontSize: 11, fontFamily: "Inter_500Medium" },
  dueTxt:     { fontSize: 12, fontFamily: "Inter_400Regular" },
  subRow:     { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  subItem:    { flexDirection: "row", alignItems: "center", gap: 4 },
  subTxt:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  remBadge:   { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
  remTxt:     { fontSize: 11, fontFamily: "Inter_500Medium" },

  empty:      { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub:   { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn:   { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  emptyBtnTxt:{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
