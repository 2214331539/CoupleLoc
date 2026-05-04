import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import {
  approvePairingRequest,
  buildLocationWebSocketUrl,
  createPairingInvite,
  listIncomingPairingRequests,
  listOutgoingPairingRequests,
  rejectPairingRequest,
  sendChatMessage,
  submitPairingRequest,
  updateSharingSettings,
  type SharingSettingsUpdate,
} from "../api/client";
import {
  AppHeader,
  Card,
  IconBubble,
  ListRow,
  PillButton,
  ScreenTitle,
  Section,
  SegmentedControl,
  StatusPill,
} from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, spacing } from "../theme";
import type { PairingInvite, PairingRequest, PairingStatus, RealtimeEvent, SharingSettings, User } from "../types";

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
  subtitle: string;
}> = [
  { key: "always", label: "持续", subtitle: "前台和后台持续同步" },
  { key: "one_hour", label: "1 小时", subtitle: "临时共享，一小时后暂停" },
  { key: "foreground", label: "前台", subtitle: "打开 App 时同步" },
  { key: "paused", label: "暂停", subtitle: "停止上传位置" },
];

export function ProfileScreen({
  user,
  token,
  pairing,
  sharing,
  onPairingChanged,
  onSharingChanged,
  onLogout,
}: Props) {
  const [status, setStatus] = useState("设置已同步");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<PairingRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<PairingRequest[]>([]);
  const [pairCode, setPairCode] = useState("");

  const activeLabel = useMemo(() => {
    const match = modes.find((mode) => mode.key === sharing.mode);
    return sharing.enabled ? match?.label ?? "持续" : "暂停";
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

  const reloadPairingRequests = async () => {
    if (pairing.paired) {
      setIncomingRequests([]);
      setOutgoingRequests([]);
      return;
    }
    try {
      const [incoming, outgoing] = await Promise.all([
        listIncomingPairingRequests(),
        listOutgoingPairingRequests(),
      ]);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "配对申请加载失败");
    }
  };

  useEffect(() => {
    reloadPairingRequests();
  }, [pairing.paired]);

  useEffect(() => {
    if (pairing.paired) {
      return;
    }

    const socket = new WebSocket(buildLocationWebSocketUrl(token));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "pairing.request_created") {
          setIncomingRequests((items) => [
            payload.request,
            ...items.filter((item) => item.id !== payload.request.id),
          ]);
          setStatus(`${payload.request.requester.display_name} 发来了配对申请`);
        }
        if (payload.type === "pairing.request_resolved") {
          setIncomingRequests((items) => items.filter((item) => item.id !== payload.request.id));
          setOutgoingRequests((items) => items.filter((item) => item.id !== payload.request.id));
          if (payload.pairing?.paired) {
            onPairingChanged(payload.pairing);
            setStatus("配对成功，可以开始共享时刻了");
          } else if (payload.request.status === "rejected") {
            setStatus("对方拒绝了本次配对申请");
          }
        }
      } catch {
        setStatus("收到无法识别的配对消息");
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
  }, [onPairingChanged, pairing.paired, token]);

  const createInvite = async () => {
    setBusy(true);
    try {
      const next = await createPairingInvite();
      setInvite(next);
      setStatus("心动码已生成，等待对方加入");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "心动码生成失败");
    } finally {
      setBusy(false);
    }
  };

  const acceptInvite = async () => {
    if (!pairCode.trim()) {
      setStatus("请输入对方的心动码");
      return;
    }
    setBusy(true);
    try {
      const request = await submitPairingRequest(pairCode.trim().toUpperCase());
      setOutgoingRequests((items) => [
        request,
        ...items.filter((item) => item.id !== request.id),
      ]);
      setPairCode("");
      setStatus("配对申请已发送，等待对方同意");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "配对申请发送失败");
    } finally {
      setBusy(false);
    }
  };

  const approveRequest = async (requestId: string) => {
    setBusy(true);
    try {
      const next = await approvePairingRequest(requestId);
      setIncomingRequests((items) => items.filter((item) => item.id !== requestId));
      onPairingChanged(next);
      setStatus("配对成功，可以开始共享时刻了");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "同意配对失败");
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async (requestId: string) => {
    setBusy(true);
    try {
      await rejectPairingRequest(requestId);
      setIncomingRequests((items) => items.filter((item) => item.id !== requestId));
      setStatus("已拒绝本次配对申请");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "拒绝配对失败");
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
        body: "SOS：我需要帮助，请查看我的位置并联系我。"
      });
      setStatus("SOS 已发送给对方");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "SOS 发送失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeScreen style={styles.screen}>
      <AppHeader
        left={<IconBubble icon={user.display_name.slice(0, 1).toUpperCase()} size={38} />}
        subtitle={status}
        title="我的"
      />

      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle
          action={
            <StatusPill
              label={pairing.paired ? "已配对" : "未配对"}
              tone={pairing.paired ? "mint" : "warning"}
            />
          }
          subtitle={`${user.display_name} · ${user.phone_number ?? user.username}`}
          title="账户与共享"
        />

        {!pairing.paired ? (
          <PairingCard
            busy={busy}
            code={pairCode}
            incomingRequests={incomingRequests}
            invite={invite}
            outgoingRequests={outgoingRequests}
            onAccept={acceptInvite}
            onApprove={approveRequest}
            onChangeCode={setPairCode}
            onCreate={createInvite}
            onReject={rejectRequest}
          />
        ) : (
          <Card style={styles.partnerCard}>
            <IconBubble icon={pairing.partner?.display_name.slice(0, 1) ?? "♥"} tone="rose" />
            <View style={styles.flex}>
              <Text style={styles.partnerTitle}>{pairing.partner?.display_name}</Text>
              <Text style={styles.partnerSubtitle}>你们已经完成配对</Text>
            </View>
          </Card>
        )}

        <Section title="位置共享">
          <ListRow
            left={<IconBubble icon="⌖" />}
            right={<StatusPill label={activeLabel} tone={sharing.enabled ? "mint" : "plain"} />}
            subtitle="控制什么时候上传你的位置"
            title="共享模式"
          />
          <View style={styles.modeControl}>
            <SegmentedControl
              value={sharing.enabled ? sharing.mode : "paused"}
              options={modes.map((mode) => ({ value: mode.key, label: mode.label }))}
              onChange={(value) => updateSharing({ mode: value })}
            />
            <Text style={styles.modeDescription}>
              {modes.find((mode) => mode.key === (sharing.enabled ? sharing.mode : "paused"))?.subtitle}
            </Text>
          </View>
        </Section>

        <Section title="隐私">
          <ListRow
            left={<IconBubble icon="≈" tone="secondary" />}
            right={
              <View style={styles.precisionControl}>
                <SegmentedControl
                  value={sharing.precise_location ? "precise" : "blur"}
                  options={[
                    { value: "precise", label: "精确" },
                    { value: "blur", label: "模糊" },
                  ]}
                  onChange={(value) => updateSharing({ precise_location: value === "precise" })}
                />
              </View>
            }
            subtitle="模糊模式会降低对方看到的位置精度"
            title="位置精度"
          />
          <PreferenceRow
            icon="km"
            label="显示距离"
            value={sharing.share_distance}
            onValueChange={(value) => updateSharing({ share_distance: value })}
          />
          <PreferenceRow
            icon="%"
            label="共享电量"
            value={sharing.share_battery}
            onValueChange={(value) => updateSharing({ share_battery: value })}
          />
        </Section>

        <Section title="安全">
          <ListRow
            left={<IconBubble icon="⚙" tone="plain" />}
            onPress={() => Linking.openSettings()}
            subtitle="打开系统设置，检查定位、通知和后台权限"
            title="系统权限设置"
          />
          <ListRow
            left={<IconBubble icon="!" tone="danger" />}
            right={
              <Pressable disabled={busy} onPress={sendSos} style={styles.sosButton}>
                <Text style={styles.sosText}>发送</Text>
              </Pressable>
            }
            subtitle="向对方发送紧急状态消息"
            title="SOS"
          />
          <ListRow
            destructive
            left={<IconBubble icon="⏸" tone="plain" />}
            onPress={() => updateSharing({ enabled: false, mode: "paused" })}
            subtitle="立即停止前台和后台位置上传"
            title="停止所有共享"
          />
        </Section>

        <Section title="账户">
          <ListRow
            destructive
            left={<IconBubble icon="↩" tone="plain" />}
            onPress={() => {
              setStatus("正在退出登录");
              onLogout();
            }}
            title="退出登录"
          />
        </Section>
      </ScrollView>
    </SafeScreen>
  );
}

