import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { acceptPairingInvite, createPairingInvite } from "../api/client";
import { AppHeader, Card, IconBubble, PillButton, ScreenTitle } from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, spacing } from "../theme";
import type { PairingInvite, PairingStatus, User } from "../types";

type Props = {
  user: User;
  onLogout: () => void;
  onPairingChanged: (status: PairingStatus) => void;
};

export function PairingScreen({ user, onLogout, onPairingChanged }: Props) {
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createInvite = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setInvite(await createPairingInvite());
      setMessage("心动码已生成，等待对方加入。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建心动码失败");
    } finally {
      setBusy(false);
    }
  };

  const acceptInvite = async () => {
    if (!code.trim()) {
      setMessage("请输入对方的心动码");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      onPairingChanged(await acceptPairingInvite(code.trim().toUpperCase()));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "加入失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeScreen style={styles.screen}>
      <AppHeader
        left={
          <Pressable onPress={onLogout}>
            <Text style={styles.headerAction}>退出</Text>
          </Pressable>
        }
        title="配对"
      />

      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle
          subtitle={`你好，${user.display_name}。完成配对后，你们就可以共享实时位置。`}
          title="添加另一半"
        />

        <Card style={styles.codeCard}>
          <IconBubble icon="♥" size={48} tone="rose" />
          <Text style={styles.codeLabel}>我的心动码</Text>
          <Text selectable style={styles.codeText}>
            {invite?.code ?? "尚未生成"}
          </Text>
          <PillButton disabled={busy} label="生成心动码" onPress={createInvite} />
        </Card>

        <Card style={styles.joinCard}>
          <View>
            <Text style={styles.cardTitle}>输入对方的心动码</Text>
            <Text style={styles.cardSubtitle}>心动码 24 小时内有效。</Text>
          </View>
          <TextInput
            autoCapitalize="characters"
            onChangeText={setCode}
            placeholder="例如 LOVE2U"
            placeholderTextColor={colors.tertiaryText}
            style={styles.input}
            value={code}
          />
          <PillButton disabled={busy || !code.trim()} label="立即加入" onPress={acceptInvite} />
        </Card>

        {message ? <Text style={styles.status}>{message}</Text> : null}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  headerAction: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600"
  },
  content: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  codeCard: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg
  },
  codeLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  codeText: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "800"
  },
  joinCard: {
    gap: spacing.md
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    paddingHorizontal: spacing.md
  },
  status: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.sm
  }
});
