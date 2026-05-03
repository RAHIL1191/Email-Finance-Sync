import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  { label: "Food & Dining", icon: "coffee" },
  { label: "Groceries", icon: "shopping-bag" },
  { label: "Shopping", icon: "tag" },
  { label: "Transport", icon: "navigation" },
  { label: "Entertainment", icon: "film" },
  { label: "Housing", icon: "home" },
  { label: "Utilities", icon: "zap" },
  { label: "Health", icon: "heart" },
  { label: "Insurance", icon: "shield" },
  { label: "Subscriptions", icon: "refresh-cw" },
  { label: "Other", icon: "more-horizontal" },
];

const INCOME_CATEGORIES = [
  { label: "Salary", icon: "briefcase" },
  { label: "Freelance", icon: "cpu" },
  { label: "Investment", icon: "trending-up" },
  { label: "Gift", icon: "gift" },
  { label: "Other", icon: "more-horizontal" },
];

const BILL_CATEGORIES = [
  { label: "Housing", icon: "home" },
  { label: "Utilities", icon: "zap" },
  { label: "Insurance", icon: "shield" },
  { label: "Subscriptions", icon: "refresh-cw" },
  { label: "Health", icon: "heart" },
  { label: "Transport", icon: "navigation" },
  { label: "Food", icon: "coffee" },
  { label: "Entertainment", icon: "film" },
  { label: "Other", icon: "file-text" },
];

const REPEAT_OPTIONS = [
  "Never",
  "Daily",
  "Weekly",
  "Every 2 Weeks",
  "Monthly",
  "Every 3 Months",
  "Every 6 Months",
  "Yearly",
] as const;

const REMIND_OPTIONS = [
  "1 day before",
  "2 days before",
  "3 days before",
  "5 days before",
  "1 week before",
  "2 weeks before",
] as const;

const TABS = ["EXPENSE", "INCOME", "TRANSFER", "BILLS"] as const;
type TabType = (typeof TABS)[number];

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  initialTab?: TabType;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function AmountCalcButton({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.calcButton, { borderColor: colors.border, backgroundColor: colors.card }]}
      activeOpacity={0.75}
    >
      <Feather name="menu" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Reusable row components ──────────────────────────────────────────────────

