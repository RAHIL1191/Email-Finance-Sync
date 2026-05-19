import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { type ChatMessage, useAIProvider } from "@/context/AIProviderContext";
import { useColors } from "@/hooks/useColors";

interface DisplayMessage extends ChatMessage {
  id: string;
  streaming?: boolean;
}

const SUGGESTIONS = [
  "Why is my spending high this month?",
  "How much did I spend on Food?",
  "Am I on track to save 20%?",
  "Which transactions should I review?",
];

export default function AIChatPanel() {
  const colors = useColors();
  const { sendMessage, buildFinancialContext, mode, modelStatus } = useAIProvider();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesRef = useRef<ScrollView>(null);
  const streamBufferRef = useRef("");

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const userText = (text || input).trim();
      if (!userText || isGenerating) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setInput("");
      setIsGenerating(true);
      streamBufferRef.current = "";

      const userMsg: DisplayMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: userText,
      };

      const assistantId = `a-${Date.now()}`;
      const assistantMsg: DisplayMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      scrollToBottom();

      const chatHistory: ChatMessage[] = [
        ...messages.map(({ role, content }) => ({ role, content })),
        { role: "user", content: userText },
      ];

      const ctx = buildFinancialContext();

      try {
        await sendMessage(chatHistory, ctx, (token) => {
          streamBufferRef.current += token;
          const captured = streamBufferRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: captured } : m
            )
          );
          scrollToBottom();
        });
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Sorry, something went wrong. Please try again.", streaming: false }
              : m
          )
        );
      } finally {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
        );
        setIsGenerating(false);
        scrollToBottom();
      }
    },
    [input, isGenerating, messages, sendMessage, buildFinancialContext, scrollToBottom]
  );

  const renderItem = useCallback(
    ({ item }: { item: DisplayMessage }) => {
      const isUser = item.role === "user";
      return (
        <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
          {!isUser && (
            <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
              <Feather name="cpu" size={13} color={colors.primary} />
            </View>
          )}
          <View
            style={[
              styles.bubble,
              isUser
                ? [styles.bubbleUser, { backgroundColor: colors.primary }]
                : [styles.bubbleAI, { backgroundColor: colors.card, borderColor: colors.border }],
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                { color: isUser ? "#fff" : colors.foreground },
              ]}
            >
              {item.content || (item.streaming ? "" : "…")}
            </Text>
            {item.streaming && item.content.length > 0 && (
              <View style={styles.cursorWrap}>
                <View style={[styles.cursor, { backgroundColor: colors.primary }]} />
              </View>
            )}
            {item.streaming && item.content.length === 0 && (
              <View style={styles.dotsWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
          </View>
        </View>
      );
    },
    [colors]
  );

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      {/* Header */}
      <View style={styles.panelHeader}>
        <Feather name="message-circle" size={14} color={colors.primary} />
        <Text style={[styles.panelTitle, { color: colors.foreground }]}>Ask Your AI</Text>
        {messages.length > 0 && (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMessages([]); }}
            hitSlop={8}
          >
            <Text style={[styles.clearBtn, { color: colors.mutedForeground }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestions (only when empty) */}
      {messages.length === 0 && (
        <View style={styles.suggestionsWrap}>
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.suggestion, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => handleSend(s)}
              activeOpacity={0.75}
            >
              <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <ScrollView
          ref={messagesRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          nestedScrollEnabled
        >
          {messages.map((item) => (
            <React.Fragment key={item.id}>{renderItem({ item })}</React.Fragment>
          ))}
        </ScrollView>
      )}

      {/* Local model loading notice */}
      {mode === "local" && modelStatus === "loading" && (
        <View style={[styles.localNotice, { backgroundColor: colors.muted }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            Loading on-device model…
          </Text>
        </View>
      )}

      {/* Input bar */}
      <View>
        <View style={[styles.inputRow, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground }]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your finances…"
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => handleSend(input)}
            returnKeyType="send"
            multiline={false}
            editable={!isGenerating}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: isGenerating || !input.trim() ? colors.muted : colors.primary },
            ]}
            onPress={() => handleSend(input)}
            disabled={isGenerating || !input.trim()}
            activeOpacity={0.8}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Feather name="send" size={16} color={input.trim() ? "#fff" : colors.mutedForeground} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, marginTop: 8 },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  panelTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  clearBtn: { fontSize: 13, fontFamily: "Inter_400Regular" },

  suggestionsWrap: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  suggestion: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  messageList: { maxHeight: 320 },
  messageContent: { padding: 12, gap: 10 },

  msgRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAI: { justifyContent: "flex-start" },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAI: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  cursorWrap: { marginTop: 4 },
  cursor: { width: 8, height: 2, borderRadius: 1 },
  dotsWrap: { paddingVertical: 4 },

  loadingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
  },
  loadingNoticeText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  localNotice: {
    alignItems: "center",
    paddingVertical: 6,
    marginHorizontal: 16,
    borderRadius: 8,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 42,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
