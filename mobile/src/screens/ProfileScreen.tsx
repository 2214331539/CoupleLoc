import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import {
  acceptPairingInvite,
  createPairingInvite,
  sendChatMessage,
  updateSharingSettings,
  type SharingSettingsUpdate,
} from "../api/client";
import { AppHeader, Card, IconBubble, PillButton } from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, spacing } from "../theme";
import type { PairingInvite, PairingStatus, SharingSettings, User } from "../types";

type Props = {
  user: User;
  token: string;
  pairing: PairingStatus;
  sharing: SharingSettings;
  onPairingChanged: (status: PairingStatus) => void;
  onSharingChanged: (settings: SharingSettings) => void;
  onLogout: () => void;
};

const modes: Array<{
  key: SharingSettings["mode"];
  label: string;
  icon: string;
  description: string;
}> = [
  { key: "always", label: "始终共享", icon: "∞", description: "前台和后台持续同步" },
  { key: "one_hour", label: "1 小时", icon: "1h", description: "临时开启，自动暂停" },
  { key: "foreground", label: "仅前台", icon: "FG", description: "打开 App 时同步" },
  { key: "paused", label: "暂停", icon: "II", description: "停止上传位置" }
];

export function ProfileScreen({
  user,
  pairing,
  sharing,
  onPairingChanged,
  onSharingChanged,
  onLogout,
}: Props) {
  const [status, setStatus] = useState("实时同步中");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [pairCode, setPairCode] = useState("");

  const activeLabel = useMemo(() => {
    const match = modes.find((mode) => mode.key === sharing.mode);
    return sharing.enabled ? match?.label ?? "始终共享" : "暂停";
  }, [sharing.enabled, sharing.mode]);

  const updateSharing = async (payload: SharingSettingsUpdate) => {
    setBusy(true);
    try {
      const next = await updateSharingSettings(payload);
      onSharingChanged(next);
      setStatus("共享设置已更新");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "共享设置更新失败");
    } finally {
      setBusy(false);
    }
  };

  const createInvite = async () => {
    setBusy(true);
    try {
      const next = await createPairingInvite();
      setInvite(next);
      setStatus("心动码已生成，等待另一半加入");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "心动码生成失败");
    } finally {
      setBusy(false);
    }
  };

  const acceptInvite = async () => {
    if (!pairCode.trim()) {
      setStatus("请输入另一半的心动码");
      return;
    }
    setBusy(true);
    try {
      const next = await acceptPairingInvite(pairCode.trim().toUpperCase());
      onPairingChanged(next);
      setStatus("配对成功，可以开始共享时刻了");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "配对失败");
    } finally {
      setBusy(false);
    }
  };

  const sendSos = async () => {
    if (!pairing.paired) {
      setStatus("请先和另一半完成配对");
      return;
    }
    setBusy(true);
    try {
      await sendChatMessage({
        message_type: "quick_status",
        status_key: "sos",
        body: "SOS：我需要帮助，请查看我的位置并联系我"
      });
      setStatus("SOS 已发送给另一半");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "SOS 发送失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeScreen style={styles.screen}>
      <AppHeader
        left={<IconBubble icon={user.display_name.slice(0, 1).toUpperCase()} size={48} />}
        subtitle={
          pairing.partner ? `和 ${pairing.partner.display_name} 的亲密空间` : "在这里添加另一半"
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>隐私与共享</Text>
          <Text style={styles.subtitle}>守护你与伴侣的亲密空间</Text>
        </View>

        {!pairing.paired ? (
          <PairingCard
            busy={busy}
            code={pairCode}
            invite={invite}
            onAccept={acceptInvite}
            onChangeCode={setPairCode}
            onCreate={createInvite}
          />
        ) : (
          <Card style={styles.partnerCard}>
            <IconBubble icon={pairing.partner?.display_name.slice(0, 1) ?? "♡"} />
            <View style={styles.flex}>
              <Text style={styles.partnerTitle}>{pairing.partner?.display_name}</Text>
              <Text style={styles.cardSubtitle}>你们已经完成配对</Text>
            </View>
            <Text style={styles.heart}>♡</Text>
          </Card>
        )}

        <View style={styles.statusRow}>
          <Text style={styles.sectionLabel}>共享状态</Text>
          <View style={styles.onlinePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{activeLabel}</Text>
          </View>
        </View>

        <View style={styles.modeGrid}>
          {modes.map((mode) => {
            const active =
              (sharing.enabled && sharing.mode === mode.key) ||
              (!sharing.enabled && mode.key === "paused");
            return (
              <Pressable
                disabled={busy}
                key={mode.key}
                onPress={() => updateSharing({ mode: mode.key })}
                style={[styles.modeCard, active && styles.modeCardActive]}
              >
                <Text style={styles.modeIcon}>{mode.icon}</Text>
                <Text style={styles.modeLabel}>{mode.label}</Text>
                <Text style={styles.modeDesc}>{mode.description}</Text>
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.privacyCard}>
          <View style={styles.cardTitleRow}>
            <IconBubble icon="⌖" tone="secondary" />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>位置精准度</Text>
              <Text style={styles.cardSubtitle}>模糊处理敏感区域</Text>
            </View>
            <View style={styles.segment}>
              <Pressable
                onPress={() => updateSharing({ precise_location: true })}
                style={[styles.segmentButton, sharing.precise_location && styles.segmentActive]}
              >
                <Text style={styles.segmentText}>精准</Text>
              </Pressable>
              <Pressable
                onPress={() => updateSharing({ precise_location: false })}
                style={[styles.segmentButton, !sharing.precise_location && styles.segmentActive]}
              >
                <Text style={styles.segmentText}>模糊</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.mapPreview}>
            <View style={styles.mapLineOne} />
            <View style={styles.mapLineTwo} />
            <View style={styles.blurCircle}>
              <IconBubble icon="⌂" size={56} />
            </View>
            <Text style={styles.mapCaption}>
              {sharing.precise_location ? "精准位置共享已开启" : "模糊位置共享已开启"}
            </Text>
          </View>
        </Card>

        <Text style={styles.sectionLabel}>共享偏好</Text>
        <Card style={styles.preferenceCard}>
          <PreferenceRow
            icon="⌕"
            label="共享距离差"
            value={sharing.share_distance}
            onValueChange={(value) => updateSharing({ share_distance: value })}
          />
          <View style={styles.divider} />
          <PreferenceRow
            icon="↯"
            label="共享电量状态"
            value={sharing.share_battery}
            onValueChange={(value) => updateSharing({ share_battery: value })}
          />
          <View style={styles.divider} />
          <View style={styles.preferenceRow}>
            <IconBubble icon="!" tone="danger" />
            <Text style={styles.preferenceText}>隐身模式计划</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Card>

        <Card style={styles.safetyCard}>
          <View style={styles.cardTitleRow}>
            <View style={styles.flex}>
              <Text style={styles.safetyTitle}>紧急安全</Text>
              <Text style={styles.cardSubtitle}>长按或点击发送 SOS 快捷状态</Text>
            </View>
            <Text style={styles.manageText}>管理联系人</Text>
          </View>
          <Pressable disabled={busy} onLongPress={sendSos} onPress={sendSos} style={styles.sosButton}>
            <Text style={styles.sosText}>SOS</Text>
          </Pressable>
          <Text style={styles.status}>{status}</Text>
        </Card>

        <PillButton
          label="停止所有共享"
          onPress={() => updateSharing({ enabled: false, mode: "paused" })}
          tone="danger"
        />
        <PillButton label="退出登录" onPress={onLogout} tone="ghost" />
      </ScrollView>
    </SafeScreen>
  );
}

function PairingCard({
  invite,
  code,
  busy,
  onCreate,
  onAccept,
  onChangeCode,
}: {
  invite: PairingInvite | null;
  code: string;
  busy: boolean;
  onCreate: () => void;
  onAccept: () => void;
  onChangeCode: (value: string) => void;
}) {
  return (
    <Card style={styles.pairingCard}>
      <View style={styles.cardTitleRow}>
        <IconBubble icon="♡" />
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>添加另一半</Text>
          <Text style={styles.cardSubtitle}>生成心动码或输入对方的心动码</Text>
        </View>
      </View>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>专属心动码</Text>
        <Text style={styles.codeText}>{invite?.code ?? "尚未生成"}</Text>
      </View>
      <View style={styles.pairActions}>
        <PillButton disabled={busy} label="生成心动码" onPress={onCreate} style={styles.pairButton} />
        <TextInput
          autoCapitalize="characters"
          onChangeText={onChangeCode}
          placeholder="输入对方心动码"
          placeholderTextColor={colors.outline}
          style={styles.codeInput}
          value={code}
        />
        <PillButton disabled={busy} label="立即配对" onPress={onAccept} style={styles.pairButton} tone="ghost" />
      </View>
    </Card>
  );
}

function PreferenceRow({
  icon,
  label,
  value,
  onValueChange,
}: {
  icon: string;
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <IconBubble icon={icon} tone="mint" />
      <Text style={styles.preferenceText}>{label}</Text>
      <Switch
        onValueChange={onValueChange}
        thumbColor={colors.surface}
        trackColor={{ false: colors.surfaceContainerHigh, true: colors.primary }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16
  },
  pairingCard: {
    gap: spacing.md
  },
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  partnerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  heart: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: "900"
  },
  codeBox: {
    alignItems: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    padding: spacing.lg
  },
  codeLabel: {
    color: colors.muted,
    fontWeight: "800"
  },
  codeText: {
    color: colors.primaryStrong,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0
  },
  pairActions: {
    gap: spacing.md
  },
  pairButton: {
    minHeight: 48
  },
  codeInput: {
    minHeight: 54,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    paddingHorizontal: spacing.lg
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionLabel: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "900"
  },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.tertiarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tertiary
  },
  onlineText: {
    color: colors.tertiary,
    fontWeight: "900"
  },
  modeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  modeCard: {
    width: "47.7%",
    minHeight: 124,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md
  },
  modeCardActive: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryStrong
  },
  modeIcon: {
    color: colors.primaryStrong,
    fontSize: 24,
    fontWeight: "900"
  },
  modeLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  modeDesc: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center"
  },
  privacyCard: {
    gap: spacing.md
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  flex: {
    flex: 1
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  cardSubtitle: {
    color: colors.muted,
    marginTop: 2
  },
  segment: {
    flexDirection: "row",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    padding: 4
  },
  segmentButton: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  segmentActive: {
    backgroundColor: colors.surface
  },
  segmentText: {
    color: colors.primaryStrong,
    fontWeight: "900"
  },
  mapPreview: {
    height: 180,
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer
  },
  mapLineOne: {
    position: "absolute",
    left: -20,
    top: 45,
    width: 360,
    height: 14,
    transform: [{ rotate: "-35deg" }],
    backgroundColor: "rgba(255,255,255,0.85)"
  },
  mapLineTwo: {
    position: "absolute",
    left: 120,
    top: -20,
    width: 18,
    height: 260,
    transform: [{ rotate: "42deg" }],
    backgroundColor: "rgba(255,255,255,0.78)"
  },
  blurCircle: {
    position: "absolute",
    left: "34%",
    top: "22%",
    width: 128,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 64,
    backgroundColor: "rgba(255,255,255,0.48)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)"
  },
  mapCaption: {
    position: "absolute",
    left: spacing.lg,
    bottom: spacing.md,
    color: colors.primary,
    fontWeight: "900"
  },
  preferenceCard: {
    padding: 0,
    overflow: "hidden"
  },
  preferenceRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  },
  preferenceText: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceContainer,
    marginLeft: 78
  },
  chevron: {
    color: colors.muted,
    fontSize: 24
  },
  safetyCard: {
    gap: spacing.lg,
    borderColor: colors.line,
    backgroundColor: "rgba(255,255,255,0.78)"
  },
  safetyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  manageText: {
    color: colors.primaryStrong,
    fontWeight: "900"
  },
  sosButton: {
    alignSelf: "center",
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 56,
    backgroundColor: colors.danger,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4
  },
  sosText: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: "900"
  },
  status: {
    color: colors.muted,
    textAlign: "center",
    fontWeight: "700"
  }
});
