import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Modal,
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

export interface TxFilterSettings {
  type: "All" | "Expenses" | "Income" | "Transfer";
  categories: string[];
  accountIds: string[];
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  notes: string;
}

export const DEFAULT_TX_FILTER: TxFilterSettings = {
  type: "All",
  categories: [],
  accountIds: [],
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  notes: "",
};

const TX_TYPES = ["All", "Expenses", "Income", "Transfer"] as const;

interface Props {
  visible: boolean;
  current: TxFilterSettings;
  onApply: (s: TxFilterSettings) => void;
  onClose: () => void;
}

export default function TransactionFilterModal({ visible, current, onApply, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts, categories } = useApp();

  const [type, setType] = useState<TxFilterSettings["type"]>(current.type);
  const [selCategories, setSelCategories] = useState<string[]>(current.categories);
  const [selAccountIds, setSelAccountIds] = useState<string[]>(current.accountIds);
  const [dateFrom, setDateFrom] = useState(current.dateFrom);
  const [dateTo, setDateTo] = useState(current.dateTo);
  const [amountMin, setAmountMin] = useState(current.amountMin);
  const [amountMax, setAmountMax] = useState(current.amountMax);
  const [notes, setNotes] = useState(current.notes);

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showAccPicker, setShowAccPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setType(current.type);
      setSelCategories(current.categories);
      setSelAccountIds(current.accountIds);
      setDateFrom(current.dateFrom);
      setDateTo(current.dateTo);
      setAmountMin(current.amountMin);
      setAmountMax(current.amountMax);
      setNotes(current.notes);
    }
  }, [visible]);

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply({ type, categories: selCategories, accountIds: selAccountIds, dateFrom, dateTo, amountMin, amountMax, notes });
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setType("All");
    setSelCategories([]);
    setSelAccountIds([]);
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
    setNotes("");
  };

  const removeCategory = (cat: string) => setSelCategories((p) => p.filter((c) => c !== cat));
  const removeAccount = (id: string) => setSelAccountIds((p) => p.filter((a) => a !== id));

  const topLevelCats = categories.filter((c) => !c.parentId).map((c) => c.name);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View style={{ width: 28 }} />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Filters</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
          {/* Type chips */}
          <View style={s.chipRow}>
            {TX_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  s.chip,
                  {
                    backgroundColor: type === t ? colors.primary : "transparent",
                    borderColor: type === t ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setType(t); }}
              >
                <Text style={[s.chipText, { color: type === t ? "#fff" : colors.foreground }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Categories */}
          <View style={[s.sectionRow, { borderBottomColor: colors.border }]}>
            <Text style={[s.sectionLabel, { color: colors.foreground }]}>Categories</Text>
            <TouchableOpacity onPress={() => setShowCatPicker(true)} hitSlop={8}>
              <Feather name="plus" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          {selCategories.length > 0 && (
            <View style={s.chipRow}>
              {selCategories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[s.chip, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}
                  onPress={() => removeCategory(cat)}
                >
                  <Text style={[s.chipText, { color: colors.primary }]}>{cat}</Text>
                  <Feather name="x" size={12} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Accounts */}
          <View style={[s.sectionRow, { borderBottomColor: colors.border }]}>
            <Text style={[s.sectionLabel, { color: colors.foreground }]}>Accounts</Text>
            <TouchableOpacity onPress={() => setShowAccPicker(true)} hitSlop={8}>
              <Feather name="plus" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          {selAccountIds.length > 0 && (
            <View style={s.chipRow}>
              {selAccountIds.map((id) => {
                const acc = accounts.find((a) => a.id === id);
                if (!acc) return null;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[s.chip, { backgroundColor: acc.color + "18", borderColor: acc.color }]}
                    onPress={() => removeAccount(id)}
                  >
                    <View style={[s.dot, { backgroundColor: acc.color }]} />
                    <Text style={[s.chipText, { color: acc.color }]}>{acc.name}</Text>
                    <Feather name="x" size={12} color={acc.color} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Date Range */}
          <Text style={[s.sectionLabel, { color: colors.foreground, marginTop: 4 }]}>Date Range</Text>
          <View style={s.twoCol}>
            <View style={[s.inputBox, { borderColor: colors.border, backgroundColor: colors.card, flex: 1 }]}>
              <TextInput
                style={[s.input, { color: colors.foreground }]}
                placeholder="From"
                placeholderTextColor={colors.mutedForeground}
                value={dateFrom}
                onChangeText={setDateFrom}
              />
            </View>
            <View style={[s.inputBox, { borderColor: colors.border, backgroundColor: colors.card, flex: 1 }]}>
              <TextInput
                style={[s.input, { color: colors.foreground }]}
                placeholder="To"
                placeholderTextColor={colors.mutedForeground}
                value={dateTo}
                onChangeText={setDateTo}
              />
            </View>
          </View>

          {/* Amount */}
          <Text style={[s.sectionLabel, { color: colors.foreground }]}>Amount</Text>
          <View style={s.twoCol}>
            <View style={[s.inputBox, { borderColor: colors.border, backgroundColor: colors.card, flex: 1 }]}>
              <TextInput
                style={[s.input, { color: colors.foreground }]}
                placeholder="Min"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={amountMin}
                onChangeText={setAmountMin}
              />
            </View>
            <View style={[s.inputBox, { borderColor: colors.border, backgroundColor: colors.card, flex: 1 }]}>
              <TextInput
                style={[s.input, { color: colors.foreground }]}
                placeholder="Max"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={amountMax}
                onChangeText={setAmountMax}
              />
            </View>
          </View>

          {/* Notes */}
          <Text style={[s.sectionLabel, { color: colors.foreground }]}>Notes</Text>
          <View style={[s.inputBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              style={[s.input, { color: colors.foreground }]}
              placeholder="Something like"
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Footer buttons */}
          <View style={s.footer}>
            <TouchableOpacity style={[s.footerBtn, { backgroundColor: colors.primary }]} onPress={handleClear}>
              <Text style={s.footerBtnText}>CLEAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.footerBtn, { backgroundColor: colors.primary }]} onPress={handleApply}>
              <Text style={s.footerBtnText}>APPLY</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Category picker inline sheet */}
        {showCatPicker && (
          <Modal visible transparent animationType="slide" onRequestClose={() => setShowCatPicker(false)}>
            <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowCatPicker(false)} />
            <View style={[s.pickerSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
              <View style={[s.header, { borderBottomColor: colors.border }]}>
                <View style={{ width: 28 }} />
                <Text style={[s.headerTitle, { color: colors.foreground }]}>Select Category</Text>
                <TouchableOpacity onPress={() => setShowCatPicker(false)} hitSlop={10}>
                  <Feather name="x" size={22} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
                {topLevelCats.map((cat) => {
                  const sel = selCategories.includes(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[s.pickerRow, { backgroundColor: sel ? colors.primary + "12" : colors.card, borderColor: sel ? colors.primary : colors.border }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelCategories((prev) =>
                          prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                        );
                      }}
                    >
                      <Text style={[s.pickerRowText, { color: sel ? colors.primary : colors.foreground }]}>{cat}</Text>
                      {sel && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={[s.footerBtn, { backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 8 }]}
                onPress={() => setShowCatPicker(false)}
              >
                <Text style={s.footerBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        )}

        {/* Account picker inline sheet */}
        {showAccPicker && (
          <Modal visible transparent animationType="slide" onRequestClose={() => setShowAccPicker(false)}>
            <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowAccPicker(false)} />
            <View style={[s.pickerSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
              <View style={[s.header, { borderBottomColor: colors.border }]}>
                <View style={{ width: 28 }} />
                <Text style={[s.headerTitle, { color: colors.foreground }]}>Select Account</Text>
                <TouchableOpacity onPress={() => setShowAccPicker(false)} hitSlop={10}>
                  <Feather name="x" size={22} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
                {accounts.map((acc) => {
                  const sel = selAccountIds.includes(acc.id);
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[s.pickerRow, { backgroundColor: sel ? acc.color + "12" : colors.card, borderColor: sel ? acc.color : colors.border }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelAccountIds((prev) =>
                          prev.includes(acc.id) ? prev.filter((a) => a !== acc.id) : [...prev, acc.id]
                        );
                      }}
                    >
                      <View style={[s.dot, { backgroundColor: acc.color }]} />
                      <Text style={[s.pickerRowText, { color: sel ? acc.color : colors.foreground, flex: 1 }]}>{acc.name}</Text>
                      {sel && <Feather name="check" size={16} color={acc.color} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={[s.footerBtn, { backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 8 }]}
                onPress={() => setShowAccPicker(false)}
              >
                <Text style={s.footerBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
  },
  pickerSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  body: {
    padding: 20,
    gap: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  twoCol: {
    flexDirection: "row",
    gap: 10,
  },
  inputBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.6,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickerRowText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
