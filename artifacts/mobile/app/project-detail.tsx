import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
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

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

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

  const totalSpent = projectTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const totalIncome = projectTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const refunded = projectTxs.filter((t) => t.isRefund).reduce((s, t) => s + t.amount, 0);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(project?.name ?? "");
  const [editDesc, setEditDesc] = useState(project?.description ?? "");
  const [editColor, setEditColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createColor, setCreateColor] = useState(PROJECT_COLORS[0]);

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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
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
        </ScrollView>
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

      {/* Transaction list */}
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

      {/* Delete button */}
      <View style={[s.deleteRow, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={[s.deleteBtn, { borderColor: "#ef4444" }]} onPress={handleDelete} activeOpacity={0.75}>
          <Feather name="trash-2" size={16} color="#ef4444" />
          <Text style={[s.deleteBtnText, { color: "#ef4444" }]}>Delete Project</Text>
        </TouchableOpacity>
      </View>

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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14 }}>
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
          </ScrollView>
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
});
