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
  onLogout: () => void;
  onPairingChanged: (status: PairingStatus) => void;
  onSharingChanged: (settings: SharingSettings) => void;
};

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "map", label: "Map", icon: "▱" },
  { key: "chat", label: "Chat", icon: "□" },
  { key: "calendar", label: "Calendar", icon: "▣" },
  { key: "profile", label: "Profile", icon: "♙" }
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
          <TrackerScreen {...props} />
        </View>

        {activeTab === "chat" ? (
          <View style={styles.tabPane}>
            <ChatScreen token={props.token} user={props.user} partner={props.pairing.partner} />
          </View>
        ) : null}
        {activeTab === "calendar" ? (
          <View style={styles.tabPane}>
            <CalendarScreen token={props.token} />
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

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabButton, active && styles.tabButtonActive]}
            >
              <Text style={[styles.tabIcon, active && styles.tabTextActive]}>{tab.icon}</Text>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
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
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    ...shadows.card
  },
  tabButton: {
    flex: 1,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    gap: 2
  },
  tabButtonActive: {
    backgroundColor: colors.surface
  },
  tabIcon: {
    color: colors.muted,
    fontSize: 26,
    fontWeight: "900"
  },
  tabText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0
  },
  tabTextActive: {
    color: colors.primaryStrong
  }
});
