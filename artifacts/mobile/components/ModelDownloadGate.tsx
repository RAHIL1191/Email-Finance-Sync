import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useAIProvider, MODEL_CONFIG } from "@/context/AIProviderContext";
import { useColors } from "@/hooks/useColors";

export default function ModelDownloadGate({ children }: { children: React.ReactNode }) {
  const {
    mode, modelPath, modelStatus, downloadProgress,
    downloadModel, cancelDownload,
  } = useAIProvider();
  const colors = useColors();

  // If in API mode or model already downloaded, just render children
  if (mode === "api" || modelPath) return <>{children}</>;

  // Downloading state
  if (modelStatus === "downloading") {
    const pct = Math.round(downloadProgress * 100);
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>
          Downloading {MODEL_CONFIG.name}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {pct}% of ~{(MODEL_CONFIG.sizeMB / 1024).toFixed(1)} GB
        </Text>
        <TouchableOpacity style={[styles.btn, { borderColor: colors.border }]} onPress={cancelDownload}>
          <Text style={{ color: colors.foreground }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading model into memory
  if (modelStatus === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Loading model...</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Preparing on-device AI
        </Text>
      </View>
    );
  }

  // Error state
  if (modelStatus === "error") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={36} color="#ef4444" />
        <Text style={[styles.title, { color: colors.foreground }]}>Download failed</Text>
        <TouchableOpacity style={[styles.btn, { borderColor: colors.primary }]} onPress={downloadModel}>
          <Text style={{ color: colors.primary }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Prompt to download
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Feather name="cpu" size={36} color={colors.primary} />
      <Text style={[styles.title, { color: colors.foreground }]}>
        On-Device AI
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
        Download {MODEL_CONFIG.name} (~{(MODEL_CONFIG.sizeMB / 1024).toFixed(1)} GB) to run AI
        completely on your device. Your data never leaves your phone.
      </Text>
      <TouchableOpacity
        style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
        onPress={downloadModel}
      >
        <Feather name="download" size={18} color="#fff" />
        <Text style={styles.downloadBtnText}>Download Model</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  progressBar: {
    width: "80%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  downloadBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
