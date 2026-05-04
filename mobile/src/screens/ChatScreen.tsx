import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { buildLocationWebSocketUrl, listChatMessages, sendChatMessage } from "../api/client";
import { AppHeader, Card, IconBubble, PillButton } from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, spacing } from "../theme";
import type { ChatMessage, Partner, RealtimeEvent, User } from "../types";

type Props = {
  user: User;
  partner: Partner | null;
  token: string;
};

const quickStatuses = [
  { key: "miss_you", label: "想你", tone: "ghost" as const },
  { key: "on_the_way", label: "在路上", tone: "secondary" as const },
  { key: "arrived_safe", label: "平安到家", tone: "mint" as const }
];

export function ChatScreen({ user, partner, token }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("正在加载消息");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    listChatMessages()
      .then((items) => {
        setMessages(items);
        setStatus("在线");
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : "消息加载失败"));
  }, []);

  useEffect(() => {
    const socket = new WebSocket(buildLocationWebSocketUrl(token));

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "chat.message_created") {
          setMessages((items) =>
            items.some((item) => item.id === payload.message.id)
              ? items
              : [...items, payload.message]
          );
          setStatus("收到新消息");
        }
        if (payload.type === "battery.low") {
          setStatus("另一半电量偏低");
        }
      } catch {
        setStatus("收到无法识别的实时消息");
      }
    };

    const keepAlive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send("ping");
      }
    }, 25_000);

    return () => {
      clearInterval(keepAlive);
      socket.close();
    };
  }, [token]);

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [messages]
  );

  const send = async (body = text.trim(), statusKey?: string) => {
    if (!body) {
      return;
    }
    setText("");
    try {
      const message = await sendChatMessage({
        message_type: statusKey ? "quick_status" : "text",
        body,
        status_key: statusKey ?? null
      });
      setMessages((items) => [...items, message]);
      setStatus("已发送");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "发送失败");
      if (!statusKey) {
        setText(body);
      }
    }
  };

  return (
    <SafeScreen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <AppHeader
          left={<IconBubble icon={(partner?.display_name ?? "?").slice(0, 1)} size={48} />}
          subtitle={status}
          title={partner?.display_name ?? "聊天"}
          right={<Text style={styles.menu}>⋮</Text>}
        />

        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          data={orderedMessages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>还没有消息</Text>
              <Text style={styles.emptyBody}>发送一个快捷状态，让另一半知道你在想什么。</Text>
            </Card>
          }
          renderItem={({ item }) => (
            <MessageBubble isMine={item.sender_user_id === user.id} message={item} />
          )}
        />

        <View style={styles.composerWrap}>
          <View style={styles.quickRow}>
            {quickStatuses.map((item) => (
              <PillButton
                key={item.key}
                label={item.label}
                onPress={() => send(item.label, item.key)}
                style={styles.quickButton}
                tone={item.tone}
              />
            ))}
          </View>

          <View style={styles.composer}>
            <Pressable style={styles.plusButton}>
              <Text style={styles.plusText}>＋</Text>
            </Pressable>
            <TextInput
              onChangeText={setText}
              placeholder={`给${partner?.display_name ?? "另一半"}留言...`}
              placeholderTextColor={colors.outline}
              style={styles.input}
              value={text}
            />
            <Pressable onPress={() => send()} style={styles.sendButton}>
              <Text style={styles.sendText}>▷</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

function MessageBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  if (message.status_key === "flight_update") {
    return (
      <Card style={styles.systemCard}>
        <IconBubble icon="✈" tone="secondary" />
        <View style={styles.systemText}>
          <Text style={styles.systemTitle}>航班更新</Text>
          <Text style={styles.systemBody}>{message.body}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Card>
    );
  }

  return (
    <View style={[styles.bubbleWrap, isMine ? styles.mineWrap : styles.partnerWrap]}>
      <View style={[styles.bubble, isMine ? styles.mineBubble : styles.partnerBubble]}>
        {message.message_type === "quick_status" ? (
          <Text style={styles.quickMeta}>快捷状态</Text>
        ) : null}
        <Text style={styles.messageText}>{message.body}</Text>
      </View>
      <Text style={styles.timeText}>
        {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  keyboard: {
    flex: 1
  },
  menu: {
    color: colors.muted,
    fontSize: 32,
    fontWeight: "900"
  },
  messageList: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center"
  },
  bubbleWrap: {
    gap: spacing.sm
  },
  mineWrap: {
    alignItems: "flex-end"
  },
  partnerWrap: {
    alignItems: "flex-start"
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  mineBubble: {
    borderTopRightRadius: radius.sm,
    backgroundColor: colors.primary
  },
  partnerBubble: {
    borderTopLeftRadius: radius.sm,
    backgroundColor: colors.secondarySoft
  },
  quickMeta: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: spacing.xs
  },
  messageText: {
    color: colors.textSoft,
    fontSize: 17,
    lineHeight: 26
  },
  timeText: {
    color: colors.muted,
    fontSize: 12
  },
  systemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderColor: colors.secondarySoft
  },
  systemText: {
    flex: 1
  },
  systemTitle: {
    color: colors.secondary,
    fontSize: 16,
    fontWeight: "900"
  },
  systemBody: {
    color: colors.muted,
    marginTop: 2
  },
  chevron: {
    color: colors.muted,
    fontSize: 30
  },
  composerWrap: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: spacing.lg,
    gap: spacing.md
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  quickButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  plusButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  plusText: {
    color: colors.muted,
    fontSize: 30
  },
  input: {
    flex: 1,
    minHeight: 58,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.lg
  },
  sendButton: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: colors.primary
  },
  sendText: {
    color: colors.primaryDark,
    fontSize: 28,
    fontWeight: "900"
  }
});
