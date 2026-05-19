import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (merchant: string) => void;
  selected?: string;
}

export default function MerchantPickerModal({ visible, onClose, onSelect, selected }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions } = useApp();
  const [query, setQuery] = useState("");

  const merchants = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of transactions) {
      if (t.category === "Transfer") continue;
      const name = (t.merchant || t.title || "").trim();
      if (!name) continue;
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merchants;
    return merchants.filter((m) => m.toLowerCase().includes(q));
  }, [merchants, query]);

  const handleSelect = (name: string) => {
    Haptics.selectionAsync();
    onSelect(name);
    setQuery("");
    onClose();
  };

  const pb = Platform.OS === "web" ? 24 : insets.bottom + 12;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: pb }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>Select Merchant</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search or type new merchant…"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (query.trim()) handleSelect(query.trim());
              }}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Use typed value as new merchant */}
          {query.trim().length > 0 && !filtered.some((m) => m.toLowerCase() === query.trim().toLowerCase()) && (
            <TouchableOpacity
              style={[styles.newItem, { borderColor: colors.border, backgroundColor: colors.accent }]}
              onPress={() => handleSelect(query.trim())}
            >
              <Feather name="plus-circle" size={16} color={colors.primary} />
              <Text style={[styles.newItemText, { color: colors.primary }]}>
                Use "{query.trim()}"
              </Text>
            </TouchableOpacity>
          )}

          {/* List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}
            renderItem={({ item }) => {
              const isSelected = item === selected;
              return (
                <TouchableOpacity
                  style={[
                    styles.item,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: colors.primary + "15" },
                  ]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.itemIcon, { backgroundColor: isSelected ? colors.primary + "20" : colors.muted }]}>
                    <Feather name="shopping-bag" size={16} color={isSelected ? colors.primary : colors.mutedForeground} />
                  </View>
                  <Text
                    style={[styles.itemText, { color: isSelected ? colors.primary : colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item}
                  </Text>
                  {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="search" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No merchants found</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  newItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  newItemText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
