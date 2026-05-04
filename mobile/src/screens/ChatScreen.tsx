import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { buildLocationWebSocketUrl, listChatMessages, sendChatMessage } from "../api/client";
import { AppHeader, EmptyState, IconBubble, PillButton } from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, shadows, spacing } from "../theme";
import type { ChatMessage, Partner, RealtimeEvent, User } from "../types";

type Props = {
  user: User;
  partner: Partner | null;
  token: string;
  active: boolean;
};

const quickStatuses = [
  { key: "miss_you", label: "想你了", tone: "ghost" as const },
  { key: "on_the_way", label: "在路上", tone: "secondary" as const },
  { key: "arrived_safe", label: "平安到达", tone: "mint" as const },
];

export function ChatScreen({ user, partner, token, active }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("正在连接");
  const [listReady, setListReady] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const activeRef = useRef(active);
  const initialPositionedRef = useRef(false);
  const nearBottomRef = useRef(true);
  const pendingScrollToEndRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    listChatMessages()
      .then((items) => {
        setMessages(items);
        initialPositionedRef.current = items.length === 0;
        setListReady(items.length === 0);
        if (items.length) {
          setTimeout(() => {
            if (!initialPositionedRef.current) {
              initialPositionedRef.current = true;
              listRef.current?.scrollToEnd({ animated: false });
              setListReady(true);
            }
          }, 250);
        }
        setStatus("在线");
      })
      .catch((err) => {
        setListReady(true);
        setStatus(err instanceof Error ? err.message : "消息加载失败");
      });
  }, []);

  useEffect(() => {
    const socket = new WebSocket(buildLocationWebSocketUrl(token));

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "chat.message_created") {
          setMessages((items) => {
            if (items.some((item) => item.id === payload.message.id)) {
              return items;
            }
            if (activeRef.current && nearBottomRef.current) {
              pendingScrollToEndRef.current = true;
            }
            return [...items, payload.message];
          });
          setStatus("刚收到新消息");
        }
        if (payload.type === "battery.low") {
          setStatus("对方电量偏低");
        }
      } catch {
        setStatus("收到一条无法识别的实时消息");
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

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [messages]
  );

  const handleContentSizeChange = () => {
    if (!initialPositionedRef.current && orderedMessages.length) {
      initialPositionedRef.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
        setListReady(true);
      });
      return;
    }

    if (pendingScrollToEndRef.current) {
      pendingScrollToEndRef.current = false;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: activeRef.current });
      });
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottomRef.current =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 96;
  };

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
      pendingScrollToEndRef.current = true;
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <AppHeader
          left={<IconBubble icon={(partner?.display_name ?? "?").slice(0, 1)} size={38} />}
          right={<Text style={styles.more}>•••</Text>}
          subtitle={status}
          title={partner?.display_name ?? "聊天"}
        />

        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          data={orderedMessages}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState title="还没有消息" body="发一个快捷状态，让对方知道你正在做什么。" />
          }
          renderItem={({ item }) => (
            <MessageBubble isMine={item.sender_user_id === user.id} message={item} />
          )}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={!listReady && styles.messageListHidden}
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
            <TextInput
              onChangeText={setText}
              placeholder={`给${partner?.display_name ?? "对方"}留言...`}
              placeholderTextColor={colors.tertiaryText}
              style={styles.input}
              value={text}
            />
            <Pressable disabled={!text.trim()} onPress={() => send()} style={styles.sendButton}>
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

function MessageBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  return (
    <View style={[styles.bubbleWrap, isMine ? styles.mineWrap : styles.partnerWrap]}>
      <View style={[styles.bubble, isMine ? styles.mineBubble : styles.partnerBubble]}>
        {message.message_type === "quick_status" ? (
          <Text style={[styles.quickMeta, isMine && styles.mineQuickMeta]}>快捷状态</Text>
        ) : null}
        <Text style={[styles.messageText, isMine && styles.mineMessageText]}>{message.body}</Text>
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
  more: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "700"
  },
  messageList: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl
  },
  messageListHidden: {
    opacity: 0
  },
  bubbleWrap: {
    gap: spacing.xs
  },
  mineWrap: {
    alignItems: "flex-end"
  },
  partnerWrap: {
    alignItems: "flex-start"
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  mineBubble: {
    borderBottomRightRadius: 6,
    backgroundColor: colors.primary
  },
  partnerBubble: {
    borderBottomLeftRadius: 6,
    backgroundColor: colors.surface,
    ...shadows.soft
  },
  quickMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2
  },
  mineQuickMeta: {
    color: "rgba(255,255,255,0.78)"
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23
  },
  mineMessageText: {
    color: colors.surface
  },
  timeText: {
    color: colors.tertiaryText,
    fontSize: 11,
    paddingHorizontal: spacing.sm
  },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(248,248,248,0.94)",
    padding: spacing.md,
    gap: spacing.md
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  quickButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center"
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.primary
  },
  sendText: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: "800"
  }
});
