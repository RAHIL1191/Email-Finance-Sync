import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useMemo, useRef } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp, Task, ChecklistItem } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

// ─── Constants ────────────────────────────────────────────────────────────────
const TASK_CATEGORIES = ["Subscription", "Appointment", "Payment", "Reminder", "Bill Cancel", "Dev / Feature", "Other"];
const CATEGORY_ICONS: Record<string, string> = {
  "Subscription": "refresh-cw",
  "Appointment": "calendar",
  "Payment": "credit-card",
  "Reminder": "bell",
  "Bill Cancel": "x-circle",
  "Dev / Feature": "code",
  "Other": "more-horizontal",
};
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
  const [notesHeight,     setNotesHeight]     = useState(80);
  const [checklistItems,  setChecklistItems]  = useState<ChecklistItem[]>([]);
  const [newItemText,     setNewItemText]     = useState("");
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [expandedNoteId,  setExpandedNoteId]  = useState<string | null>(null);
  const newItemRef = useRef<TextInput>(null);
  const isDevMode = category === "Dev / Feature";

  const addChecklistItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    setChecklistItems(prev => [...prev, { id: Date.now().toString(), text, completed: false }]);
    setNewItemText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => newItemRef.current?.focus(), 50);
  };

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
      setChecklistItems(initial.checklistItems ?? []);
    } else {
      setTitle(""); setCategory("Subscription"); setEmail(""); setPaymentMode("");
      setDueDate(new Date()); setPriority("medium");
      setReminderEnabled(false); setReminderDate(new Date());
      setShowRemDatePicker(false); setShowRemTimePicker(false);
      setNotes(""); setChecklistItems([]); setNewItemText("");
      setNotesHeight(80);
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
      checklistItems:  checklistItems.length > 0 ? checklistItems : undefined,
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

        <KeyboardAwareScrollView showsVerticalScrollIndicator={false} contentContainerStyle={f.body} keyboardShouldPersistTaps="handled">

          {/* Title */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Title *</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. Cancel Netflix trial before renewal"
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
          />

          {/* Category dropdown */}
          <Text style={[f.label, { color: colors.mutedForeground }]}>Category</Text>
          <TouchableOpacity
            style={[f.dropdown, { backgroundColor: colors.background, borderColor: isDevMode ? colors.primary : colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCatDropdown(v => !v); }}
            activeOpacity={0.8}
          >
            <Feather name={CATEGORY_ICONS[category] as any} size={16} color={isDevMode ? colors.primary : colors.mutedForeground} />
            <Text style={[f.dropdownTxt, { color: colors.foreground, flex: 1 }]}>{category}</Text>
            <Feather name={showCatDropdown ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {showCatDropdown && (
            <View style={[f.dropdownList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {TASK_CATEGORIES.map((c, idx) => {
                const on = category === c;
                const isDev = c === "Dev / Feature";
                return (
                  <TouchableOpacity
                    key={c}
                    style={[f.dropdownItem,
                      idx < TASK_CATEGORIES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      on && { backgroundColor: colors.primary + "12" },
                    ]}
                    onPress={() => { setCategory(c); setShowCatDropdown(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <View style={[f.dropdownItemIcon, { backgroundColor: (isDev ? colors.primary : colors.muted) + (on ? "" : "44") }]}>
                      <Feather name={CATEGORY_ICONS[c] as any} size={14} color={isDev ? (on ? "#fff" : colors.primary) : colors.mutedForeground} />
                    </View>
                    <Text style={[f.dropdownItemTxt, { color: on ? colors.primary : colors.foreground, fontFamily: on ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{c}</Text>
                    {on && <Feather name="check" size={15} color={colors.primary} />}
                    {isDev && !on && (
                      <View style={[f.devBadge, { backgroundColor: colors.primary + "18" }]}>
                        <Text style={[f.devBadgeTxt, { color: colors.primary }]}>Dev</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Dev/Feature banner */}
          {isDevMode && (
            <View style={[f.devBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
              <Feather name="code" size={15} color={colors.primary} />
              <Text style={[f.devBannerTxt, { color: colors.primary }]}>Dev mode — checklist & notes enabled for feature tracking</Text>
            </View>
          )}

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

          {/* Email — hidden in dev mode */}
          {!isDevMode && (
            <>
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
            </>
          )}

          {/* Payment Mode — hidden in dev mode */}
          {!isDevMode && (
            <>
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
            </>
          )}

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
          <Text style={[f.label, { color: colors.mutedForeground }]}>{isDevMode ? "Description" : "Notes"}</Text>
          <TextInput
            style={[inputStyle, f.textArea, { height: Math.max(80, notesHeight) }]}
            placeholder={isDevMode ? "What is this feature about?" : "Additional notes..."}
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
            onContentSizeChange={(e) => setNotesHeight(e.nativeEvent.contentSize.height + 24)}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
          />

          {/* Checklist — available for all categories */}
          <>
            <View style={f.checklistHeader}>
              <Text style={[f.label, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>Checklist</Text>
              {checklistItems.length > 0 && (
                <Text style={[f.checklistCount, { color: colors.primary }]}>
                  {checklistItems.filter(i => i.completed).length}/{checklistItems.length} done
                </Text>
              )}
            </View>

            {checklistItems.length > 0 && (
              <View style={[f.progressBarWrap, { backgroundColor: colors.border }]}>
                <View style={[f.progressBarFill, {
                  backgroundColor: checklistItems.every(i => i.completed) ? "#22c55e" : colors.primary,
                  width: `${Math.round((checklistItems.filter(i => i.completed).length / checklistItems.length) * 100)}%` as any,
                }]} />
              </View>
            )}

            {checklistItems.map((item) => (
              <SwipeableCheckItem
                key={item.id}
                item={item}
                colors={colors}
                expandedNoteId={expandedNoteId}
                onToggle={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setChecklistItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, completed: !ci.completed } : ci));
                }}
                onComplete={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setChecklistItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, completed: true } : ci));
                }}
                onDelete={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setChecklistItems(prev => prev.filter(ci => ci.id !== item.id));
                  if (expandedNoteId === item.id) setExpandedNoteId(null);
                }}
                onChangeText={(t) => setChecklistItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, text: t } : ci))}
                onToggleNote={() => setExpandedNoteId(expandedNoteId === item.id ? null : item.id)}
                onChangeNote={(t) => setChecklistItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, note: t } : ci))}
              />
            ))}

            <View style={[f.addItemRow, { backgroundColor: colors.background, borderColor: colors.primary + "40" }]}>
              <Feather name="plus" size={16} color={colors.primary} />
              <TextInput
                ref={newItemRef}
                style={[f.addItemInput, { color: colors.foreground }]}
                placeholder="Add checklist item..."
                placeholderTextColor={colors.mutedForeground}
                value={newItemText}
                onChangeText={setNewItemText}
                returnKeyType="done"
                onSubmitEditing={addChecklistItem}
                blurOnSubmit={false}
              />
              {newItemText.trim().length > 0 && (
                <TouchableOpacity onPress={addChecklistItem} style={[f.addItemBtn, { backgroundColor: colors.primary }]}>
                  <Feather name="check" size={13} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

// ─── SwipeableCheckItem ───────────────────────────────────────────────────────
function SwipeableCheckItem({ item, colors, expandedNoteId, onToggle, onComplete, onDelete, onChangeText, onToggleNote, onChangeNote }: {
  item: ChecklistItem;
  colors: any;
  expandedNoteId: string | null;
  onToggle: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onChangeText: (t: string) => void;
  onToggleNote: () => void;
  onChangeNote: (t: string) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const THRESHOLD = 72;

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < 12,
    onPanResponderMove: (_, gs) => { translateX.setValue(gs.dx); },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > THRESHOLD) {
        onComplete();
      } else if (gs.dx < -THRESHOLD) {
        onDelete();
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 80 }).start();
    },
  })).current;

  const bg = translateX.interpolate({
    inputRange: [-THRESHOLD, 0, THRESHOLD],
    outputRange: ["#ef444480", "transparent", "#22c55e80"],
    extrapolate: "clamp",
  });

  const noteExpanded = expandedNoteId === item.id;

  return (
    <View style={{ marginBottom: 6, borderRadius: 10, overflow: "hidden" }}>
      <Animated.View style={[f.swipeBackground, { backgroundColor: bg }]}>
        <Feather name="trash-2" size={14} color="#ef4444" />
        <View style={{ flex: 1 }} />
        <Feather name="check" size={14} color="#22c55e" />
      </Animated.View>
      <Animated.View
        style={[f.checklistItem, { backgroundColor: colors.background, borderColor: colors.border, transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <TouchableOpacity onPress={onToggle} hitSlop={8}>
          <View style={[f.itemCheck, {
            borderColor: item.completed ? colors.primary : colors.border,
            backgroundColor: item.completed ? colors.primary : "transparent",
          }]}>
            {item.completed && <Feather name="check" size={10} color="#fff" />}
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <TextInput
            style={[f.itemTextInput, {
              color: item.completed ? colors.mutedForeground : colors.foreground,
              textDecorationLine: item.completed ? "line-through" : "none",
            }]}
            value={item.text}
            onChangeText={onChangeText}
            returnKeyType="done"
            blurOnSubmit
          />
          {noteExpanded && (
            <TextInput
              style={[f.itemNoteInput, { color: colors.mutedForeground, borderTopColor: colors.border }]}
              value={item.note ?? ""}
              onChangeText={onChangeNote}
              placeholder="Add a note for this item..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              scrollEnabled={false}
              autoFocus
            />
          )}
        </View>

        <TouchableOpacity onPress={onToggleNote} hitSlop={8} style={{ paddingHorizontal: 4 }}>
          <Feather name="file-text" size={14} color={item.note ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={10} style={{ paddingLeft: 2 }}>
          <Feather name="x" size={15} color={colors.mutedForeground} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── KanbanCard ───────────────────────────────────────────────────────────────
function KanbanCard({ task, onToggle, onEdit, onDelete }: { task: Task; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const colors = useColors();
  const pColor = PRIORITY_COLORS[task.priority];
  const checkedCount = task.checklistItems?.filter(i => i.completed).length ?? 0;
  const totalCount   = task.checklistItems?.length ?? 0;
  return (
    <TouchableOpacity style={[ts.kCard, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={onEdit} activeOpacity={0.8}>
      <View style={[ts.kPriorityBar, { backgroundColor: pColor }]} />
      <View style={ts.kBody}>
        <Text style={[ts.kTitle, { color: colors.foreground, textDecorationLine: task.isCompleted ? "line-through" : "none", opacity: task.isCompleted ? 0.5 : 1 }]} numberOfLines={2}>{task.title}</Text>
        {totalCount > 0 && (
          <View style={ts.kProgress}>
            <View style={[ts.kProgressBar, { backgroundColor: colors.border }]}>
              <View style={[ts.kProgressFill, { backgroundColor: checkedCount === totalCount ? "#22c55e" : pColor, width: `${Math.round(checkedCount / totalCount * 100)}%` as any }]} />
            </View>
            <Text style={[ts.kProgressTxt, { color: colors.mutedForeground }]}>{checkedCount}/{totalCount}</Text>
          </View>
        )}
        <View style={ts.kFooter}>
          <TouchableOpacity onPress={onToggle} hitSlop={8}>
            <View style={[ts.kCheck, { borderColor: task.isCompleted ? "#22c55e" : colors.border, backgroundColor: task.isCompleted ? "#22c55e" : "transparent" }]}>
              {task.isCompleted && <Feather name="check" size={9} color="#fff" />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8}>
            <Feather name="trash-2" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── KanbanBoard ──────────────────────────────────────────────────────────────
const COLUMN_W = Dimensions.get("window").width * 0.73;

function KanbanBoard({ tasks, onToggle, onEdit, onDelete }: { tasks: Task[]; onToggle: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (t: Task) => void }) {
  const colors = useColors();
  const todoTasks = tasks.filter(t => !t.isCompleted && !(t.checklistItems?.some(i => i.completed)));
  const inProgressTasks = tasks.filter(t => !t.isCompleted && t.checklistItems?.some(i => i.completed) && !t.checklistItems?.every(i => i.completed));
  const doneTasks = tasks.filter(t => t.isCompleted);

  const columns: { label: string; color: string; icon: string; tasks: Task[] }[] = [
    { label: "To Do",       color: "#6366f1", icon: "circle",       tasks: todoTasks },
    { label: "In Progress", color: "#f59e0b", icon: "clock",        tasks: inProgressTasks },
    { label: "Done",        color: "#22c55e", icon: "check-circle", tasks: doneTasks },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ts.boardScroll}>
      {columns.map((col) => (
        <View key={col.label} style={[ts.boardCol, { width: COLUMN_W, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[ts.boardColHeader, { borderBottomColor: colors.border }]}>
            <View style={[ts.boardColDot, { backgroundColor: col.color }]} />
            <Text style={[ts.boardColTitle, { color: colors.foreground }]}>{col.label}</Text>
            <View style={[ts.boardColBadge, { backgroundColor: col.color + "22" }]}>
              <Text style={[ts.boardColBadgeTxt, { color: col.color }]}>{col.tasks.length}</Text>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 10 }}>
            {col.tasks.map((t) => (
              <KanbanCard key={t.id} task={t} onToggle={() => onToggle(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
            ))}
            {col.tasks.length === 0 && (
              <View style={ts.boardEmpty}>
                <Feather name={col.icon as any} size={22} color={col.color + "60"} />
                <Text style={[ts.boardEmptyTxt, { color: colors.mutedForeground }]}>No tasks here</Text>
              </View>
            )}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
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

        {/* Checklist progress */}
        {task.checklistItems && task.checklistItems.length > 0 && (
          <View style={ts.checklistWrap}>
            <View style={ts.checklistMeta}>
              <Feather name="list" size={11} color={colors.mutedForeground} />
              <Text style={[ts.checklistTxt, { color: colors.mutedForeground }]}>
                {task.checklistItems.filter(i => i.completed).length}/{task.checklistItems.length} done
              </Text>
            </View>
            <View style={[ts.cardProgressBar, { backgroundColor: colors.border }]}>
              <View style={[ts.cardProgressFill, {
                backgroundColor: task.checklistItems.every(i => i.completed) ? "#22c55e" : colors.primary,
                width: `${Math.round((task.checklistItems.filter(i => i.completed).length / task.checklistItems.length) * 100)}%` as any,
              }]} />
            </View>
          </View>
        )}

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

  const [filter,    setFilter]    = useState<"all" | "pending" | "completed">("all");
  const [viewMode,  setViewMode]  = useState<"list" | "board">("list");
  const [showForm,  setShowForm]  = useState(false);
  const [editTask,  setEditTask]  = useState<Task | null>(null);

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            style={[ts.viewToggle, { backgroundColor: viewMode === "board" ? colors.primary + "18" : colors.card, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setViewMode(v => v === "list" ? "board" : "list"); }}
          >
            <Feather name={viewMode === "list" ? "columns" : "list"} size={16} color={viewMode === "board" ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={[ts.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
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

      {/* Content — List or Board */}
      {viewMode === "board" ? (
        <KanbanBoard
          tasks={sortedTasks}
          onToggle={handleToggle}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ) : (
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
      )}

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
  textArea:    { paddingTop: 12, paddingBottom: 12 },
  checklistHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 8 },
  checklistCount:  { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressBarWrap: { height: 4, borderRadius: 2, marginBottom: 10, overflow: "hidden" },
  progressBarFill: { height: 4, borderRadius: 2 },
  checklistItem:   { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  itemCheck:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  itemTextInput:   { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  addItemRow:      { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", paddingHorizontal: 12, paddingVertical: 12, marginBottom: 4 },
  addItemInput:    { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
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
  dropdown:        { flexDirection: "row", alignItems: "center", gap: 10, height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14 },
  dropdownTxt:     { fontSize: 15, fontFamily: "Inter_400Regular" },
  dropdownList:    { borderRadius: 12, borderWidth: 1, overflow: "hidden", marginTop: 4 },
  dropdownItem:    { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  dropdownItemIcon:{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dropdownItemTxt: { flex: 1, fontSize: 14 },
  devBadge:        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  devBadgeTxt:     { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  devBanner:       { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  devBannerTxt:    { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  addItemBtn:      { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  swipeBackground: { ...StyleSheet.absoluteFillObject, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 10 },
  itemNoteInput:   { fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: 6, paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
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
  checklistWrap:     { gap: 5 },
  checklistMeta:     { flexDirection: "row", alignItems: "center", gap: 4 },
  checklistTxt:      { fontSize: 11, fontFamily: "Inter_500Medium" },
  cardProgressBar:   { height: 3, borderRadius: 2, overflow: "hidden" },
  cardProgressFill:  { height: 3, borderRadius: 2 },
  viewToggle: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  remBadge:   { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
  remTxt:     { fontSize: 11, fontFamily: "Inter_500Medium" },
  kCard:        { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 0 },
  kPriorityBar: { width: 3 },
  kBody:        { flex: 1, padding: 10, gap: 6 },
  kTitle:       { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  kProgress:    { gap: 4 },
  kProgressBar: { height: 3, borderRadius: 2, overflow: "hidden" },
  kProgressFill:{ height: 3, borderRadius: 2 },
  kProgressTxt: { fontSize: 10, fontFamily: "Inter_400Regular" },
  kFooter:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  kCheck:       { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  boardScroll:  { paddingHorizontal: 12, paddingVertical: 12, gap: 10, flexDirection: "row", alignItems: "flex-start" },
  boardCol:     { borderRadius: 16, borderWidth: 1, overflow: "hidden", flexShrink: 0, maxHeight: "90%" },
  boardColHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  boardColDot:  { width: 10, height: 10, borderRadius: 5 },
  boardColTitle:{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  boardColBadge:{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  boardColBadgeTxt: { fontSize: 11, fontFamily: "Inter_700Bold" },
  boardEmpty:   { alignItems: "center", gap: 8, paddingVertical: 28 },
  boardEmptyTxt:{ fontSize: 12, fontFamily: "Inter_400Regular" },

  empty:      { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub:   { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn:   { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  emptyBtnTxt:{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