function RowItem({
  icon,
  label,
  value,
  placeholder,
  onPress,
  onClear,
  valueColor,
  borderBottom = true,
}: {
  icon: string;
  label?: string;
  value?: string;
  placeholder?: string;
  onPress?: () => void;
  onClear?: () => void;
  valueColor?: string;
  borderBottom?: boolean;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.65 : 1}
      style={[styles.row, borderBottom && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
        <Feather name={icon as any} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowContent}>
        {label ? <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text> : null}
        {value ? (
          <Text style={[styles.rowValue, { color: valueColor ?? colors.mutedForeground }]} numberOfLines={1}>
            {value}
          </Text>
        ) : placeholder ? (
          <Text style={[styles.rowPlaceholder, { color: colors.mutedForeground }]}>{placeholder}</Text>
        ) : null}
      </View>
      {onClear ? (
        <TouchableOpacity onPress={onClear} hitSlop={10}>
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : onPress ? (
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      ) : null}
    </TouchableOpacity>
  );
}

function DateTimeRow({
  date,
  onDateChange,
  onTimeChange,
  label,
  borderBottom,
  onOpenDate,
  onOpenTime,
}: {
  date: Date;
  onDateChange: (d: Date) => void;
  onTimeChange: (d: Date) => void;
  label?: string;
  borderBottom?: boolean;
  onOpenDate?: () => void;
  onOpenTime?: () => void;
}) {
  const colors = useColors();

  return (
    <View style={[styles.row, borderBottom !== false && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
        <Feather name="calendar" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        {label ? <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text> : null}
        <View style={styles.dateTimeInner}>
          <TouchableOpacity onPress={onOpenDate}>
            <Text style={[styles.dateText, { color: colors.foreground }]}>{formatDate(date)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenTime}>
            <Text style={[styles.timeText, { color: colors.primary }]}>{formatTime(date)}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </View>
  );
}

function DatePickerModal({
  visible,
  title,
  date,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  date: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const mode: "date" | "time" = title.toLowerCase().includes("time") ? "time" : "date";

  if (Platform.OS === "android") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={date}
        mode={mode}
        display="default"
        onChange={(_, d) => {
          onClose();
          if (d) onChange(d);
        }}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.bottomSheetWrap}>
        <View style={[styles.bottomSheetCard, { backgroundColor: colors.card }]}>
          <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
          <View style={styles.bottomSheetHeader}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={[styles.donePill, { backgroundColor: colors.primary }]}>
              <Text style={styles.donePillText}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inlinePickerWrap}>
            <DateTimePicker
              value={date}
              mode={mode}
              display="inline"
              onChange={(_, d) => {
                if (d) onChange(d);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NotesRow({ value, onChange, borderBottom }: { value: string; onChange: (v: string) => void; borderBottom?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.row, borderBottom !== false && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
        <Feather name="file-text" size={18} color={colors.primary} />
      </View>
      <TextInput
        style={[styles.notesInput, { color: colors.foreground }]}
        placeholder="Notes..."
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChange}
        multiline
        returnKeyType="done"
      />
      <View style={[styles.abcBadge, { borderColor: colors.border }]}>
        <Text style={[styles.abcText, { color: colors.mutedForeground }]}>ABC</Text>
      </View>
    </View>
  );
}

// ─── Picker modal ─────────────────────────────────────────────────────────────

function PickerModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected?: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.pickerRow, { borderBottomColor: colors.border }]}
              onPress={() => { onSelect(opt); onClose(); }}
            >
              <Text style={[styles.pickerOption, { color: selected === opt ? colors.primary : colors.foreground }]}>{opt}</Text>
              {selected === opt && <Feather name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Category Picker modal ────────────────────────────────────────────────────

function CategoryPickerModal({
  visible,
  categories,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  categories: { label: string; icon: string }[];
  selected?: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Category</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[styles.catPickerRow, { borderBottomColor: colors.border }]}
              onPress={() => { onSelect(cat.label); onClose(); }}
            >
              <View style={[styles.catPickerIcon, { backgroundColor: selected === cat.label ? colors.primary : colors.accent }]}>
                <Feather name={cat.icon as any} size={16} color={selected === cat.label ? "#fff" : colors.primary} />
              </View>
              <Text style={[styles.catPickerLabel, { color: selected === cat.label ? colors.primary : colors.foreground }]}>
                {cat.label}
              </Text>
              {selected === cat.label && <Feather name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Account Picker modal ─────────────────────────────────────────────────────

function AccountPickerModal({
  visible,
  excludeId,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  excludeId?: string;
  selected?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts } = useApp();
  const list = accounts.filter((a) => a.id !== excludeId);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Account</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {list.map((a) => {
            const isSelected = selected === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.accPickerRow, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(a.id); onClose(); }}
              >
                <View style={[styles.accDot, { backgroundColor: a.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accPickerName, { color: isSelected ? colors.primary : colors.foreground }]}>{a.name}</Text>
                  <Text style={[styles.accPickerSub, { color: colors.mutedForeground }]}>
                    {a.type.charAt(0).toUpperCase() + a.type.slice(1)}{a.bank ? ` · ${a.bank}` : ""}
                    {" · "}Balance: ${a.balance.toFixed(2)}
                  </Text>
                </View>
                {isSelected && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
          {list.length === 0 && (
            <Text style={[styles.emptyPicker, { color: colors.mutedForeground }]}>No accounts yet</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Project Picker modal ─────────────────────────────────────────────────────

export const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];

function ProjectPickerModal({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected?: string;
  onSelect: (id: string | undefined, name: string | undefined) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projects, addProject } = useApp();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [newDesc, setNewDesc] = useState("");

  const resetCreate = () => { setCreating(false); setNewName(""); setNewDesc(""); setNewColor(PROJECT_COLORS[0]); };

  const handleCreate = () => {
    if (!newName.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = addProject({ name: newName.trim(), color: newColor, description: newDesc.trim() || undefined });
    onSelect(id, newName.trim());
    resetCreate();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { resetCreate(); onClose(); }}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { resetCreate(); onClose(); }} />
      <View style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>
            {creating ? "New Project" : "Tag Project"}
          </Text>
          <TouchableOpacity onPress={creating ? resetCreate : () => { resetCreate(); onClose(); }}>
            <Feather name={creating ? "arrow-left" : "x"} size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        {creating ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
            <TextInput
              style={[styles.projectInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]}
              placeholder="Project name (e.g. Europe Trip, Birthday Party)"
              placeholderTextColor={colors.mutedForeground}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={[styles.projectInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={newDesc}
              onChangeText={setNewDesc}
              returnKeyType="done"
            />
            <Text style={[styles.colorLabel, { color: colors.mutedForeground }]}>Color</Text>
            <View style={styles.colorRow}>
              {PROJECT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorSwatch, { backgroundColor: c, borderWidth: newColor === c ? 3 : 0, borderColor: "#fff" }]}
                  onPress={() => setNewColor(c)}
                />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: newName.trim() ? colors.primary : colors.border, marginTop: 8 }]}
              onPress={handleCreate}
              activeOpacity={newName.trim() ? 0.8 : 1}
            >
              <Text style={styles.saveBtnText}>Create Project</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.pickerRow, { borderBottomColor: colors.border }]}
              onPress={() => { onSelect(undefined, undefined); onClose(); }}
            >
              <View style={[styles.projectDot, { backgroundColor: colors.border }]} />
              <Text style={[styles.pickerOption, { color: !selected ? colors.primary : colors.foreground, flex: 1 }]}>No Project</Text>
              {!selected && <Feather name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
            {projects.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(p.id, p.name); onClose(); }}
              >
                <View style={[styles.projectDot, { backgroundColor: p.color }]} />
                <Text style={[styles.pickerOption, { color: selected === p.id ? colors.primary : colors.foreground, flex: 1 }]}>{p.name}</Text>
                {selected === p.id && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.pickerRow, { borderBottomColor: "transparent" }]}
              onPress={() => setCreating(true)}
            >
              <View style={[styles.projectDot, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
                <Feather name="plus" size={8} color="#fff" />
              </View>
              <Text style={[styles.pickerOption, { color: colors.primary, flex: 1 }]}>New Project…</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Amount header ─────────────────────────────────────────────────────────────

function AmountHeader({ value, onChange, color }: { value: string; onChange: (v: string) => void; color?: string }) {
  const colors = useColors();
  const ref = useRef<TextInput>(null);
  return (
    <View style={styles.amountSection}>
      <Feather name="dollar-sign" size={28} color={color ?? colors.mutedForeground} style={{ marginTop: 4 }} />
      <TextInput
        ref={ref}
        style={[styles.amountInput, { color: value ? colors.foreground : colors.mutedForeground }]}
        placeholder="Amount"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChange}
        returnKeyType="done"
      />
      <AmountCalcButton onPress={() => ref.current?.focus()} />
    </View>
  );
}

// ─── EXPENSE tab ──────────────────────────────────────────────────────────────

function ExpenseTab({ onSave }: { onSave: () => void }) {
  const colors = useColors();
  const { accounts, addTransaction } = useApp();

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [merchant, setMerchant] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showAccPicker, setShowAccPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const selectedAcc = accounts.find((a) => a.id === accountId);

  const save = () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || !accountId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTransaction({
      title: merchant || category || "Expense",
      merchant: merchant || undefined,
      amount: parsed,
      type: "expense",
      category: category || "Other",
      accountId,
      date: date.toISOString(),
      note: notes || undefined,
      projectId: projectId || undefined,
      projectName: projectName || undefined,
      source: "manual",
    });
    onSave();
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AmountHeader value={amount} onChange={setAmount} color={colors.expense} />

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem
          icon="grid"
          label={category || undefined}
          placeholder={category ? undefined : "Select category"}
          onPress={() => setShowCatPicker(true)}
        />
        <RowItem
          icon="shopping-bag"
          placeholder="Select Merchant"
          value={merchant || undefined}
          onPress={() => {}}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {selectedAcc ? (
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={[styles.rowIcon, { backgroundColor: selectedAcc.color + "22" }]}>
              <Feather name="home" size={18} color={selectedAcc.color} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{selectedAcc.name}</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                {selectedAcc.type.charAt(0).toUpperCase() + selectedAcc.type.slice(1)} · {selectedAcc.bank}
                {"\n"}Balance: ${selectedAcc.balance.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setAccountId("")} hitSlop={10}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <RowItem icon="home" placeholder="Select Account" onPress={() => setShowAccPicker(true)} borderBottom={false} />
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <DateTimeRow
          date={date}
          onDateChange={(d) => setDate((prev) => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; })}
          onTimeChange={(d) => setDate((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; })}
          onOpenDate={() => setShowDatePicker(true)}
          onOpenTime={() => setShowTimePicker(true)}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <NotesRow value={notes} onChange={setNotes} borderBottom={false} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem
          icon="folder"
          label={projectName}
          placeholder="Tag a Project (optional)"
          onPress={() => setShowProjectPicker(true)}
          onClear={projectId ? () => { setProjectId(undefined); setProjectName(undefined); } : undefined}
          borderBottom={false}
        />
      </View>

      <TouchableOpacity style={[styles.addImagesRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="camera" size={20} color={colors.mutedForeground} />
        <Text style={[styles.addImagesText, { color: colors.mutedForeground }]}>Add Receipts</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save}>
        <Text style={styles.saveBtnText}>Save Expense</Text>
      </TouchableOpacity>

      <CategoryPickerModal
        visible={showCatPicker}
        categories={EXPENSE_CATEGORIES}
        selected={category}
        onSelect={setCategory}
        onClose={() => setShowCatPicker(false)}
      />
      <AccountPickerModal
        visible={showAccPicker}
        selected={accountId}
        onSelect={setAccountId}
        onClose={() => setShowAccPicker(false)}
      />
      <ProjectPickerModal
        visible={showProjectPicker}
        selected={projectId}
        onSelect={(id, name) => { setProjectId(id); setProjectName(name); }}
        onClose={() => setShowProjectPicker(false)}
      />
      <DatePickerModal
        visible={showDatePicker}
        title="Select Date"
        date={date}
        onChange={setDate}
        onClose={() => setShowDatePicker(false)}
      />
      <DatePickerModal
        visible={showTimePicker}
        title="Select Time"
        date={date}
        onChange={setDate}
        onClose={() => setShowTimePicker(false)}
      />
    </ScrollView>
  );
}

// ─── INCOME tab ───────────────────────────────────────────────────────────────

function IncomeTab({ onSave }: { onSave: () => void }) {
  const colors = useColors();
  const { accounts, addTransaction } = useApp();

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState("Never");

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showAccPicker, setShowAccPicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);

  const save = () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || !accountId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTransaction({
      title: category || "Income",
      amount: parsed,
      type: "income",
      category: category || "Other",
      accountId,
      date: date.toISOString(),
      note: [notes, repeat !== "Never" ? `Repeats ${repeat}` : ""].filter(Boolean).join(" · ") || undefined,
      projectId: projectId || undefined,
      projectName: projectName || undefined,
      isRefund: category === "Refund" ? true : undefined,
      source: "manual",
    });
    onSave();
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AmountHeader value={amount} onChange={setAmount} color={colors.income} />

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem
          icon="grid"
          label={category || undefined}
          placeholder="Select category"
          onPress={() => setShowCatPicker(true)}
        />
        <RowItem
          icon="bar-chart-2"
          placeholder="Select Budget"
          borderBottom={false}
          onPress={() => {}}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem
          icon="home"
          placeholder="Select Account"
          value={accounts.find((a) => a.id === accountId)?.name}
          onPress={() => setShowAccPicker(true)}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <DateTimeRow
          date={date}
          onDateChange={(d) => setDate((prev) => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; })}
          onTimeChange={(d) => setDate((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; })}
          onOpenDate={() => setShowDatePicker(true)}
          onOpenTime={() => setShowTimePicker(true)}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <NotesRow value={notes} onChange={setNotes} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem
          icon="repeat"
          label={repeat !== "Never" ? repeat : undefined}
          placeholder="Select repeat option"
          value={repeat !== "Never" ? repeat : undefined}
          onPress={() => setShowRepeatPicker(true)}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem
          icon="folder"
          label={projectName}
          placeholder="Tag a Project (optional)"
          onPress={() => setShowProjectPicker(true)}
          onClear={projectId ? () => { setProjectId(undefined); setProjectName(undefined); } : undefined}
          borderBottom={false}
        />
      </View>

      <TouchableOpacity style={[styles.addImagesRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="camera" size={20} color={colors.mutedForeground} />
        <Text style={[styles.addImagesText, { color: colors.mutedForeground }]}>Add Images</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.income }]} onPress={save}>
        <Text style={styles.saveBtnText}>Save Income</Text>
      </TouchableOpacity>

      <CategoryPickerModal
        visible={showCatPicker}
        categories={INCOME_CATEGORIES}
        selected={category}
        onSelect={setCategory}
        onClose={() => setShowCatPicker(false)}
      />
      <AccountPickerModal
        visible={showAccPicker}
        selected={accountId}
        onSelect={setAccountId}
        onClose={() => setShowAccPicker(false)}
      />
      <ProjectPickerModal
        visible={showProjectPicker}
        selected={projectId}
        onSelect={(id, name) => { setProjectId(id); setProjectName(name); }}
        onClose={() => setShowProjectPicker(false)}
      />
      <PickerModal
        visible={showRepeatPicker}
        title="Repeat"
        options={REPEAT_OPTIONS as unknown as string[]}
        selected={repeat}
        onSelect={setRepeat}
        onClose={() => setShowRepeatPicker(false)}
      />
      <DatePickerModal
        visible={showDatePicker}
        title="Select Date"
        date={date}
        onChange={(d) => setDate((prev) => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; })}
        onClose={() => setShowDatePicker(false)}
      />
      <DatePickerModal
        visible={showTimePicker}
        title="Select Time"
        date={date}
        onChange={(d) => setDate((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; })}
        onClose={() => setShowTimePicker(false)}
      />
    </ScrollView>
  );
}

// ─── TRANSFER tab ─────────────────────────────────────────────────────────────

function TransferTab({ onSave }: { onSave: () => void }) {
  const colors = useColors();
  const { accounts, addTransaction } = useApp();

  const [amount, setAmount] = useState("");
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? "");
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState("Never");
  const [purpose, setPurpose] = useState("");

  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const fromAcc = accounts.find((a) => a.id === fromId);
  const toAcc = accounts.find((a) => a.id === toId);

  const save = () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || !fromId || !toId || fromId === toId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTransaction({
      title: `Transfer to ${toAcc?.name ?? "Account"}`,
      amount: parsed,
      type: "expense",
      category: "Transfer",
      accountId: fromId,
      date: date.toISOString(),
      note: [purpose, notes, repeat !== "Never" ? `Repeats ${repeat}` : ""].filter(Boolean).join(" · ") || undefined,
      source: "manual",
    });
    addTransaction({
      title: `Transfer from ${fromAcc?.name ?? "Account"}`,
      amount: parsed,
      type: "income",
      category: "Transfer",
      accountId: toId,
      date: date.toISOString(),
      note: [purpose, notes].filter(Boolean).join(" · ") || undefined,
      source: "manual",
    });
    onSave();
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={[styles.transferNote, { color: colors.mutedForeground }]}>
        The transfer is within the app only and does not connect to your bank.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="home" size={18} color={colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <TouchableOpacity onPress={() => setShowFromPicker(true)} style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: fromAcc ? colors.foreground : colors.mutedForeground }]}>
                {fromAcc ? fromAcc.name : "From account"}
              </Text>
              {fromAcc && (
                <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                  {fromAcc.type.charAt(0).toUpperCase() + fromAcc.type.slice(1)} · {fromAcc.bank}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>

        <View style={styles.amountSubRow}>
          <Text style={[styles.amountSubLabel, { color: colors.mutedForeground }]}>$</Text>
          <TextInput
            style={[styles.amountSubInput, { color: amount ? colors.foreground : colors.mutedForeground }]}
            placeholder="Amount"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        <View style={[styles.arrowDown, { borderColor: colors.border }]}>
          <Feather name="arrow-down" size={16} color={colors.mutedForeground} />
        </View>

        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="home" size={18} color={colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <TouchableOpacity onPress={() => setShowToPicker(true)} style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: toAcc ? colors.foreground : colors.mutedForeground }]}>
                {toAcc ? toAcc.name : "To account"}
              </Text>
              {toAcc && (
                <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                  {toAcc.type.charAt(0).toUpperCase() + toAcc.type.slice(1)} · {toAcc.bank}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem icon="repeat" label="Transfer" value="Select Budget" onPress={() => {}} />
        <RowItem icon="file-text" placeholder="Select Purpose" value={purpose || undefined} onPress={() => {}} borderBottom={false} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <DateTimeRow
          date={date}
          onDateChange={(d) => setDate((prev) => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; })}
          onTimeChange={(d) => setDate((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; })}
          onOpenDate={() => setShowDatePicker(true)}
          onOpenTime={() => setShowTimePicker(true)}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <RowItem
          icon="repeat"
          placeholder="Select repeat option"
          value={repeat !== "Never" ? repeat : undefined}
          onPress={() => setShowRepeatPicker(true)}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <NotesRow value={notes} onChange={setNotes} borderBottom={false} />
      </View>

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save}>
        <Text style={styles.saveBtnText}>Save Transfer</Text>
      </TouchableOpacity>

      <AccountPickerModal
        visible={showFromPicker}
        selected={fromId}
        excludeId={toId}
        onSelect={setFromId}
        onClose={() => setShowFromPicker(false)}
      />
      <AccountPickerModal
        visible={showToPicker}
        selected={toId}
        excludeId={fromId}
        onSelect={setToId}
        onClose={() => setShowToPicker(false)}
      />
      <PickerModal
        visible={showRepeatPicker}
        title="Repeat"
        options={REPEAT_OPTIONS as unknown as string[]}
        selected={repeat}
        onSelect={setRepeat}
        onClose={() => setShowRepeatPicker(false)}
      />
      <DatePickerModal
        visible={showDatePicker}
        title="Select Date"
        date={date}
        onChange={(d) => setDate((prev) => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; })}
        onClose={() => setShowDatePicker(false)}
      />
      <DatePickerModal
        visible={showTimePicker}
        title="Select Time"
        date={date}
        onChange={(d) => setDate((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; })}
        onClose={() => setShowTimePicker(false)}
      />
    </ScrollView>
  );
}