function PairingCard({
  invite,
  code,
  busy,
  incomingRequests,
  outgoingRequests,
  onCreate,
  onAccept,
  onApprove,
  onReject,
  onChangeCode,
}: {
  invite: PairingInvite | null;
  code: string;
  busy: boolean;
  incomingRequests: PairingRequest[];
  outgoingRequests: PairingRequest[];
  onCreate: () => void;
  onAccept: () => void;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onChangeCode: (value: string) => void;
}) {
  const latestOutgoing = outgoingRequests[0];
  return (
    <Card style={styles.pairingCard}>
      <View style={styles.pairHeader}>
        <IconBubble icon="♥" tone="rose" />
        <View style={styles.flex}>
          <Text style={styles.pairTitle}>添加另一半</Text>
          <Text style={styles.pairSubtitle}>生成心动码后等待对方申请，或输入对方发来的心动码发送申请。</Text>
        </View>
      </View>

      {incomingRequests.length ? (
        <View style={styles.requestList}>
          {incomingRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestText}>
                <Text style={styles.requestTitle}>{request.requester.display_name} 想与你配对</Text>
                <Text style={styles.requestSubtitle}>来自心动码 {request.invite_code}</Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable disabled={busy} onPress={() => onReject(request.id)} style={styles.rejectButton}>
                  <Text style={styles.rejectText}>拒绝</Text>
                </Pressable>
                <Pressable disabled={busy} onPress={() => onApprove(request.id)} style={styles.approveButton}>
                  <Text style={styles.approveText}>同意</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>我的心动码</Text>
        <Text selectable style={styles.codeText}>
          {invite?.code ?? "尚未生成"}
        </Text>
      </View>

      <PillButton disabled={busy} label="生成心动码" onPress={onCreate} />
      {latestOutgoing ? (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>已发送配对申请</Text>
          <Text style={styles.pendingSubtitle}>
            等待 {latestOutgoing.creator.display_name} 同意，心动码 {latestOutgoing.invite_code}
          </Text>
        </View>
      ) : null}
      <TextInput
        autoCapitalize="characters"
        onChangeText={onChangeCode}
        placeholder="输入对方心动码"
        placeholderTextColor={colors.tertiaryText}
        style={styles.codeInput}
        value={code}
      />
      <PillButton disabled={busy || !code.trim()} label="发送配对申请" onPress={onAccept} tone="ghost" />
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
    <ListRow
      left={<IconBubble icon={icon} tone="plain" />}
      right={
        <Switch
          onValueChange={onValueChange}
          thumbColor={colors.surface}
          trackColor={{ false: colors.fillStrong, true: colors.tertiary }}
          value={value}
        />
      }
      title={label}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  flex: {
    flex: 1
  },
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  partnerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  partnerSubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2
  },
  modeControl: {
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line
  },
  modeDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  precisionControl: {
    width: 132
  },
  sosButton: {
    minHeight: 34,
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md
  },
  sosText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "700"
  },
  pairingCard: {
    gap: spacing.md
  },
  pairHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  pairTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  pairSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2
  },
  codeBox: {
    alignItems: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.fill,
    padding: spacing.lg
  },
  codeLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  codeText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginTop: spacing.xs
  },
  requestList: {
    gap: spacing.sm
  },
  requestCard: {
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    padding: spacing.md
  },
  requestText: {
    gap: 3
  },
  requestTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  requestSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600"
  },
  requestActions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  rejectButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.surface
  },
  rejectText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "800"
  },
  approveButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.primary
  },
  approveText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "800"
  },
  pendingBox: {
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    padding: spacing.md
  },
  pendingTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  pendingSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  },
  codeInput: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center"
  }
});
