import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import DraggableFlatList, { NestableDraggableFlatList, NestableScrollContainer, RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChecklistGroup, ChecklistGroupItem, InnerChecklist, InnerItem, InnerNote, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PREMADE_TEMPLATES = [
  { id: "grocery", icon: "🛒", label: "Grocery", items: ["Milk", "Eggs", "Bread", "Butter", "Vegetables", "Fruit", "Cheese"] },
  { id: "packing", icon: "🧳", label: "Packing", items: ["Passport", "Phone charger", "Clothes", "Toiletries", "Laptop", "Headphones", "Travel docs"] },
  { id: "work", icon: "💼", label: "Work", items: ["Prepare presentation", "Send meeting notes", "Review report", "Reply to emails"] },
  { id: "home", icon: "🏠", label: "Home", items: ["Cleaning supplies", "Fix leaking tap", "Vacuum floors", "Take out trash", "Pay utilities"] },
  { id: "todo", icon: "📋", label: "To-Do", items: [] },
] as const;

type Template = (typeof PREMADE_TEMPLATES)[number];

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

// ── Checklist stylesheet (must be before components that reference it) ────────
const cl = StyleSheet.create({
  // ── collapsed row
  listRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  listRowTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  listSep: { height: StyleSheet.hairlineWidth },

  // ── expanded title row
  listTitleInput: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold", paddingVertical: 0 },

  // ── action bar (place + icons)
  listActionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  listPlaceCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  listPlaceInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  listActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── items
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  circle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  itemText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  addItemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 10 },
  addItemText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  // ── empty state
  checklistContent: { paddingTop: 0 },
  emptyChecklist: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },

  // ── inline note card
  noteCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  noteCardBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
  },
  noteCardBodyCollapsed: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  noteCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  noteInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0, minHeight: 44 },
  noteCollapsedText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  // ── inner checklist card
  innerCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  innerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  innerCardTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", paddingVertical: 0 },
  innerCardDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  innerCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  innerFooterLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  innerFooterRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  innerFooterText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dragDots: { flexDirection: "row", gap: 3 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },

  // ── + New list pill
  newListBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: "#ef4444",
  },
  newListBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // ── modals
  templateOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  templateSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 32, maxHeight: "70%" },
  templateSheetTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", paddingHorizontal: 18, paddingVertical: 14 },
  templateRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  templateIcon: { fontSize: 22 },
  templateLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  templatePreview: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  notesSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "65%" },
  notesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  notesDone: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  notesInput: { margin: 16, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 120 },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 32 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 16 },
  menuRowText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});

// ── InnerChecklistCard ───────────────────────────────────────────────────────────

