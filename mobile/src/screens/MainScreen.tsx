import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CalendarScreen } from "./CalendarScreen";
import { ChatScreen } from "./ChatScreen";
import { ProfileScreen } from "./ProfileScreen";
import { TrackerScreen } from "./TrackerScreen";
import { colors, radius, shadows, spacing } from "../theme";
import type { PairingStatus, SharingSettings, User } from "../types";

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

export function MainScreen(props: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(props.pairing.paired ? "map" : "profile");

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View
          pointerEvents={activeTab === "map" ? "auto" : "none"}
          style={[styles.tabPane, activeTab !== "map" && styles.hiddenPane]}
        >
          <TrackerScreen {...props} suspended={props.suspended} />
        </View>

        {activeTab === "chat" ? (
          <View style={styles.tabPane}>
            <ChatScreen token={props.token} user={props.user} partner={props.pairing.partner} />
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
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [
                  styles.tabButton,
                  active && styles.tabButtonActive,
                  pressed && styles.tabButtonPressed,
                ]}
              >
                <Text style={[styles.tabIcon, active && styles.tabTextActive]}>{tab.icon}</Text>
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
  }
});