// ─── BILLS tab ────────────────────────────────────────────────────────────────

function BillsTab({ onSave }: { onSave: () => void }) {
  const colors = useColors();
  const { accounts, addBill } = useApp();

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(new Date());
  const [repeat, setRepeat] = useState("Monthly");
  const [remindDays, setRemindDays] = useState("5 days before");
  const [autoPaid, setAutoPaid] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [addExpenseEntry, setAddExpenseEntry] = useState(true);
  const [notes, setNotes] = useState("");
  const [billNumber, setBillNumber] = useState("");

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showAccPicker, setShowAccPicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showRemindPicker, setShowRemindPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const selectedAcc = accounts.find((a) => a.id === accountId);

  const save = () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || !title.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const freqMap: Record<string, "weekly" | "monthly" | "yearly"> = {
      Weekly: "weekly",
      "Every 2 Weeks": "weekly",
      Monthly: "monthly",
      "Every 3 Months": "monthly",
      Yearly: "yearly",
    };
    const isRecurring = repeat !== "Never";
    addBill({
      title: title.trim(),
      amount: parsed,
      dueDate: dueDate.toISOString(),
      category: category || "Other",
      isPaid: false,
      isRecurring,
      frequency: isRecurring ? (freqMap[repeat] ?? "monthly") : undefined,
      accountId: accountId || undefined,
    });
    onSave();
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="dollar-sign" size={18} color={colors.primary} />
          </View>
          <TextInput
            style={[styles.billAmountInput, { color: amount ? colors.foreground : colors.mutedForeground }]}
            placeholder="Amount due"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        <RowItem icon="grid" placeholder="Select category" value={category || undefined} onPress={() => setShowCatPicker(true)} />

        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="file-text" size={18} color={colors.primary} />
          </View>
          <TextInput
            style={[styles.notesInput, { color: colors.foreground, flex: 1 }]}
            placeholder="Title..."
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          onPress={() => setShowDatePicker(true)}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="calendar" size={18} color={colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>{formatDate(dueDate)}</Text>
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Due Date</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        <DatePickerModal
          visible={showDatePicker}
          title="Select Due Date"
          date={dueDate}
          onChange={(d) => setDueDate(d)}
          onClose={() => setShowDatePicker(false)}
        />

        <RowItem icon="repeat" placeholder="Select repeat option" value={repeat !== "Never" ? repeat : undefined} onPress={() => setShowRepeatPicker(true)} />

        <RowItem
          icon="bell"
          label={`Remind ${remindDays}`}
          onPress={() => setShowRemindPicker(true)}
          borderBottom={false}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="check-square" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.rowLabel, { flex: 1, color: colors.foreground }]}>Auto Paid</Text>
          <Switch
            value={autoPaid}
            onValueChange={setAutoPaid}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
        {autoPaid && (
          <View style={[styles.autoPaidNote, { backgroundColor: "#fef3c7" }]}>
            <Text style={styles.autoPaidNoteText}>
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Note: </Text>
              Auto-paid bills are marked as paid on the due date in the app.
            </Text>
          </View>
        )}

        <RowItem
          icon="home"
          placeholder="From account"
          value={selectedAcc?.name}
          onPress={() => setShowAccPicker(true)}
        />

        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="plus-circle" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.rowLabel, { flex: 1, color: colors.foreground }]}>Add expense entry for this payment.</Text>
          <Switch
            value={addExpenseEntry}
            onValueChange={setAddExpenseEntry}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <NotesRow value={notes} onChange={setNotes} />
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Feather name="hash" size={18} color={colors.primary} />
          </View>
          <TextInput
            style={[styles.notesInput, { color: colors.foreground, flex: 1 }]}
            placeholder="Bill Number"
            placeholderTextColor={colors.mutedForeground}
            value={billNumber}
            onChangeText={setBillNumber}
          />
        </View>
      </View>

      <TouchableOpacity style={[styles.addImagesRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="camera" size={20} color={colors.mutedForeground} />
        <Text style={[styles.addImagesText, { color: colors.mutedForeground }]}>Add Images</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.warning }]} onPress={save}>
        <Text style={styles.saveBtnText}>Save Bill</Text>
      </TouchableOpacity>

      <CategoryPickerModal
        visible={showCatPicker}
        categories={BILL_CATEGORIES}
        selected={category}
        onSelect={setCategory}
        onClose={() => setShowCatPicker(false)}
      />
      <AccountPickerModal
        visible={showAccPicker}
        selected={accountId}
        onSelect={setAccountId}
        onClose={() => setShowAccPicker(false)}
      />
      <PickerModal
        visible={showRepeatPicker}
        title="Repeat"
        options={REPEAT_OPTIONS as unknown as string[]}
        selected={repeat}
        onSelect={setRepeat}
        onClose={() => setShowRepeatPicker(false)}
      />
      <PickerModal
        visible={showRemindPicker}
        title="Remind Me"
        options={REMIND_OPTIONS as unknown as string[]}
        selected={remindDays}
        onSelect={setRemindDays}
        onClose={() => setShowRemindPicker(false)}
      />
    </ScrollView>
  );
}

