import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
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

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function BillDatePickerModal({
  visible,
  date,
  onChange,
  onClose,
  colors,
}: {
  visible: boolean;
  date: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
  colors: any;
}) {
  if (Platform.OS === "android") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={date}
        mode="date"
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
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Due Date</Text>
            <TouchableOpacity onPress={onClose} style={[styles.donePill, { backgroundColor: colors.primary }]}>
              <Text style={styles.donePillText}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inlinePickerWrap}>
            <DateTimePicker
              value={date}
              mode="date"
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

const CATEGORIES = [
  "Housing",
  "Utilities",
  "Insurance",
  "Subscriptions",
  "Health",
  "Transport",
  "Food",
  "Entertainment",
  "Other",
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AddBillModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addBill, accounts } = useApp();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(true);
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">(
    "monthly"
  );

  const handleSave = () => {
    if (!title.trim() || !amount) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addBill({
      title: title.trim(),
      amount: parsed,
      dueDate: dueDate.toISOString(),
      category,
      isPaid: false,
      isRecurring,
      frequency: isRecurring ? frequency : undefined,
    });
    setTitle("");
    setAmount("");
    setCategory("Other");
    setDueDate(new Date());
    onClose();
  };

  const dueDateStr = dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 16, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Add Bill
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={[styles.saveBtn, { color: colors.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Bill Name
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border },
              ]}
              placeholder="e.g. Rent, Netflix"
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Amount
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border },
              ]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Due Date
            </Text>
            <TouchableOpacity
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
              ]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 15 }}>
                {dueDateStr}
              </Text>
              <Feather name="calendar" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            <BillDatePickerModal
              visible={showDatePicker}
              date={dueDate}
              onChange={(d) => setDueDate(d)}
              onClose={() => setShowDatePicker(false)}
              colors={colors}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Category
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          category === c ? colors.primary : colors.muted,
                      },
                    ]}
                    onPress={() => setCategory(c)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: category === c ? "#fff" : colors.mutedForeground,
                        },
                      ]}
                    >
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={[
                styles.toggleRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => setIsRecurring(!isRecurring)}
            >
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
                Recurring Bill
              </Text>
              <View
                style={[
                  styles.toggle,
                  { backgroundColor: isRecurring ? colors.primary : colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    { transform: [{ translateX: isRecurring ? 20 : 2 }] },
                  ]}
                />
              </View>
            </TouchableOpacity>

            {isRecurring && (
              <View style={styles.freqRow}>
                {(["weekly", "monthly", "yearly"] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.freqBtn,
                      {
                        backgroundColor:
                          frequency === f ? colors.primary : colors.muted,
                        flex: 1,
                      },
                    ]}
                    onPress={() => setFrequency(f)}
                  >
                    <Text
                      style={[
                        styles.freqText,
                        {
                          color:
                            frequency === f ? "#fff" : colors.mutedForeground,
                        },
                      ]}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  saveBtn: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    padding: 20,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  freqRow: {
    flexDirection: "row",
    gap: 8,
  },
  freqBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  freqText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
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
  donePillText: { fontFamily: "Inter_600SemiBold", color: "#fff" },
});
