import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useState } from "react";
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

import { Category, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import AddCategoryModal from "./AddCategoryModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (category: string, subcategory?: string) => void;
  type?: "expense" | "income" | "both";
}

export default function CategoryPickerModal({ visible, onClose, onSelect, type = "both" }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { categories } = useApp();

  const [selectedParent, setSelectedParent] = useState<Category | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [search, setSearch] = useState("");

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setSelectedParent(null);
      setSearch("");
      setShowAddCategory(false);
    }
  }, [visible]);

  // Filter top-level categories by type
  const topLevelCategories = useMemo(() => {
    const base = categories.filter(
      (c) => !c.parentId && (type === "both" || c.type === type || c.type === "both")
    );
    if (!search.trim()) return base;
    return base.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [categories, type, search]);

  // Get subcategories for selected parent
  const subcategories = useMemo(() => {
    if (!selectedParent) return [];
    const subs = categories.filter((c) => c.parentId === selectedParent.id);
    if (!search.trim()) return subs;
    return subs.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [categories, selectedParent, search]);

  const handleCategoryPress = (cat: Category) => {
    const hasSubcats = categories.some((c) => c.parentId === cat.id);
    if (hasSubcats) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedParent(cat);
      setSearch("");
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelect(cat.name);
      onClose();
    }
  };

  const handleSubcategoryPress = (sub: Category) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(selectedParent?.name || sub.name, sub.name);
    onClose();
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedParent(null);
    setSearch("");
  };

  const handleClose = () => {
    onClose();
  };

  const renderItem = (cat: Category, isSub = false) => (
    <TouchableOpacity
      key={cat.id}
      style={styles.categoryItem}
      onPress={() => (isSub ? handleSubcategoryPress(cat) : handleCategoryPress(cat))}
      activeOpacity={0.7}
    >
      <View style={[styles.categoryIcon, { backgroundColor: cat.color + "22" }]}>
        {cat.iconType === "emoji" ? (
          <Text style={styles.emojiIcon}>{cat.icon}</Text>
        ) : (
          <Feather name={(cat.icon as any) || "grid"} size={26} color={cat.color} />
        )}
      </View>
      <Text style={[styles.categoryLabel, { color: colors.foreground }]} numberOfLines={2}>
        {cat.name}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={selectedParent ? handleBack : handleClose} style={styles.headerBtn}>
            <Feather name={selectedParent ? "arrow-left" : "x"} size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {selectedParent ? selectedParent.name : "Select Category"}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        {/* Search bar */}
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={selectedParent ? "Search subcategories..." : "Search categories..."}
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {!selectedParent ? (
            <>
              {/* All Categories Grid */}
              {topLevelCategories.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                    {search ? "Results" : "All"}
                  </Text>
                  <View style={styles.grid}>
                    {topLevelCategories.map((cat) => renderItem(cat))}
                  </View>
                </View>
              ) : (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No categories found
                </Text>
              )}

              {/* Add Category */}
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setShowAddCategory(true)}
              >
                <View style={[styles.addBtnIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="plus" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.addBtnText, { color: colors.foreground }]}>Add Category</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Parent category as a selectable item */}
              <TouchableOpacity
                style={[styles.parentSelectRow, { backgroundColor: colors.card, borderColor: colors.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onSelect(selectedParent.name);
                  onClose();
                }}
              >
                <View style={[styles.categoryIcon, { backgroundColor: selectedParent.color + "22" }]}>
                  {selectedParent.iconType === "emoji" ? (
                    <Text style={styles.emojiIcon}>{selectedParent.icon}</Text>
                  ) : (
                    <Feather name={(selectedParent.icon as any) || "grid"} size={26} color={selectedParent.color} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.parentSelectLabel, { color: colors.foreground }]}>
                    {selectedParent.name}
                  </Text>
                  <Text style={[styles.parentSelectSub, { color: colors.mutedForeground }]}>
                    Tap to select without subcategory
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.primary} />
              </TouchableOpacity>

              {/* Subcategories Grid */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                  Subcategories
                </Text>
                {subcategories.length > 0 ? (
                  <View style={styles.grid}>
                    {subcategories.map((sub) => renderItem(sub, true))}
                  </View>
                ) : (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {search ? "No subcategories match your search" : "No subcategories yet"}
                  </Text>
                )}
              </View>

              {/* Add Sub Category */}
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setShowAddCategory(true)}
              >
                <View style={[styles.addBtnIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="plus" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.addBtnText, { color: colors.foreground }]}>Add Sub Category</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      <AddCategoryModal
        visible={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        parentCategory={selectedParent}
        type={type === "both" ? "expense" : type}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  categoryItem: {
    width: "33.33%",
    paddingHorizontal: 4,
    marginBottom: 20,
    alignItems: "center",
  },
  categoryIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emojiIcon: { fontSize: 28 },
  categoryLabel: { fontSize: 12, textAlign: "center", lineHeight: 16 },
  parentSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 20,
    gap: 12,
  },
  parentSelectLabel: { fontSize: 15, fontWeight: "600" },
  parentSelectSub: { fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
  },
  addBtnIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { fontSize: 16, fontWeight: "600" },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 32 },
});
