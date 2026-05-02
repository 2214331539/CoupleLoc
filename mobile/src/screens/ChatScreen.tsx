import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { buildLocationWebSocketUrl, listChatMessages, sendChatMessage } from "../api/client";
import type { ChatMessage, Partner, RealtimeEvent, User } from "../types";

type Props = {
  user: User;
  partner: Partner | null;
  token: string;
};

const quickStatuses = [
  { key: "on_the_way", label: "On my way" },
  { key: "arrived_safe", label: "Arrived safe" },
  { key: "miss_you", label: "Miss you" },
  { key: "busy_now", label: "Busy now" },
  { key: "need_call", label: "Need a call" }
];

export function ChatScreen({ user, partner, token }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Loading messages");

  useEffect(() => {
    listChatMessages()
      .then((items) => {
        setMessages(items);
        setStatus("Ready");
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : "Failed to load messages"));
  }, []);

  useEffect(() => {
    const socket = new WebSocket(buildLocationWebSocketUrl(token));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "chat.message_created") {
          setMessages((items) => [...items, payload.message]);
        }
        if (payload.type === "battery.low" && payload.location.user_id === partner?.id) {
          setStatus("Partner battery is low");
        }
      } catch {
        setStatus("Received an invalid realtime message");
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
  }, [partner?.id, token]);

  const appendLocalMessage = (message: ChatMessage) => {
    setMessages((items) => [...items, message]);
  };

  const sendText = async () => {
    const body = text.trim();
    if (!body) {
      return;
    }
    setText("");
    try {
      appendLocalMessage(await sendChatMessage({ message_type: "text", body }));
      setStatus("Sent");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  const sendQuickStatus = async (statusKey: string, label: string) => {
    try {
      appendLocalMessage(
        await sendChatMessage({
          message_type: "quick_status",
          status_key: statusKey,
          body: label
        })
      );
      setStatus("Sent");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to send quick status");
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.subtitle}>With {partner?.display_name ?? "partner"}</Text>
        </View>

        <View style={styles.quickRow}>
          {quickStatuses.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => sendQuickStatus(item.key, item.label)}
              style={styles.quickButton}
            >
              <Text style={styles.quickText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          contentContainerStyle={styles.messageList}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const mine = item.sender_user_id === user.id;
            return (
              <View style={[styles.messageBubble, mine ? styles.myBubble : styles.partnerBubble]}>
                <Text style={styles.messageMeta}>
                  {mine ? "Me" : partner?.display_name ?? "Partner"} -{" "}
                  {new Date(item.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </Text>
                <Text style={styles.messageText}>{item.body}</Text>
              </View>
            );
          }}
        />

        <Text style={styles.status}>{status}</Text>
        <View style={styles.composer}>
          <TextInput
            onChangeText={setText}
            placeholder="Type a message"
            style={styles.input}
            value={text}
          />
          <Pressable onPress={sendText} style={styles.sendButton}>
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f2"
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12
  },
  header: {
    gap: 4
  },
  title: {
    color: "#1f211d",
    fontSize: 28,
    fontWeight: "800"
  },
  subtitle: {
    color: "#62645d"
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f6f64",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  quickText: {
    color: "#2f6f64",
    fontWeight: "700"
  },
  messageList: {
    gap: 10,
    paddingVertical: 4
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 8,
    padding: 12,
    gap: 4
  },
  myBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#d8ece5"
  },
  partnerBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff"
  },
  messageMeta: {
    color: "#62645d",
    fontSize: 12
  },
  messageText: {
    color: "#1f211d",
    fontSize: 16
  },
  status: {
    color: "#62645d"
  },
  composer: {
    flexDirection: "row",
    gap: 8
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d7ca",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12
  },
  sendButton: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#2f6f64"
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  }
});
