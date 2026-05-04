import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { acceptPairingInvite, createPairingInvite } from "../api/client";
import { AppHeader, Card, IconBubble, PillButton } from "../components/HeartlineUI";
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
      setMessage("正在等待另一半加入...");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建配对码失败");
    } finally {
      setBusy(false);
    }
  };

  const acceptInvite = async () => {
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

  const pairingCode = invite?.code ?? "LOVE2U";

  return (
    <SafeScreen style={styles.screen}>
      <AppHeader
        left={
          <Pressable onPress={onLogout} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
        }
      />

      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.title}>开启你们的距离</Text>
          <Text style={styles.subtitle}>邀请另一半加入，同步你们的每一个心跳</Text>
        </View>

        <Card style={styles.inviteCard}>
          <View style={styles.qrBox}>
            <View style={styles.fakeQr}>
              <Text style={styles.fakeQrText}>♡</Text>
            </View>
          </View>

          <View style={styles.codePanel}>
            <Text style={styles.codeLabel}>专属配对码</Text>
            <Text style={styles.code}>{pairingCode}</Text>
            <View style={styles.codeActions}>
              <PillButton label="复制" tone="ghost" style={styles.smallButton} />
              <PillButton label="分享" tone="primary" style={styles.smallButton} />
            </View>
          </View>

          <Text style={styles.waiting}>{message ?? `你好，${user.display_name}`}</Text>
        </Card>

        <Pressable onPress={createInvite} disabled={busy}>
          <Card style={styles.rowCard}>
            <IconBubble icon="⌁" tone="mint" />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>生成新的配对码</Text>
              <Text style={styles.rowSubtitle}>24 小时内有效</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Pressable>

        <Card style={styles.acceptCard}>
          <View style={styles.acceptHeader}>
            <IconBubble icon="⌗" tone="mint" />
            <Text style={styles.rowTitle}>输入另一半的码</Text>
          </View>
          <TextInput
            autoCapitalize="characters"
            onChangeText={setCode}
            placeholder="例如 LOVE2U"
            placeholderTextColor={colors.outline}
            style={styles.input}
            value={code}
          />
          <PillButton disabled={busy || !code.trim()} label="立即加入" onPress={acceptInvite} />
        </Card>

        <Card style={styles.tipCard}>
          <Text style={styles.tipTitle}>✦ 小贴士</Text>
          <Text style={styles.tipBody}>
            让你的另一半输入上面的代码，你们就能立即开始共享时刻。
          </Text>
        </Card>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer
  },
  backText: {
    color: colors.primaryStrong,
    fontSize: 22
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg
  },
  heading: {
    alignItems: "center",
    gap: spacing.sm
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.text,
    fontSize: 16,
    textAlign: "center"
  },
  inviteCard: {
    gap: spacing.lg,
    alignItems: "center"
  },
  qrBox: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
    backgroundColor: colors.surface
  },
  fakeQr: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 8,
    borderColor: colors.line,
    backgroundColor: colors.surfaceContainer
  },
  fakeQrText: {
    color: colors.primaryStrong,
    fontSize: 26,
    fontWeight: "900"
  },
  codePanel: {
    width: "100%",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    padding: spacing.lg
  },
  codeLabel: {
    color: colors.muted,
    fontWeight: "800"
  },
  code: {
    color: colors.primaryStrong,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0
  },
  codeActions: {
    flexDirection: "row",
    gap: spacing.md
  },
  smallButton: {
    minWidth: 130,
    minHeight: 46
  },
  waiting: {
    color: colors.secondary,
    fontSize: 16,
    fontWeight: "900"
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  rowText: {
    flex: 1
  },
  rowTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  rowSubtitle: {
    color: colors.muted,
    marginTop: 2
  },
  chevron: {
    color: colors.muted,
    fontSize: 24
  },
  acceptCard: {
    gap: spacing.md
  },
  acceptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  input: {
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: spacing.lg
  },
  tipCard: {
    borderColor: colors.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    gap: spacing.sm
  },
  tipTitle: {
    color: colors.primaryStrong,
    fontSize: 16,
    fontWeight: "900"
  },
  tipBody: {
    color: colors.primaryStrong,
    lineHeight: 22
  }
});
