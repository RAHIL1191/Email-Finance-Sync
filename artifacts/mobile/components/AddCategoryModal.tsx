import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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

interface Props {
  visible: boolean;
  onClose: () => void;
  parentCategory?: Category | null; // If provided, adding a subcategory
  type?: "expense" | "income" | "both";
}

const DEFAULT_COLORS = [
  "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#3b82f6", "#6366f1",
  "#f59e0b", "#14b8a6", "#64748b", "#e11d48", "#0284c7", "#db2777",
  "#ef4444", "#7c3aed", "#475569", "#059669", "#f472b6", "#84cc16",
];

const ICON_OPTIONS = [
  "coffee", "shopping-bag", "tag", "navigation", "film", "home", "zap",
  "heart", "shield", "refresh-cw", "briefcase", "cpu", "trending-up", "gift",
  "more-horizontal", "shopping-cart", "book-open", "repeat", "file-text",
  "calendar", "users", "alert-circle", "dollar-sign", "smile", "credit-card",
  "scissors", "map", "percent", "bar-chart-2", "grid", "chevron-right",
];

const EMOJI_OPTIONS = [
  "🍔", "🛒", "🏷️", "🧭", "🎬", "🏠", "⚡", "❤️", "🛡️", "🔄",
  "💼", "💻", "📈", "🎁", "⋯", "🛍️", "📚", "🔁", "📄", "📅",
  "👥", "⚠️", "💵", "😊", "💳", "✂️", "🗺️", "📊", "🔲",
];

export default function AddCategoryModal({ visible, onClose, parentCategory, type = "expense" }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addCategory } = useApp();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState("coffee");
  const [iconType, setIconType] = useState<"icon" | "image" | "emoji">("icon");
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJI_OPTIONS[0]);
  const [providerType, setProviderType] = useState("");
  const [merchantType, setMerchantType] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    addCategory({
      name: name.trim(),
      description: description.trim() || undefined,
      type: parentCategory?.type || type,
      icon: iconType === "emoji" ? selectedEmoji : selectedIcon,
      iconType,
      color: selectedColor,
      parentId: parentCategory?.id,
      providerType: providerType.trim() || undefined,
      merchantType: merchantType.trim() || undefined,
    });
    
    onClose();
    // Reset form
    setName("");
    setDescription("");
    setSelectedColor(DEFAULT_COLORS[0]);
    setSelectedIcon("coffee");
    setSelectedEmoji(EMOJI_OPTIONS[0]);
    setProviderType("");
    setMerchantType("");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Feather name="x" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {parentCategory ? "Add Sub Category" : "Add Category"}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
            <Text style={[styles.saveBtnText, { color: colors.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Parent Category (if subcategory) */}
          {parentCategory && (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Parent Category</Text>
              <View style={styles.parentCategoryRow}>
                <View style={[styles.parentIcon, { backgroundColor: parentCategory.color + "20" }]}>
                  {parentCategory.iconType === "emoji" ? (
                    <Text style={styles.emojiIcon}>{parentCategory.icon}</Text>
                  ) : (
                    <Feather name={parentCategory.icon as any} size={20} color={parentCategory.color} />
                  )}
                </View>
                <Text style={[styles.parentName, { color: colors.foreground }]}>{parentCategory.name}</Text>
              </View>
            </View>
          )}

          {/* Category Type */}
          {!parentCategory && (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Category Type</Text>
              <View style={styles.typeRow}>
                {(["expense", "income", "both"] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeBtn,
                      type === t && { backgroundColor: colors.primary },
                      { borderColor: colors.border },
                    ]}
                    onPress={() => {}}
                    disabled
                  >
                    <Text style={[styles.typeBtnText, { color: type === t ? "#fff" : colors.foreground }]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Category Name */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              {parentCategory ? "Sub Category Name" : "Category Name"}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Enter name"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Description */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (Optional)</Text>
            <TextInput
              style={[styles.textArea, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Enter description"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Icon Type Selection */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Icon Type</Text>
            <View style={styles.typeRow}>
              {(["icon", "emoji"] as const).map((it) => (
                <TouchableOpacity
                  key={it}
                  style={[
                    styles.typeBtn,
                    iconType === it && { backgroundColor: colors.primary },
                    { borderColor: colors.border },
                  ]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIconType(it); }}
                >
                  <Text style={[styles.typeBtnText, { color: iconType === it ? "#fff" : colors.foreground }]}>
                    {it.charAt(0).toUpperCase() + it.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Icon Selection */}
          {iconType === "icon" ? (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Select Icon</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map((icon) => (
                  <TouchableOpacity
                    key={icon}
                    style={[
                      styles.iconItem,
                      selectedIcon === icon && { backgroundColor: colors.primary + "20", borderColor: colors.primary },
                      { borderColor: colors.border },
                    ]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedIcon(icon); }}
                  >
                    <Feather name={icon as any} size={24} color={selectedIcon === icon ? colors.primary : colors.foreground} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Select Emoji</Text>
              <View style={styles.iconGrid}>
                {EMOJI_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.iconItem,
                      selectedEmoji === emoji && { backgroundColor: colors.primary + "20", borderColor: colors.primary },
                      { borderColor: colors.border },
                    ]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedEmoji(emoji); }}
                  >
                    <Text style={styles.emojiIcon}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Color Selection */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Select Color</Text>
            <View style={styles.colorGrid}>
              {DEFAULT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorItem,
                    selectedColor === color && { borderWidth: 3, borderColor: colors.foreground },
                  ]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedColor(color); }}
                >
                  <View style={[styles.colorCircle, { backgroundColor: color }]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Provider Type */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Provider Type (Optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="e.g., Netflix, Spotify"
              placeholderTextColor={colors.mutedForeground}
              value={providerType}
              onChangeText={setProviderType}
            />
          </View>

          {/* Merchant Type */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Merchant Type (Optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="e.g., Grocery, Electronics"
              placeholderTextColor={colors.mutedForeground}
              value={merchantType}
              onChangeText={setMerchantType}
            />
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  saveBtn: {
    padding: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: "top",
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  parentCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  parentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  parentName: {
    fontSize: 16,
    fontWeight: "600",
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  iconItem: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    marginBottom: 12,
  },
  emojiIcon: {
    fontSize: 28,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  colorItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    marginBottom: 12,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
