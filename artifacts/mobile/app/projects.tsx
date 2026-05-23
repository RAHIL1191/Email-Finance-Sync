import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";


import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projects, transactions, deleteProject } = useApp();

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/project-detail?mode=create");
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Project",
      `Delete "${name}"? Transactions tagged to this project will be untagged.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteProject(id);
          },
        },
      ]
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          s.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Projects</Text>
        <TouchableOpacity
          onPress={openCreate}
          hitSlop={10}
          style={s.headerBtn}
        >
          <Feather name="plus" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* List */}
      {projects.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIconWrap, { backgroundColor: colors.primary + "14" }]}>
            <Feather name="folder-plus" size={32} color={colors.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No projects yet</Text>
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            Create a project to track a trip, event, or goal spending
          </Text>
          <TouchableOpacity
            style={[s.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={openCreate}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={s.emptyBtnText}>New Project</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const txs = transactions.filter((t) => t.projectId === item.id);
            const totalSpent = txs
              .filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer")
              .reduce((s, t) => s + t.amount, 0);
            return (
              <TouchableOpacity
                style={[s.projectRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.75}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/project-detail?id=${item.id}`);
                }}
                onLongPress={() => handleDelete(item.id, item.name)}
              >
                <View style={[s.projectIconWrap, { backgroundColor: item.color + "20" }]}>
                  <Feather name="folder" size={20} color={item.color} />
                </View>
                <View style={s.projectInfo}>
                  <Text style={[s.projectName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.description ? (
                    <Text style={[s.projectDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : (
                    <Text style={[s.projectDesc, { color: colors.mutedForeground }]}>
                      {txs.length} transaction{txs.length !== 1 ? "s" : ""}
                      {totalSpent > 0 ? ` · $${totalSpent.toFixed(2)}` : ""}
                    </Text>
                  )}
                </View>
                <View style={s.projectRight}>
                  {totalSpent > 0 && (
                    <Text style={[s.projectAmt, { color: colors.expense }]}>
                      ${totalSpent.toFixed(2)}
                    </Text>
                  )}
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            <TouchableOpacity
              style={[s.addMoreBtn, { borderColor: colors.primary }]}
              onPress={openCreate}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={16} color={colors.primary} />
              <Text style={[s.addMoreText, { color: colors.primary }]}>New Project</Text>
            </TouchableOpacity>
          }
        />
      )}

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

  listContent: { padding: 16, gap: 12 },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  projectIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  projectInfo: { flex: 1 },
  projectName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  projectDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  projectRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  projectAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },

  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addMoreText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

});