function InnerChecklistCard({
  checklist, cardIndex, totalCards, colors, insets, drag,
  onToggleCollapse, onToggleDone, onUpdateTitle,
  onAddItemAfter, onUpdateItemText, onToggleItem, onDeleteItem,
  onDelete, onMoveUp, onMoveDown, onApplyTemplate,
}: {
  checklist: InnerChecklist;
  cardIndex: number;
  totalCards: number;
  colors: any;
  insets: any;
  drag: () => void;
  onToggleCollapse: () => void;
  onToggleDone: () => void;
  onUpdateTitle: (t: string) => void;
  onAddItemAfter: (afterId: string | null) => string;
  onUpdateItemText: (itemId: string, text: string) => void;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onApplyTemplate: (t: Template) => void;
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const itemRefs = useRef<Record<string, TextInput | null>>({});

  const focusNew = (afterId: string | null) => {
    const newId = onAddItemAfter(afterId);
    setTimeout(() => itemRefs.current[newId]?.focus(), 50);
  };

  if (checklist.collapsed) {
    return (
      <ScaleDecorator>
        <View style={[cl.innerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={cl.innerCardHeader}>
            <TouchableOpacity onPress={onToggleCollapse} hitSlop={8}>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[cl.innerCardTitle, { color: checklist.title ? colors.foreground : colors.mutedForeground, fontStyle: checklist.title ? "normal" : "italic" }]} numberOfLines={1}>
              {checklist.title || "Add a title"}
            </Text>
            <TouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={10}>
              <View style={{ gap: 2 }}>
                {[0, 1, 2].map((row) => (
                  <View key={row} style={cl.dragDots}>
                    {[0, 1].map((col) => <View key={col} style={[cl.dot, { backgroundColor: colors.mutedForeground }]} />)}
                  </View>
                ))}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onToggleDone} hitSlop={8}>
              <Feather name={checklist.completed ? "check-square" : "square"} size={20} color={checklist.completed ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </ScaleDecorator>
    );
  }

  return (
    <ScaleDecorator>
    <View style={[cl.innerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={cl.innerCardHeader}>
        <TextInput
          style={[cl.innerCardTitle, { color: checklist.title ? colors.foreground : colors.mutedForeground }]}
          placeholder="Add a title"
          placeholderTextColor={colors.mutedForeground}
          value={checklist.title}
          onChangeText={onUpdateTitle}
        />
        <TouchableOpacity onPress={onToggleDone} hitSlop={8}>
          <Feather name={checklist.completed ? "check-square" : "square"} size={20} color={checklist.completed ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Items */}
      {checklist.items.map((item) => (
        <View key={item.id} style={cl.itemRow}>
          <TouchableOpacity onPress={() => onToggleItem(item.id)} hitSlop={6}>
            <View style={[cl.circle, { borderColor: item.completed ? colors.primary : colors.mutedForeground, backgroundColor: item.completed ? colors.primary + "20" : "transparent" }]}>
              {item.completed && <Feather name="check" size={10} color={colors.primary} />}
            </View>
          </TouchableOpacity>
          <TextInput
            ref={(r) => { itemRefs.current[item.id] = r; }}
            style={[cl.itemText, { color: item.completed ? colors.mutedForeground : colors.foreground, textDecorationLine: item.completed ? "line-through" : "none", flex: 1, paddingVertical: 0 }]}
            value={item.text}
            onChangeText={(t) => onUpdateItemText(item.id, t)}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => focusNew(item.id)}
          />
          <TouchableOpacity onPress={() => onDeleteItem(item.id)} hitSlop={8}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      ))}

      {/* Add some items */}
      <TouchableOpacity style={cl.addItemRow} activeOpacity={0.6} onPress={() => focusNew(checklist.items.length > 0 ? checklist.items[checklist.items.length - 1].id : null)}>
        <View style={[cl.circle, { borderColor: colors.mutedForeground + "50" }]} />
        <Text style={[cl.addItemText, { color: colors.mutedForeground }]}>Add some items</Text>
      </TouchableOpacity>

      <View style={[cl.innerCardDivider, { backgroundColor: colors.border }]} />

      {/* Footer */}
      <View style={cl.innerCardFooter}>
        <TouchableOpacity style={cl.innerFooterLeft} onPress={() => setShowTemplates(true)} activeOpacity={0.7}>
          <Feather name="briefcase" size={13} color={colors.mutedForeground} />
          <Text style={[cl.innerFooterText, { color: colors.mutedForeground }]}>Pre-made lists</Text>
        </TouchableOpacity>
        <View style={cl.innerFooterRight}>
          <TouchableOpacity onPress={onDelete} hitSlop={10}>
            <Feather name="trash-2" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={10}>
            <View style={{ gap: 2 }}>
              {[0, 1, 2].map((row) => (
                <View key={row} style={cl.dragDots}>
                  {[0, 1].map((col) => (
                    <View key={col} style={[cl.dot, { backgroundColor: colors.mutedForeground }]} />
                  ))}
                </View>
              ))}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleCollapse} hitSlop={10}>
            <Feather name="chevron-up" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pre-made lists modal */}
      <Modal visible={showTemplates} transparent animationType="slide" onRequestClose={() => setShowTemplates(false)}>
        <TouchableOpacity style={cl.templateOverlay} activeOpacity={1} onPress={() => setShowTemplates(false)} />
        <View style={[cl.templateSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}>
          <Text style={[cl.templateSheetTitle, { color: colors.foreground }]}>Pre-made Lists</Text>
          {PREMADE_TEMPLATES.map((t) => (
            <TouchableOpacity key={t.id} style={[cl.templateRow, { borderBottomColor: colors.border }]}
              onPress={() => { onApplyTemplate(t); setShowTemplates(false); }} activeOpacity={0.7}>
              <Text style={cl.templateIcon}>{t.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[cl.templateLabel, { color: colors.foreground }]}>{t.label}</Text>
                {t.items.length > 0 && (
                  <Text style={[cl.templatePreview, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {[...t.items].slice(0, 4).join(", ")}{t.items.length > 4 ? "…" : ""}
                  </Text>
                )}
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
    </ScaleDecorator>
  );
}

// ── NoteCard ─────────────────────────────────────────────────────────────────
function NoteCard({
  note, colors, drag,
  onUpdateText, onToggleCollapse, onDelete,
}: {
  note: InnerNote;
  colors: any;
  drag: () => void;
  onUpdateText: (t: string) => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
}) {
  if (note.collapsed) {
    return (
      <ScaleDecorator>
        <View style={[cl.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={cl.noteCardBodyCollapsed} onPress={onToggleCollapse} activeOpacity={0.7}>
            <View style={[cl.noteCardIcon, { backgroundColor: colors.muted }]}>
              <Feather name="file-text" size={14} color={colors.mutedForeground} />
            </View>
            <Text style={[cl.noteCollapsedText, { color: note.text ? colors.foreground : colors.mutedForeground, fontStyle: note.text ? "normal" : "italic" }]} numberOfLines={1}>
              {note.text || "Add your notes here"}
            </Text>
            <TouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={10}>
              <View style={{ gap: 2 }}>
                {[0, 1, 2].map((row) => (
                  <View key={row} style={cl.dragDots}>
                    {[0, 1].map((col) => <View key={col} style={[cl.dot, { backgroundColor: colors.mutedForeground }]} />)}
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  }

  return (
    <ScaleDecorator>
      <View style={[cl.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={cl.noteCardBody}>
          <View style={[cl.noteCardIcon, { backgroundColor: colors.muted }]}>
            <Feather name="file-text" size={14} color={colors.mutedForeground} />
          </View>
          <TextInput
            style={[cl.noteInput, { color: colors.foreground }]}
            value={note.text}
            onChangeText={onUpdateText}
            placeholder="Add your notes here"
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
          />
        </View>
        <View style={[cl.innerCardDivider, { backgroundColor: colors.border, marginTop: 8 }]} />
        <View style={cl.innerCardFooter}>
          <View style={{ flex: 1 }} />
          <View style={cl.innerFooterRight}>
            <TouchableOpacity onPress={onDelete} hitSlop={10}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={10}>
              <View style={{ gap: 2 }}>
                {[0, 1, 2].map((row) => (
                  <View key={row} style={cl.dragDots}>
                    {[0, 1].map((col) => <View key={col} style={[cl.dot, { backgroundColor: colors.mutedForeground }]} />)}
                  </View>
                ))}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onToggleCollapse} hitSlop={10}>
              <Feather name="chevron-up" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScaleDecorator>
  );
}

// ── GroupCard ─────────────────────────────────────────────────────────────────
interface GroupCardProps {
  group: ChecklistGroup;
  colors: any;
  insets: any;
  drag: () => void;
  onToggleCollapse: () => void;
  onUpdateTitle: (t: string) => void;
  onUpdatePlace: (p: string) => void;
  onUpdateItems: (items: InnerItem[]) => void;
  onDelete: () => void;
}

function GroupCard({
  group, colors, insets, drag,
  onToggleCollapse, onUpdateTitle, onUpdatePlace,
  onUpdateItems, onDelete,
}: GroupCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const innerItems = group.items ?? [];

  const addNote = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newNote: InnerNote = { id: genId(), type: "note", text: "", collapsed: false };
    onUpdateItems([...innerItems, newNote]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const addInnerChecklist = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newC: InnerChecklist = { id: genId(), type: "checklist", title: "", completed: false, collapsed: false, items: [] };
    onUpdateItems([...innerItems, newC]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const updateItem = (id: string, updates: Partial<InnerNote> | Partial<InnerChecklist>) =>
    onUpdateItems(innerItems.map((it) => it.id === id ? { ...it, ...updates } as InnerItem : it));

  const deleteItem = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onUpdateItems(innerItems.filter((it) => it.id !== id));
  };

  const addChecklistItemAfter = (checklistId: string, afterId: string | null): string => {
    const newId = genId();
    const newCI: ChecklistGroupItem = { id: newId, text: "", completed: false };
    const checklist = innerItems.find((it) => it.id === checklistId) as InnerChecklist;
    const ciList = [...checklist.items];
    if (afterId === null) { ciList.push(newCI); }
    else { const pos = ciList.findIndex((ci) => ci.id === afterId); ciList.splice(pos + 1, 0, newCI); }
    updateItem(checklistId, { items: ciList });
    return newId;
  };

  const applyTemplate = (checklistId: string, template: Template) => {
    const checklist = innerItems.find((it) => it.id === checklistId) as InnerChecklist;
    const newCIs: ChecklistGroupItem[] = template.items.map((text) => ({ id: genId(), text, completed: false }));
    updateItem(checklistId, { title: checklist.title || template.label, items: [...checklist.items, ...newCIs] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const hasNotes = innerItems.some((it) => it.type === "note");

  // ── collapsed row
  if (group.collapsed) {
    return (
      <ScaleDecorator>
        <View>
          <View style={cl.listRow}>
            <TouchableOpacity onPress={onToggleCollapse} hitSlop={8}>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text
              style={[cl.listRowTitle, { color: group.title ? colors.foreground : colors.mutedForeground, fontStyle: group.title ? "normal" : "italic" }]}
              numberOfLines={1}
            >
              {group.title || "Untitled"}
            </Text>
            <TouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={10}>
              <View style={{ gap: 2 }}>
                {[0, 1, 2].map((row) => (
                  <View key={row} style={cl.dragDots}>
                    {[0, 1].map((col) => <View key={col} style={[cl.dot, { backgroundColor: colors.mutedForeground }]} />)}
                  </View>
                ))}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={8}>
              <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={[cl.listSep, { backgroundColor: colors.border }]} />
          <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
            <TouchableOpacity style={cl.templateOverlay} activeOpacity={1} onPress={() => setShowMenu(false)} />
            <View style={[cl.menuSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}>
              <TouchableOpacity style={cl.menuRow} onPress={() => { setShowMenu(false); onDelete(); }}>
                <Feather name="trash-2" size={18} color="#ef4444" />
                <Text style={[cl.menuRowText, { color: "#ef4444" }]}>Delete list</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        </View>
      </ScaleDecorator>
    );
  }

  // ── expanded
  return (
    <ScaleDecorator>
    <View>
      {/* Title row */}
      <View style={cl.listRow}>
        <TouchableOpacity onPress={onToggleCollapse} hitSlop={8}>
          <Feather name="chevron-down" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TextInput
          style={[cl.listTitleInput, { color: group.title ? colors.foreground : colors.mutedForeground }]}
          placeholder="Add a title"
          placeholderTextColor={colors.mutedForeground}
          value={group.title}
          onChangeText={onUpdateTitle}
        />
        <TouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={10}>
          <View style={{ gap: 2 }}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={cl.dragDots}>
                {[0, 1].map((col) => <View key={col} style={[cl.dot, { backgroundColor: colors.mutedForeground }]} />)}
              </View>
            ))}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={8}>
          <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Action bar: place + notes + add checklist */}
      <View style={[cl.listActionBar, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
        <View style={[cl.listPlaceCell, { borderColor: colors.border }]}>
          <Feather name="map-pin" size={13} color={colors.mutedForeground} />
          <TextInput
            style={[cl.listPlaceInput, { color: colors.foreground }]}
            placeholder="Add a place"
            placeholderTextColor={colors.mutedForeground}
            value={group.place ?? ""}
            onChangeText={onUpdatePlace}
            returnKeyType="done"
          />
        </View>
        <TouchableOpacity
          style={[cl.listActionIcon, { borderColor: colors.border, backgroundColor: hasNotes ? colors.primary + "15" : "transparent" }]}
          onPress={addNote}
          hitSlop={4}
        >
          <Feather name="file-text" size={16} color={hasNotes ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
        {/* Checklist icon — adds a new inner checklist card */}
        <TouchableOpacity
          style={[cl.listActionIcon, { borderColor: colors.border }]}
          onPress={addInnerChecklist}
          hitSlop={4}
        >
          <Feather name="check-square" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Unified inner items — single nestable draggable list */}
      <NestableDraggableFlatList
        data={innerItems}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => onUpdateItems(data)}
        scrollEnabled={false}
        renderItem={({ item, drag }: RenderItemParams<InnerItem>) => {
          if (item.type === "note") {
            return (
              <NoteCard
                note={item}
                colors={colors}
                drag={drag}
                onUpdateText={(t) => updateItem(item.id, { text: t })}
                onToggleCollapse={() => updateItem(item.id, { collapsed: !item.collapsed })}
                onDelete={() => deleteItem(item.id)}
              />
            );
          }
          return (
            <InnerChecklistCard
              checklist={item}
              cardIndex={0}
              totalCards={innerItems.length}
              colors={colors}
              insets={insets}
              drag={drag}
              onToggleCollapse={() => updateItem(item.id, { collapsed: !item.collapsed })}
              onToggleDone={() => updateItem(item.id, { completed: !item.completed })}
              onUpdateTitle={(t) => updateItem(item.id, { title: t })}
              onAddItemAfter={(afterId) => addChecklistItemAfter(item.id, afterId)}
              onUpdateItemText={(ciId, text) => updateItem(item.id, { items: item.items.map((ci) => ci.id === ciId ? { ...ci, text } : ci) })}
              onToggleItem={(ciId) => { updateItem(item.id, { items: item.items.map((ci) => ci.id === ciId ? { ...ci, completed: !ci.completed } : ci) }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              onDeleteItem={(ciId) => updateItem(item.id, { items: item.items.filter((ci) => ci.id !== ciId) })}
              onDelete={() => deleteItem(item.id)}
              onMoveUp={() => {}}
              onMoveDown={() => {}}
              onApplyTemplate={(tmpl) => applyTemplate(item.id, tmpl)}
            />
          );
        }}
      />

      {innerItems.length > 0 && <View style={{ height: 12 }} />}

      <View style={[cl.listSep, { backgroundColor: colors.border }]} />

      {/* ... menu modal */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={cl.templateOverlay} activeOpacity={1} onPress={() => setShowMenu(false)} />
        <View style={[cl.menuSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={cl.menuRow} onPress={() => { setShowMenu(false); onDelete(); }}>
            <Feather name="trash-2" size={18} color="#ef4444" />
            <Text style={[cl.menuRowText, { color: "#ef4444" }]}>Delete list</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
    </ScaleDecorator>
  );
}

// ── ChecklistTab ──────────────────────────────────────────────────────────────
function ChecklistTab({
  checklistGroups,
  colors,
  insets,
  onUpdateGroups,
}: {
  checklistGroups: ChecklistGroup[];
  colors: any;
  insets: any;
  onUpdateGroups: (groups: ChecklistGroup[]) => void;
}) {
  const updateGroup = useCallback((idx: number, updates: Partial<ChecklistGroup>) => {
    onUpdateGroups(checklistGroups.map((g, i) => (i === idx ? { ...g, ...updates } : g)));
  }, [checklistGroups, onUpdateGroups]);

  const addGroup = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newGroup: ChecklistGroup = { id: genId(), title: "", collapsed: false, items: [] };
    onUpdateGroups([...checklistGroups, newGroup]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [checklistGroups, onUpdateGroups]);

  const deleteGroup = useCallback((idx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onUpdateGroups(checklistGroups.filter((_, i) => i !== idx));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [checklistGroups, onUpdateGroups]);

  return (
    <NestableScrollContainer
      style={{ flex: 1 }}
      contentContainerStyle={[cl.checklistContent, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {checklistGroups.length === 0 && (
        <View style={cl.emptyChecklist}>
          <Feather name="list" size={40} color={colors.mutedForeground} />
          <Text style={[cl.emptyTitle, { color: colors.foreground }]}>No lists yet</Text>
          <Text style={[cl.emptyText, { color: colors.mutedForeground }]}>
            Tap "+ New list" to create your first list.
          </Text>
        </View>
      )}

      <NestableDraggableFlatList
        data={checklistGroups}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => onUpdateGroups(data)}
        scrollEnabled={false}
        renderItem={({ item: group, drag }: RenderItemParams<ChecklistGroup>) => {
          const idx = checklistGroups.findIndex((g) => g.id === group.id);
          return (
            <GroupCard
              group={group}
              colors={colors}
              insets={insets}
              drag={drag}
              onToggleCollapse={() => updateGroup(idx, { collapsed: !group.collapsed })}
              onUpdateTitle={(t) => updateGroup(idx, { title: t })}
              onUpdatePlace={(p) => updateGroup(idx, { place: p })}
              onUpdateItems={(items) => updateGroup(idx, { items })}
              onDelete={() => deleteGroup(idx)}
            />
          );
        }}
      />

      {/* + New list pill */}
      <TouchableOpacity style={cl.newListBtn} onPress={addGroup} activeOpacity={0.85}>
        <Feather name="plus" size={16} color="#fff" />
        <Text style={cl.newListBtnText}>New list</Text>
      </TouchableOpacity>
    </NestableScrollContainer>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProjectDetailScreen() {
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projects, transactions, updateProject, deleteProject, addProject } = useApp();

  const project = projects.find((p) => p.id === id);
  const projectTxs = useMemo(
    () => transactions.filter((t) => t.projectId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, id]
  );

  const totalSpent = projectTxs.filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer").reduce((s, t) => s + t.amount, 0);
  const totalIncome = projectTxs.filter((t) => t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer").reduce((s, t) => s + t.amount, 0);
  const refunded = projectTxs.filter((t) => t.isRefund).reduce((s, t) => s + t.amount, 0);

  const [activeTab, setActiveTab] = useState<"expenses" | "checklist">("expenses");
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(project?.name ?? "");
  const [editDesc, setEditDesc] = useState(project?.description ?? "");
  const [editColor, setEditColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createColor, setCreateColor] = useState(PROJECT_COLORS[0]);

  const handleUpdateGroups = useCallback((groups: ChecklistGroup[]) => {
    if (!project) return;
    updateProject(project.id, { checklistGroups: groups });
  }, [project, updateProject]);

  const handleUpdatePlace = useCallback((place: string) => {
    if (!project) return;
    updateProject(project.id, { place });
  }, [project, updateProject]);

  const handleUpdateNote = useCallback((note: string) => {
    if (!project) return;
    updateProject(project.id, { note });
  }, [project, updateProject]);

  if (mode === "create" && !project) {
    const handleCreate = () => {
      if (!createName.trim()) return;
      const createdId = addProject({ name: createName.trim(), description: createDesc.trim() || undefined, color: createColor });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/project-detail?id=${createdId}`);
    };
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>New Project</Text>
          <View style={{ width: 40 }} />
        </View>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <TextInput style={[s.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]} placeholder="Project name" placeholderTextColor={colors.mutedForeground} value={createName} onChangeText={setCreateName} />
          <TextInput style={[s.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]} placeholder="Description (optional)" placeholderTextColor={colors.mutedForeground} value={createDesc} onChangeText={setCreateDesc} />
          <View style={s.colorRow}>
            {PROJECT_COLORS.map((c) => (
              <TouchableOpacity key={c} style={[s.colorSwatch, { backgroundColor: c, borderWidth: createColor === c ? 3 : 0, borderColor: "#fff" }]} onPress={() => setCreateColor(c)} />
            ))}
          </View>
          <TouchableOpacity style={[s.saveBtn, { backgroundColor: createName.trim() ? colors.primary : colors.border }]} onPress={handleCreate} activeOpacity={createName.trim() ? 0.8 : 1}>
            <Text style={s.saveBtnText}>Create Project</Text>
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
        <View style={s.notFound}>
          <Feather name="folder" size={48} color={colors.mutedForeground} />
          <Text style={[s.notFoundText, { color: colors.mutedForeground }]}>Project not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.primary }]}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateProject(project.id, { name: editName.trim(), description: editDesc.trim() || undefined, color: editColor });
    setShowEdit(false);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Project",
      `Delete "${project.name}"? Transactions tagged to this project will be untagged.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteProject(project.id);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={[s.projectDot, { backgroundColor: project.color }]} />
          <Text style={[s.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{project.name}</Text>
        </View>
        <TouchableOpacity onPress={() => { setEditName(project.name); setEditDesc(project.description ?? ""); setEditColor(project.color); setShowEdit(true); }} hitSlop={10} style={s.headerBtn}>
          <Feather name="edit-2" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Summary cards */}
      <View style={[s.summaryRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <View style={s.summaryCard}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Total Spent</Text>
          <Text style={[s.summaryAmount, { color: colors.expense }]}>${totalSpent.toFixed(2)}</Text>
        </View>
        <View style={[s.summarySep, { backgroundColor: colors.border }]} />
        <View style={s.summaryCard}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Income</Text>
          <Text style={[s.summaryAmount, { color: colors.income }]}>${totalIncome.toFixed(2)}</Text>
        </View>
        <View style={[s.summarySep, { backgroundColor: colors.border }]} />
        <View style={s.summaryCard}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Transactions</Text>
          <Text style={[s.summaryAmount, { color: colors.foreground }]}>{projectTxs.length}</Text>
        </View>
        <View style={[s.summarySep, { backgroundColor: colors.border }]} />
        <View style={s.summaryCard}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Refunds</Text>
          <Text style={[s.summaryAmount, { color: colors.income }]}>${refunded.toFixed(2)}</Text>
        </View>
      </View>

      {project.description ? (
        <View style={[s.descRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[s.descText, { color: colors.mutedForeground }]}>{project.description}</Text>
        </View>
      ) : null}

      {/* Tab bar */}
      <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["expenses", "checklist"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabBtn, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabBtnText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
              {tab === "expenses" ? "Expenses" : "Checklist"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Expenses tab */}
      {activeTab === "expenses" && (
        <>
          {projectTxs.length === 0 ? (
            <View style={s.empty}>
              <Feather name="inbox" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>No transactions yet</Text>
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                Tag transactions to "{project.name}" when adding expenses or income.
              </Text>
            </View>
          ) : (
            <FlatList
              data={projectTxs}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={[s.txRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                  <View style={[s.txIcon, { backgroundColor: item.type === "expense" ? colors.expense + "18" : colors.income + "18" }]}>
                    <Feather
                      name={item.type === "expense" ? "arrow-down-circle" : "arrow-up-circle"}
                      size={18}
                      color={item.type === "expense" ? colors.expense : colors.income}
                    />
                  </View>
                  <View style={s.txInfo}>
                    <Text style={[s.txTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[s.txSub, { color: colors.mutedForeground }]}>
                      {item.category}{item.bank ? ` · ${item.bank}` : ""}{" · "}{formatDate(item.date)}
                      {item.isRefund ? " · Refund" : ""}
                    </Text>
                  </View>
                  <Text style={[s.txAmount, { color: item.type === "expense" ? colors.expense : colors.income }]}>
                    {item.type === "expense" ? "-" : "+"}${item.amount.toFixed(2)}
                  </Text>
                </View>
              )}
            />
          )}
          <View style={[s.deleteRow, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
            <TouchableOpacity style={[s.deleteBtn, { borderColor: "#ef4444" }]} onPress={handleDelete} activeOpacity={0.75}>
              <Feather name="trash-2" size={16} color="#ef4444" />
              <Text style={[s.deleteBtnText, { color: "#ef4444" }]}>Delete Project</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Checklist tab */}
      {activeTab === "checklist" && project && (
        <ChecklistTab
          checklistGroups={project.checklistGroups ?? []}
          colors={colors}
          insets={insets}
          onUpdateGroups={handleUpdateGroups}
        />
      )}

      {/* Edit modal */}
      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowEdit(false)} />
        <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.foreground }]}>Edit Project</Text>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
            <TextInput
              style={[s.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]}
              placeholder="Project name"
              placeholderTextColor={colors.mutedForeground}
              value={editName}
              onChangeText={setEditName}
              returnKeyType="next"
            />
            <TextInput
              style={[s.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={editDesc}
              onChangeText={setEditDesc}
              returnKeyType="done"
            />
            <Text style={[s.colorLabel, { color: colors.mutedForeground }]}>Color</Text>
            <View style={s.colorRow}>
              {PROJECT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.colorSwatch, { backgroundColor: c, borderWidth: editColor === c ? 3 : 0, borderColor: "#fff" }]}
                  onPress={() => setEditColor(c)}
                />
              ))}
            </View>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: editName.trim() ? colors.primary : colors.border }]}
              onPress={handleSaveEdit}
              activeOpacity={editName.trim() ? 0.8 : 1}
            >
              <Text style={s.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  backBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  projectDot: { width: 14, height: 14, borderRadius: 7 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },

  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
  },
  summaryCard: { flex: 1, alignItems: "center", gap: 4 },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  summaryAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summarySep: { width: 1, marginVertical: 4 },

  descRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  listContent: { paddingBottom: 16 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  txSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },

  deleteRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "75%" },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  colorLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
});