// ─── Main Sheet ────────────────────────────────────────────────────────────────

export default function AddEntrySheet({ visible, initialTab = "EXPENSE", onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    if (visible) setActiveTab(initialTab);
  }, [visible, initialTab]);

  const tabTitle: Record<TabType, string> = {
    EXPENSE: "Add Expense",
    INCOME: "Add Income",
    TRANSFER: "Transfer",
    BILLS: "Add Bill",
  };

  const handleSave = () => {
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{tabTitle[activeTab]}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
            <Feather name="check" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={styles.tabItem}
              onPress={() => { Haptics.selectionAsync(); setActiveTab(tab); }}
            >
              <Text style={[styles.tabLabel, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
                {tab}
              </Text>
              {activeTab === tab && <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {activeTab === "EXPENSE" && <ExpenseTab onSave={handleSave} />}
        {activeTab === "INCOME" && <IncomeTab onSave={handleSave} />}
        {activeTab === "TRANSFER" && <TransferTab onSave={handleSave} />}
        {activeTab === "BILLS" && <BillsTab onSave={handleSave} />}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_600SemiBold" },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative",
  },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  tabUnderline: { position: "absolute", bottom: 0, left: 8, right: 8, height: 2, borderRadius: 1 },

  tabContent: { padding: 16, gap: 12, paddingBottom: 40 },

  card: { borderRadius: 14, overflow: "hidden" },

  amountSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 6,
  },
  amountInput: {
    fontSize: 36,
    fontFamily: "Inter_300Light",
    flex: 1,
    minHeight: 44,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 56,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowPlaceholder: { fontSize: 15, fontFamily: "Inter_400Regular" },

  dateTimeInner: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  dateText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  timeText: { fontSize: 15, fontFamily: "Inter_500Medium" },

  notesInput: { fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 24, textAlignVertical: "top" },
  abcBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  abcText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  addImagesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addImagesText: { fontSize: 15, fontFamily: "Inter_400Regular" },

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },

  transferNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  amountSubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f4",
  },
  amountSubLabel: { fontSize: 18, fontFamily: "Inter_300Light" },
  amountSubInput: { fontSize: 18, fontFamily: "Inter_300Light", flex: 1 },
  arrowDown: {
    alignSelf: "center",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },

  billAmountInput: { fontSize: 22, fontFamily: "Inter_300Light", flex: 1 },

  autoPaidNote: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
  },
  autoPaidNoteText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#92400e", lineHeight: 18 },

  // Picker modal
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "65%",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  calcButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
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
  donePillText: { fontFamily: "Inter_600SemiBold", color: "#fff" },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerOption: { fontSize: 15, fontFamily: "Inter_400Regular" },

  catPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catPickerIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  catPickerLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },

  accPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accDot: { width: 12, height: 12, borderRadius: 6 },
  accPickerName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  accPickerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyPicker: { textAlign: "center", padding: 24, fontFamily: "Inter_400Regular" },

  projectInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  colorLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  projectDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
});
