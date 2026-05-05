import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";

import { buildLocationWebSocketUrl, listChatMessages } from "../api/client";
import { CalendarScreen } from "./CalendarScreen";
import { ChatScreen } from "./ChatScreen";
import { ProfileScreen } from "./ProfileScreen";
import { TrackerScreen } from "./TrackerScreen";
import { colors, radius, shadows, spacing } from "../theme";
import type { PairingStatus, RealtimeEvent, SharingSettings, User } from "../types";

type TabKey = "map" | "chat" | "calendar" | "profile";

type Props = {
  user: User;
  token: string;
  pairing: PairingStatus;
  sharing: SharingSettings;
  suspended?: boolean;
  onLogout: () => void;
  onPairingChanged: (status: PairingStatus) => void;
  onSharingChanged: (settings: SharingSettings) => void;
};

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "map", label: "位置", icon: "⌖" },
  { key: "chat", label: "聊天", icon: "✉" },
  { key: "calendar", label: "日历", icon: "▦" },
  { key: "profile", label: "我的", icon: "◎" },
];

function chatReadKey(userId: string, partnerId: string) {
  return `coupleloc.chatLastRead.${userId}.${partnerId}`;
}

function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function MainScreen(props: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(props.pairing.paired ? "map" : "profile");
  const [chatMounted, setChatMounted] = useState(activeTab === "chat");
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const markChatRead = useCallback(async () => {
    const partnerId = props.pairing.partner?.id;
    if (!partnerId) {
      setUnreadChatCount(0);
      return;
    }

    setUnreadChatCount(0);
    await SecureStore.setItemAsync(
      chatReadKey(props.user.id, partnerId),
      new Date().toISOString()
    );
  }, [props.pairing.partner?.id, props.user.id]);

  const refreshUnreadCount = useCallback(async () => {
    const partnerId = props.pairing.partner?.id;
    if (!partnerId || activeTab === "chat") {
      setUnreadChatCount(0);
      return;
    }

    try {
      const lastReadAt = await SecureStore.getItemAsync(chatReadKey(props.user.id, partnerId));
      const messages = await listChatMessages(100);
      const nextUnread = messages.filter((message) => {
        if (message.sender_user_id !== partnerId) {
          return false;
        }
        return !lastReadAt || new Date(message.created_at) > new Date(lastReadAt);
      }).length;
      setUnreadChatCount(nextUnread);
    } catch {
      // Keep the current badge if the network is temporarily unavailable.
    }
  }, [activeTab, props.pairing.partner?.id, props.user.id]);

  const switchTab = (tab: TabKey) => {
    if (tab === "chat") {
      setChatMounted(true);
      void markChatRead();
    }
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!props.pairing.paired) {
      setActiveTab("profile");
      setUnreadChatCount(0);
    }
  }, [props.pairing.paired]);

  useEffect(() => {
    if (!props.pairing.paired) {
      return;
    }

    if (activeTab === "chat") {
      void markChatRead();
      return;
    }

    void refreshUnreadCount();
  }, [activeTab, markChatRead, props.pairing.paired, refreshUnreadCount]);

  useEffect(() => {
    if (props.suspended || !props.pairing.paired || activeTab === "chat") {
      return;
    }

    const timer = setInterval(() => {
      void refreshUnreadCount();
    }, 30_000);
    return () => clearInterval(timer);
  }, [activeTab, props.pairing.paired, props.suspended, refreshUnreadCount]);

  useEffect(() => {
    if (props.suspended) {
      return;
    }

    const socket = new WebSocket(buildLocationWebSocketUrl(props.token));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "pairing.request_resolved" && payload.pairing?.paired) {
          props.onPairingChanged(payload.pairing);
        }
        if (payload.type === "pairing.ended") {
          props.onPairingChanged(payload.pairing);
        }
        if (payload.type === "chat.message_created") {
          if (payload.message.sender_user_id !== props.user.id) {
            if (activeTab === "chat") {
              void markChatRead();
            } else {
              setUnreadChatCount((count) => Math.min(999, count + 1));
            }
          }
        }
      } catch {
        // Other screens own their detailed realtime handling.
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
  }, [activeTab, markChatRead, props.onPairingChanged, props.suspended, props.token, props.user.id]);

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View
          pointerEvents={activeTab === "map" ? "auto" : "none"}
          style={[styles.tabPane, activeTab !== "map" && styles.hiddenPane]}
        >
          <TrackerScreen {...props} suspended={props.suspended} />
        </View>

        {chatMounted ? (
          <View
            pointerEvents={activeTab === "chat" ? "auto" : "none"}
            style={[styles.tabPane, activeTab !== "chat" && styles.hiddenPane]}
          >
            <ChatScreen
              active={activeTab === "chat"}
              token={props.token}
              user={props.user}
              partner={props.pairing.partner}
            />
          </View>
        ) : null}
        {activeTab === "calendar" ? (
          <View style={styles.tabPane}>
            <CalendarScreen pairing={props.pairing} token={props.token} />
          </View>
        ) : null}
        {activeTab === "profile" ? (
          <View style={styles.tabPane}>
            <ProfileScreen
              onLogout={props.onLogout}
              onPairingChanged={props.onPairingChanged}
              onSharingChanged={props.onSharingChanged}
              pairing={props.pairing}
              sharing={props.sharing}
              token={props.token}
              user={props.user}
            />
          </View>
        ) : null}
      </View>

      {props.suspended ? null : (
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => switchTab(tab.key)}
                style={({ pressed }) => [
                  styles.tabButton,
                  active && styles.tabButtonActive,
                  pressed && styles.tabButtonPressed,
                ]}
              >
                <View style={styles.tabIconWrap}>
                  <Text style={[styles.tabIcon, active && styles.tabTextActive]}>{tab.icon}</Text>
                  {tab.key === "chat" && unreadChatCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {formatUnreadCount(unreadChatCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    flex: 1,
    position: "relative"
  },
  tabPane: {
    ...StyleSheet.absoluteFillObject
  },
  hiddenPane: {
    opacity: 0
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(248,248,248,0.94)",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    ...shadows.soft
  },
  tabButton: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    gap: 2
  },
  tabButtonActive: {
    backgroundColor: colors.surface
  },
  tabButtonPressed: {
    opacity: 0.72
  },
  tabIconWrap: {
    minWidth: 36,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  tabIcon: {
    color: colors.tertiaryText,
    fontSize: 20,
    fontWeight: "700"
  },
  tabText: {
    color: colors.tertiaryText,
    fontSize: 11,
    fontWeight: "600"
  },
  tabTextActive: {
    color: colors.primary
  },
  unreadBadge: {
    position: "absolute",
    top: -3,
    right: 2,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: colors.danger,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "rgba(248,248,248,0.94)"
  },
  unreadBadgeText: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: "800",
    includeFontPadding: false,
    textAlignVertical: "center"
  }
});
