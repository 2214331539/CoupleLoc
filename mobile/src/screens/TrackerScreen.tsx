import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { MapView, Marker } from "react-native-amap3d";

import {
  buildLocationWebSocketUrl,
  createMemoryPoint,
  fetchLocationState,
  listMemoryPoints,
  sendChatMessage,
  updateSharingSettings,
} from "../api/client";
import {
  AppHeader,
  Card,
  IconBubble,
  PillButton,
  StatTile,
  StatusPill,
} from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import {
  getPermissionSnapshot,
  requestLocationPermissions,
  startBackgroundLocation,
  startForegroundLocation,
  stopBackgroundLocation,
  type PermissionSnapshot,
} from "../services/location";
import { initializeAmap } from "../services/amap";
import { colors, radius, shadows, spacing } from "../theme";
import type {
  LocationSnapshot,
  MemoryPoint,
  PairingStatus,
  RealtimeEvent,
  SharingSettings,
  User,
} from "../types";
import { wgs84ToGcj02, type LatLng } from "../utils/coordinates";

type Props = {
  user: User;
  token: string;
  pairing: PairingStatus;
  sharing: SharingSettings;
  suspended?: boolean;
  onLogout: () => void;
  onSharingChanged: (settings: SharingSettings) => void;
};

type CameraPosition = {
  target: LatLng;
  zoom: number;
};

const quickStatuses = [
  { key: "on_the_way", label: "在路上" },
  { key: "miss_you", label: "想你了" },
  { key: "arrived_safe", label: "平安到达" },
];

