import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
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

import { Bill, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate, toLocalYMD } from "@/hooks/useLocalDate";
import CategoryPickerModal from "@/components/CategoryPickerModal";

// ─── Constants ────────────────────────────────────────────────────────────────
const REPEAT_OPTIONS = ["Never", "Daily", "Weekly", "Every 2 Weeks", "Monthly", "Every 3 Months", "Every 6 Months", "Yearly"];
const REMIND_OPTIONS = ["1 day before", "2 days before", "3 days before", "5 days before", "1 week before", "2 weeks before"];
const FREQ_MAP: Record<string, Bill["frequency"]> = {
  Daily:            "daily",
  Weekly:           "weekly",
  "Every 2 Weeks":  "biweekly",
  Monthly:          "monthly",
  "Every 3 Months": "quarterly",
  "Every 6 Months": "semiannual",
  Yearly:           "yearly",
};

function freqToRepeat(freq?: string, isRecurring?: boolean): string {
  if (!isRecurring) return "Never";
  switch (freq) {
    case "daily":      return "Daily";
    case "weekly":     return "Weekly";
    case "biweekly":   return "Every 2 Weeks";
    case "monthly":    return "Monthly";
    case "quarterly":  return "Every 3 Months";
    case "semiannual": return "Every 6 Months";
    case "yearly":     return "Yearly";
    default:           return "Monthly";
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

// ─── Shared picker (bottom sheet) ────────────────────────────────────────────
function PickerSheet({
  visible, title, options, selected, onSelect, onClose,
}: {
  visible: boolean; title: string; options: string[];
  selected?: string; onSelect: (v: string) => void; onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
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

// ─── Date picker modal ────────────────────────────────────────────────────────
function DatePickerModal({
  visible, title, date, onChange, onClose,
}: {
  visible: boolean; title: string; date: Date;
  onChange: (d: Date) => void; onClose: () => void;
}) {
  const colors = useColors();
  if (Platform.OS === "android") {
    if (!visible) return null;
    return (
      <DateTimePicker value={date} mode="date" display="default"
        onChange={(_, d) => { onClose(); if (d) onChange(d); }} />
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.dateSheetWrap}>
        <View style={[styles.dateSheetCard, { backgroundColor: colors.card }]}>
          <View style={[styles.dateSheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.dateSheetHeader}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={[styles.donePill, { backgroundColor: colors.primary }]}>
              <Text style={styles.donePillText}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker value={date} mode="date" display="inline"
            onChange={(_, d) => { if (d) onChange(d); }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── Account picker ───────────────────────────────────────────────────────────
function AccountPickerModal({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean; selected?: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Account</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Feather name="x" size={20} color={colors.foreground} /></TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {accounts.map((a) => (
            <TouchableOpacity key={a.id} style={[styles.pickerRow, { borderBottomColor: colors.border }]}
              onPress={() => { onSelect(a.id); onClose(); }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View style={[styles.accDot, { backgroundColor: a.color }]} />
                <View>
                  <Text style={[styles.pickerOption, { color: selected === a.id ? colors.primary : colors.foreground }]}>{a.name}</Text>
                  <Text style={[styles.pickerSub, { color: colors.mutedForeground }]}>{a.type} · ${a.balance.toFixed(2)}</Text>
                </View>
              </View>
              {selected === a.id && <Feather name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
          {accounts.length === 0 && <Text style={[styles.emptyPicker, { color: colors.mutedForeground }]}>No accounts yet</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Image attachments ────────────────────────────────────────────────────────
function ImageAttachmentsRow({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const colors = useColors();
  const pick = () => {
    Alert.alert("Attach Image", undefined, [
      { text: "Take Photo", onPress: async () => {
          const p = await ImagePicker.requestCameraPermissionsAsync();
          if (p.status !== "granted") { Alert.alert("Permission Required", "Camera access is needed."); return; }
          const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: true, aspect: [4, 3] });
          if (!r.canceled) onChange([...images, ...r.assets.map((a) => a.uri)]);
        }},
      { text: "Photo Library", onPress: async () => {
          const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (p.status !== "granted") { Alert.alert("Permission Required", "Photo library access is needed."); return; }
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.7 });
          if (!r.canceled) onChange([...images, ...r.assets.map((a) => a.uri)]);
        }},
      { text: "Cancel", style: "cancel" },
    ]);
  };
  if (images.length === 0) {
    return (
      <TouchableOpacity style={[styles.addImagesRow, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={pick}>
        <Feather name="camera" size={20} color={colors.mutedForeground} />
        <Text style={[styles.addImagesText, { color: colors.mutedForeground }]}>Add Images / Receipts</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.attachmentsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentsScroll}>
        {images.map((uri, i) => (
          <View key={i} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => onChange(images.filter((_, j) => j !== i))} hitSlop={6}>
              <Feather name="x" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={[styles.thumbAdd, { borderColor: colors.border }]} onPress={pick}>
          <Feather name="plus" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Row helpers ──────────────────────────────────────────────────────────────
function RowItem({
  icon, label, value, placeholder, onPress, borderBottom = true,
}: {
  icon: string; label?: string; value?: string; placeholder?: string;
  onPress?: () => void; borderBottom?: boolean;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.65 : 1}
      style={[styles.row, borderBottom && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
        <Feather name={icon as any} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowContent}>
        {label ? <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text> : null}
        {value
          ? <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>{value}</Text>
          : placeholder
          ? <Text style={[styles.rowPlaceholder, { color: colors.mutedForeground }]}>{placeholder}</Text>
          : null}
      </View>
      {onPress && <Feather name="chevron-right" size={18} color={colors.mutedForeground} />}
    </TouchableOpacity>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  bill: Bill | null;
  visible: boolean;
  onClose: () => void;
  onCreateBill?: (data: Omit<Bill, "id">) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EditBillSheet({ bill, visible, onClose, onCreateBill }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, updateBill } = useApp();

  const [amount,          setAmount]          = useState("");
  const [category,        setCategory]        = useState("");
  const [title,           setTitle]           = useState("");
  const [dueDate,         setDueDate]         = useState(new Date());
  const [repeat,          setRepeat]          = useState("Monthly");
  const [remindDays,      setRemindDays]      = useState("5 days before");
  const [autoPaid,        setAutoPaid]        = useState(false);
  const [accountId,       setAccountId]       = useState("");
  const [addExpenseEntry, setAddExpenseEntry] = useState(true);
  const [notes,           setNotes]           = useState("");
  const [billNumber,      setBillNumber]      = useState("");
  const [receipts,        setReceipts]        = useState<string[]>([]);

  const [showCatPicker,    setShowCatPicker]    = useState(false);
  const [showAccPicker,    setShowAccPicker]    = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showRemindPicker, setShowRemindPicker] = useState(false);
  const [showDatePicker,   setShowDatePicker]   = useState(false);

  useEffect(() => {
    if (bill && visible) {
      setAmount(String(bill.amount));
      setCategory(bill.category);
      setTitle(bill.title);
      setDueDate(parseLocalDate(bill.dueDate));
      setRepeat(freqToRepeat(bill.frequency, bill.isRecurring));
      setRemindDays(bill.remindDays ?? "5 days before");
      setAutoPaid(bill.autoPaid ?? false);
      setAccountId(bill.accountId ?? "");
      setAddExpenseEntry(bill.addExpenseEntry ?? true);
      setNotes(bill.notes ?? "");
      setBillNumber(bill.billNumber ?? "");
      setReceipts(bill.receipts ?? []);
    }
  }, [bill?.id, visible]);

  const selectedAcc = accounts.find((a) => a.id === accountId);

  const save = () => {
    if (!bill) return;
    if (!title.trim()) { Alert.alert("Missing Title", "Please enter a bill title."); return; }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert("Invalid Amount", "Please enter a valid amount greater than 0."); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const isRecurring = repeat !== "Never";
    const data: Omit<Bill, "id"> = {
      title:            title.trim(),
      amount:           parsed,
      dueDate:          toLocalYMD(dueDate),
      category:         category || "Other",
      isPaid:           bill.isPaid,
      isRecurring,
      frequency:        isRecurring ? (FREQ_MAP[repeat] ?? "monthly") : undefined,
      accountId:        accountId || undefined,
      notes:            notes || undefined,
      remindDays,
      autoPaid,
      billNumber:       billNumber || undefined,
      addExpenseEntry,
      receipts:         receipts.length > 0 ? receipts : undefined,
    };
    if (onCreateBill) { onCreateBill(data); } else { updateBill(bill.id, data); }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>

        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Edit Bill</Text>
          <TouchableOpacity onPress={save} hitSlop={12}>
            <Feather name="check" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Card 1: Amount / Category / Title ── */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="dollar-sign" size={18} color={colors.primary} />
              </View>
              <TextInput
                style={[styles.amountInput, { color: amount ? colors.foreground : colors.mutedForeground }]}
                placeholder="Amount due" placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad" value={amount} onChangeText={setAmount}
              />
            </View>

            <RowItem icon="grid" placeholder="Select category" value={category || undefined}
              onPress={() => setShowCatPicker(true)} />

            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              <TextInput style={[styles.textInput, { color: colors.foreground, flex: 1 }]}
                placeholder="Bill name (required)" placeholderTextColor={colors.mutedForeground}
                value={title} onChangeText={setTitle} />
            </View>
          </View>

          {/* ── Card 2: Due Date / Repeat / Remind ── */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <TouchableOpacity style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              onPress={() => setShowDatePicker(true)}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="calendar" size={18} color={colors.primary} />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{fmtDate(dueDate)}</Text>
                <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Due Date</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            <RowItem icon="repeat" placeholder="Select repeat option"
              value={repeat !== "Never" ? repeat : undefined}
              onPress={() => setShowRepeatPicker(true)} />

            <RowItem icon="bell" label={`Remind ${remindDays}`}
              onPress={() => setShowRemindPicker(true)} borderBottom={false} />
          </View>

          {/* ── Card 3: Auto Paid / Account / Add Expense Entry ── */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="check-square" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowLabel, { flex: 1, color: colors.foreground }]}>Auto Paid</Text>
              <Switch value={autoPaid} onValueChange={setAutoPaid}
                trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
            </View>
            {autoPaid && (
              <View style={[styles.autoPaidNote, { backgroundColor: "#fef3c7" }]}>
                <Text style={styles.autoPaidNoteText}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>Note: </Text>
                  Auto-paid bills are marked as paid on the due date in the app.
                </Text>
              </View>
            )}

            <RowItem icon="home" placeholder="From account" value={selectedAcc?.name}
              onPress={() => setShowAccPicker(true)} />

            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="plus-circle" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowLabel, { flex: 1, color: colors.foreground }]}>Add expense entry for this payment.</Text>
              <Switch value={addExpenseEntry} onValueChange={setAddExpenseEntry}
                trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
            </View>
          </View>

          {/* ── Card 4: Notes / Bill Number ── */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              <TextInput style={[styles.notesInput, { color: colors.foreground }]}
                placeholder="Notes..." placeholderTextColor={colors.mutedForeground}
                value={notes} onChangeText={setNotes} multiline returnKeyType="done" />
            </View>
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="hash" size={18} color={colors.primary} />
              </View>
              <TextInput style={[styles.textInput, { color: colors.foreground, flex: 1 }]}
                placeholder="Bill Number" placeholderTextColor={colors.mutedForeground}
                value={billNumber} onChangeText={setBillNumber} />
            </View>
          </View>

          {/* ── Image Attachments ── */}
          <ImageAttachmentsRow images={receipts} onChange={setReceipts} />

          {/* ── Save Button ── */}
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.warning ?? colors.primary }]} onPress={save}>
            <Text style={styles.saveBtnText}>Save Changes</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Pickers ── */}
        <CategoryPickerModal visible={showCatPicker} onClose={() => setShowCatPicker(false)}
          onSelect={(cat, sub) => setCategory(sub ? `${cat} - ${sub}` : cat)} type="expense" />

        <AccountPickerModal visible={showAccPicker} onClose={() => setShowAccPicker(false)}
          onSelect={(id) => setAccountId(id)} selected={accountId} />

        <PickerSheet visible={showRepeatPicker} title="Repeat" options={REPEAT_OPTIONS}
          selected={repeat} onSelect={setRepeat} onClose={() => setShowRepeatPicker(false)} />

        <PickerSheet visible={showRemindPicker} title="Remind Me" options={REMIND_OPTIONS}
          selected={remindDays} onSelect={setRemindDays} onClose={() => setShowRemindPicker(false)} />

        <DatePickerModal visible={showDatePicker} title="Select Due Date" date={dueDate}
          onChange={setDueDate} onClose={() => setShowDatePicker(false)} />
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1 },
  overlay:     { flex: 1 },

  header:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_600SemiBold" },

  body:        { paddingHorizontal: 16, paddingTop: 20, gap: 14 },
  card:        { borderRadius: 16, overflow: "hidden" },

  row:         { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon:     { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowContent:  { flex: 1 },
  rowLabel:    { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowValue:    { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowPlaceholder: { fontSize: 15, fontFamily: "Inter_400Regular" },

  amountInput: { flex: 1, fontSize: 22, fontFamily: "Inter_700Bold" },
  textInput:   { fontSize: 15, fontFamily: "Inter_400Regular" },
  notesInput:  { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 56, textAlignVertical: "top" },

  autoPaidNote:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginHorizontal: 10, marginBottom: 4 },
  autoPaidNoteText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#92400e" },

  saveBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Picker bottom sheet
  pickerSheet:  { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerTitle:  { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerOption: { fontSize: 15, fontFamily: "Inter_500Medium" },
  pickerSub:    { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyPicker:  { textAlign: "center", padding: 24, fontFamily: "Inter_400Regular" },
  accDot:       { width: 10, height: 10, borderRadius: 5 },

  // Date picker sheet (iOS)
  dateSheetWrap:   { position: "absolute", bottom: 0, left: 0, right: 0 },
  dateSheetCard:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 16 },
  dateSheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 8, marginBottom: 4 },
  dateSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  donePill:        { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  donePillText:    { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Image attachments
  addImagesRow:       { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, padding: 16 },
  addImagesText:      { fontSize: 14, fontFamily: "Inter_500Medium" },
  attachmentsContainer: { borderRadius: 16, borderWidth: 1, padding: 12 },
  attachmentsScroll:  { gap: 8 },
  thumbWrap:          { position: "relative" },
  thumb:              { width: 80, height: 80, borderRadius: 10 },
  thumbRemove:        { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  thumbAdd:           { width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
});
