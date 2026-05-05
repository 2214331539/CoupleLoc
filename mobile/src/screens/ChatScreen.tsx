import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
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
  { key: "miss_you", label: "想你了！！！", tone: "ghost" as const },
  { key: "on_the_way", label: "在路上~", tone: "secondary" as const },
  { key: "arrived_safe", label: "平安到达！", tone: "mint" as const },
];

const emojiPalette = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "😘",
  "🥰",
  "😎",
  "😋",
  "😭",
  "🥺",
  "😡",
  "😴",
  "🤔",
  "🤭",
  "👍",
  "👏",
  "🙏",
  "💪",
  "❤️",
  "💕",
  "💖",
  "💘",
  "🌹",
  "🎉",
  "✨",
  "🔥",
  "☀️",
  "🌙",
  "⭐",
  "🍰",
  "🍓",
  "☕",
  "🍜",
  "🎁",
];

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
}

export function ChatScreen({ user, partner, token, active }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("正在连接");
  const [listReady, setListReady] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const activeRef = useRef(active);
  const initialPositionedRef = useRef(false);
  const nearBottomRef = useRef(true);
  const pendingScrollToEndRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const queueScrollToLatest = useCallback(
    (animated = true) => {
      pendingScrollToEndRef.current = true;
      setTimeout(() => scrollToLatest(animated), 80);
    },
    [scrollToLatest]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
      setEmojiOpen(false);
      setComposerFocused(true);
      queueScrollToLatest(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setComposerFocused(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [queueScrollToLatest]);

  const positionInitialList = useCallback((itemCount: number) => {
    if (initialPositionedRef.current) {
      return;
    }

    initialPositionedRef.current = itemCount === 0;
    setListReady(itemCount === 0);
    if (itemCount) {
      setTimeout(() => {
        if (!initialPositionedRef.current) {
          initialPositionedRef.current = true;
          scrollToLatest(false);
          setListReady(true);
        }
      }, 250);
    }
  }, [scrollToLatest]);

  const reloadMessages = useCallback(
    async (quiet = false) => {
      if (!partner) {
        setMessages([]);
        initialPositionedRef.current = true;
        setListReady(true);
        setStatus("请先完成配对");
        return;
      }

      try {
        const items = await listChatMessages();
        setMessages((current) => mergeMessages(current, items));
        positionInitialList(items.length);
        if (!quiet) {
          setStatus("在线");
        }
      } catch (err) {
        setListReady(true);
        setStatus(err instanceof Error ? err.message : "消息加载失败");
      }
    },
    [partner, positionInitialList]
  );

  useEffect(() => {
    initialPositionedRef.current = false;
    setListReady(false);
    setMessages([]);
    reloadMessages();
  }, [reloadMessages]);

  useEffect(() => {
    if (active && partner) {
      reloadMessages(true);
      const timer = setInterval(() => {
        reloadMessages(true);
      }, 15_000);
      return () => clearInterval(timer);
    }
    return undefined;
  }, [active, partner, reloadMessages]);

  useEffect(() => {
    if (!partner) {
      return undefined;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let reconnectDelay = 2_000;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(10_000, Math.round(reconnectDelay * 1.5));
    };

    const connect = () => {
      if (closed) {
        return;
      }

      socket = new WebSocket(buildLocationWebSocketUrl(token));
      setStatus((value) => (value === "在线" ? "正在连接实时消息" : value));

      socket.onopen = () => {
        reconnectDelay = 2_000;
        setStatus("实时在线");
        reloadMessages(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as RealtimeEvent;
          if (payload.type === "chat.message_created") {
            setMessages((items) => {
              if (activeRef.current && nearBottomRef.current) {
                queueScrollToLatest(true);
              }
              return mergeMessages(items, [payload.message]);
            });
            setStatus(payload.message.sender_user_id === user.id ? "消息已同步" : "刚收到新消息");
          }
          if (payload.type === "battery.low") {
            setStatus("对方电量偏低");
          }
        } catch {
          setStatus("收到一条无法识别的实时消息");
        }
      };

      socket.onclose = () => {
        if (!closed) {
          setStatus("实时连接已断开，正在重连");
          reloadMessages(true);
          scheduleReconnect();
        }
      };
      socket.onerror = () => {
        setStatus("实时连接异常，正在重连");
      };
    };

    connect();

    const keepAlive = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send("ping");
      }
    }, 25_000);

    return () => {
      closed = true;
      clearInterval(keepAlive);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [partner, queueScrollToLatest, reloadMessages, token, user.id]);

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [messages]
  );

  const handleContentSizeChange = () => {
    if (!initialPositionedRef.current && orderedMessages.length) {
      initialPositionedRef.current = true;
      requestAnimationFrame(() => {
        scrollToLatest(false);
        setListReady(true);
      });
      return;
    }

    if (pendingScrollToEndRef.current) {
      pendingScrollToEndRef.current = false;
      scrollToLatest(activeRef.current);
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
    setEmojiOpen(false);
    try {
      const message = await sendChatMessage({
        message_type: statusKey ? "quick_status" : "text",
        body,
        status_key: statusKey ?? null
      });
      queueScrollToLatest(true);
      setMessages((items) => mergeMessages(items, [message]));
      setStatus("已发送");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "发送失败");
      if (!statusKey) {
        setText(body);
      }
    }
  };

  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
      return;
    }

    Keyboard.dismiss();
    setEmojiOpen(true);
    queueScrollToLatest(true);
  };

  const insertEmoji = (emoji: string) => {
    setText((value) => `${value}${emoji}`);
    queueScrollToLatest(false);
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

        <View style={[styles.composerWrap, (composerFocused || emojiOpen) && styles.composerActive]}>
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
            <Pressable
              accessibilityLabel="打开表情"
              onPress={toggleEmoji}
              style={[styles.toolButton, emojiOpen && styles.toolButtonActive]}
            >
              <Text style={[styles.toolButtonText, emojiOpen && styles.toolButtonTextActive]}>
                ☺
              </Text>
            </Pressable>
            <TextInput
              ref={inputRef}
              multiline
              maxLength={500}
              onChangeText={setText}
              onFocus={() => {
                setEmojiOpen(false);
                setComposerFocused(true);
                queueScrollToLatest(true);
              }}
              onBlur={() => setComposerFocused(false)}
              placeholder={`给${partner?.display_name ?? "对方"}留言...`}
              placeholderTextColor={colors.tertiaryText}
              style={styles.input}
              value={text}
            />
            <Pressable disabled={!text.trim()} onPress={() => send()} style={styles.sendButton}>
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          </View>

          {emojiOpen ? (
            <View style={styles.emojiPanel}>
              {emojiPalette.map((emoji) => (
                <Pressable key={emoji} onPress={() => insertEmoji(emoji)} style={styles.emojiButton}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
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
    flexGrow: 1,
    justifyContent: "flex-end",
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
  composerActive: {
    backgroundColor: colors.background
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
    alignItems: "flex-end",
    gap: spacing.sm
  },
  toolButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.surface
  },
  toolButtonActive: {
    backgroundColor: colors.primarySoft
  },
  toolButtonText: {
    color: colors.textSoft,
    fontSize: 24,
    fontWeight: "700"
  },
  toolButtonTextActive: {
    color: colors.primary
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 104,
    borderRadius: 22,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 11 : 7,
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
  },
  emojiPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  emojiButton: {
    width: "14.5%",
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  emojiText: {
    fontSize: 24
  }
});