function formatTime(value?: string) {
  if (!value) {
    return "暂无";
  }
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBattery(value?: number | null, isCharging?: boolean | null) {
  if (value === null || value === undefined) {
    return "未共享";
  }
  return `${Math.round(value * 100)}%${isCharging ? " · 充电中" : ""}`;
}

function toMapPoint(location: LocationSnapshot | MemoryPoint): LatLng {
  return wgs84ToGcj02({
    latitude: location.latitude,
    longitude: location.longitude
  });
}

function buildCameraPosition(
  myLocation: LocationSnapshot | null,
  partnerLocation: LocationSnapshot | null
): CameraPosition {
  const base = partnerLocation || myLocation;
  return {
    target: base ? toMapPoint(base) : { latitude: 31.2304, longitude: 121.4737 },
    zoom: 14
  };
}

function distanceKm(a: LocationSnapshot | null, b: LocationSnapshot | null) {
  if (!a || !b) {
    return null;
  }
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(value: number | null) {
  if (value === null) {
    return "已隐藏";
  }
  if (value < 1) {
    return "< 1 km";
  }
  return `${Math.round(value)} km`;
}

export function TrackerScreen({
  user,
  token,
  pairing,
  sharing,
  suspended = false,
  onSharingChanged,
}: Props) {
  const mapRef = useRef<any>(null);
  const [myLocation, setMyLocation] = useState<LocationSnapshot | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<LocationSnapshot | null>(null);
  const [partnerSharing, setPartnerSharing] = useState<SharingSettings | null>(null);
  const [memoryPoints, setMemoryPoints] = useState<MemoryPoint[]>([]);
  const [permission, setPermission] = useState<PermissionSnapshot | null>(null);
  const [amapReady, setAmapReady] = useState(false);
  const [status, setStatus] = useState<string>("准备同步位置");
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("closed");

  const partner = pairing.partner;
  const partnerVisible = partnerSharing?.enabled !== false;
  const visiblePartnerLocation = partnerVisible ? partnerLocation : null;
  const cameraPosition = useMemo(
    () => buildCameraPosition(myLocation, visiblePartnerLocation),
    [myLocation, visiblePartnerLocation]
  );
  const distance = sharing.share_distance
    ? distanceKm(myLocation, visiblePartnerLocation)
    : null;

  useEffect(() => {
    const error = initializeAmap();
    if (error) {
      setStatus(error);
      return;
    }
    setAmapReady(true);
  }, []);

  useEffect(() => {
    if (amapReady) {
      mapRef.current?.moveCamera(cameraPosition, 300);
    }
  }, [amapReady, cameraPosition]);

  useEffect(() => {
    if (suspended) {
      return;
    }

    async function loadLocationState() {
      try {
        const [state, points] = await Promise.all([fetchLocationState(), listMemoryPoints()]);
        onSharingChanged(state.my_sharing);
        setPartnerSharing(state.partner_sharing);
        setMyLocation(state.my_latest);
        setPartnerLocation(state.partner_latest);
        setMemoryPoints(points);
        setStatus("位置状态已同步");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "位置状态加载失败");
      }
    }

    loadLocationState();
  }, [onSharingChanged, suspended]);

  useEffect(() => {
    if (suspended) {
      setSocketState("closed");
      return;
    }

    const socket = new WebSocket(buildLocationWebSocketUrl(token));
    setSocketState("connecting");

    socket.onopen = () => setSocketState("open");
    socket.onclose = () => setSocketState("closed");
    socket.onerror = () => setSocketState("closed");
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "location.updated") {
          setPartnerLocation(payload.location);
          setStatus("对方刚刚更新了位置");
          return;
        }

        if (payload.type === "sharing.updated" && payload.user_id === partner?.id) {
          setPartnerSharing(payload.settings);
          if (!payload.settings.enabled) {
            setPartnerLocation(null);
            setStatus("对方暂停了位置共享");
          } else {
            setStatus("对方恢复了位置共享");
          }
        }
        if (payload.type === "memory.point_changed") {
          listMemoryPoints()
            .then(setMemoryPoints)
            .catch(() => setStatus("记忆点刷新失败"));
        }
        if (payload.type === "battery.low" && payload.location.user_id === partner?.id) {
          setStatus("对方电量偏低");
        }
      } catch {
        setStatus("收到了一条无法识别的实时消息");
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
  }, [partner?.id, suspended, token]);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    async function startTracking() {
      if (suspended) {
        setStatus("位置共享已暂停");
        setPermission(await getPermissionSnapshot());
        return;
      }

      if (!sharing.enabled || sharing.mode === "paused") {
        await stopBackgroundLocation().catch(() => undefined);
        setStatus("位置共享已暂停");
        setPermission(await getPermissionSnapshot());
        return;
      }

      setStatus("正在请求定位权限");
      const granted = await requestLocationPermissions();
      if (!granted) {
        setStatus("需要前台和后台定位权限");
        setPermission(await getPermissionSnapshot());
        return;
      }

      if (sharing.mode === "foreground") {
        await stopBackgroundLocation().catch(() => undefined);
      } else {
        await startBackgroundLocation();
      }
      if (cancelled) {
        return;
      }

      subscription = await startForegroundLocation(
        (location) => {
          setMyLocation(location);
          setStatus("我的位置已同步");
        },
        (message) => setStatus(message)
      );
      setPermission(await getPermissionSnapshot());
    }

    startTracking().catch((err) => {
      setStatus(err instanceof Error ? err.message : "位置共享启动失败");
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [sharing.enabled, sharing.mode, suspended]);

  const toggleSharing = async (enabled: boolean) => {
    setStatus(enabled ? "正在开启共享" : "正在暂停共享");
    try {
      onSharingChanged(await updateSharingSettings({ enabled, mode: enabled ? "always" : "paused" }));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "共享设置更新失败");
    }
  };

  const sendQuickStatus = async (key: string, body: string) => {
    if (!pairing.paired) {
      setStatus("请先在「我的」页面完成配对");
      return;
    }
    try {
      await sendChatMessage({ message_type: "quick_status", status_key: key, body });
      setStatus(`已发送：${body}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "快捷状态发送失败");
    }
  };

  const saveMemoryHere = async () => {
    if (!myLocation) {
      setStatus("还没有可保存的位置");
      return;
    }
    try {
      const created = await createMemoryPoint({
        title: `我们的记忆 ${new Date().toLocaleDateString()}`,
        note: status,
        latitude: myLocation.latitude,
        longitude: myLocation.longitude
      });
      setMemoryPoints((points) => [created, ...points]);
      setStatus("已添加地图记忆点");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "添加记忆点失败");
    }
  };

  const socketLabel = socketState === "open" ? "实时在线" : socketState === "connecting" ? "连接中" : "离线";

  return (
    <View style={styles.screen}>
      {amapReady ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialCameraPosition={cameraPosition}
          onLoad={() => mapRef.current?.moveCamera(cameraPosition, 100)}
        >
          {myLocation ? (
            <Marker onPress={() => setStatus("这是你的最新位置")} position={toMapPoint(myLocation)} />
          ) : null}
          {visiblePartnerLocation && partner ? (
            <Marker
              onPress={() => setStatus(`${partner.display_name} 的最新位置`)}
              position={toMapPoint(visiblePartnerLocation)}
            />
          ) : null}
          {memoryPoints.map((point) => (
            <Marker
              key={point.id}
              onPress={() => setStatus(point.note || point.title)}
              position={toMapPoint(point)}
            />
          ))}
        </MapView>
      ) : (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>地图正在启动</Text>
        </View>
      )}

      <SafeScreen style={styles.overlay}>
        <AppHeader
          left={<IconBubble icon={user.display_name.slice(0, 1).toUpperCase()} size={38} />}
          right={<StatusPill label={socketLabel} tone={socketState === "open" ? "mint" : "plain"} />}
          subtitle={status}
          title="实时位置"
        />

        <Card style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryLabel}>相距</Text>
              <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.partnerName}>{partner?.display_name ?? "未配对"}</Text>
              <Text style={styles.summaryMeta}>
                {visiblePartnerLocation ? `${formatTime(visiblePartnerLocation.received_at)} 更新` : "暂无位置"}
              </Text>
            </View>
          </View>
          <View style={styles.quickRow}>
            {quickStatuses.map((item, index) => (
              <PillButton
                key={item.key}
                label={item.label}
                onPress={() => sendQuickStatus(item.key, item.label)}
                style={styles.quickButton}
                tone={index === 0 ? "primary" : index === 1 ? "ghost" : "mint"}
              />
            ))}
          </View>
        </Card>

        <View style={styles.sideActions}>
          <Pressable onPress={() => Linking.openSettings()} style={styles.roundAction}>
            <Text style={styles.roundActionText}>⚙</Text>
          </Pressable>
          <Pressable onPress={saveMemoryHere} style={styles.roundAction}>
            <Text style={styles.roundActionText}>＋</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              sendQuickStatus("sos", "SOS：我需要帮助，请查看我的位置并联系我。")
            }
            style={[styles.roundAction, styles.sosAction]}
          >
            <Text style={styles.sosText}>SOS</Text>
          </Pressable>
        </View>

        <View style={styles.bottomPanel}>
          <Card style={styles.infoPanel}>
            <View style={styles.sharingRow}>
              <View>
                <Text style={styles.panelTitle}>我的共享</Text>
                <Text style={styles.panelSubtitle}>{sharing.enabled ? "正在共享位置" : "已暂停共享"}</Text>
              </View>
              <Switch
                onValueChange={toggleSharing}
                thumbColor={colors.surface}
                trackColor={{ false: colors.fillStrong, true: colors.tertiary }}
                value={sharing.enabled}
              />
            </View>

            <View style={styles.statGrid}>
              <StatTile label="我的更新时间" value={formatTime(myLocation?.received_at)} />
              <StatTile label="对方更新时间" value={formatTime(visiblePartnerLocation?.received_at)} />
              <StatTile
                label="我的电量"
                tone="primary"
                value={formatBattery(myLocation?.battery_level, myLocation?.is_charging)}
              />
              <StatTile
                label="对方电量"
                tone="mint"
                value={formatBattery(
                  visiblePartnerLocation?.battery_level,
                  visiblePartnerLocation?.is_charging
                )}
              />
              <StatTile
                label="后台定位"
                tone={permission?.backgroundTaskStarted ? "mint" : "plain"}
                value={permission?.backgroundTaskStarted ? "运行中" : "未运行"}
              />
              <StatTile label="记忆点" value={`${memoryPoints.length} 个`} />
            </View>
          </Card>
        </View>
      </SafeScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fill
  },
  mapFallbackText: {
    color: colors.muted,
    fontWeight: "700"
  },
  overlay: {
    flex: 1,
    pointerEvents: "box-none"
  },
  summaryCard: {
    margin: spacing.md,
    gap: spacing.md
  },
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  distanceText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800",
    marginTop: 2
  },
  summaryRight: {
    alignItems: "flex-end",
    justifyContent: "center"
  },
  partnerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  summaryMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2
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
  sideActions: {
    position: "absolute",
    right: spacing.md,
    bottom: 290,
    gap: spacing.sm
  },
  roundAction: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.96)",
    ...shadows.card
  },
  roundActionText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "800"
  },
  sosAction: {
    backgroundColor: colors.danger
  },
  sosText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "800"
  },
  bottomPanel: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md
  },
  infoPanel: {
    gap: spacing.md
  },
  sharingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  panelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  panelSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  }
});
