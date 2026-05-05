import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { NativeModules, PermissionsAndroid, Platform } from "react-native";

import { env } from "../config/env";
import { postLocation } from "../api/client";
import type { LocationPayload } from "../types";

const LEGACY_BACKGROUND_LOCATION_TASK = "coupleloc-background-location";
const BACKGROUND_LOCATION_INTERVAL_MS = 60_000;
const POST_NOTIFICATIONS_PERMISSION = "android.permission.POST_NOTIFICATIONS";

type BackgroundLocationStatus = {
  configured: boolean;
  running: boolean;
};

type AmapBackgroundLocationNativeModule = {
  start: (options: {
    token: string;
    apiBaseUrl: string;
    amapAndroidApiKey: string;
    intervalMs: number;
  }) => Promise<BackgroundLocationStatus>;
  stop: () => Promise<BackgroundLocationStatus>;
  getStatus: () => Promise<BackgroundLocationStatus>;
};

const { AmapBackgroundLocation } = NativeModules as {
  AmapBackgroundLocation?: AmapBackgroundLocationNativeModule;
};

export type PermissionSnapshot = {
  foreground: Location.PermissionStatus | "unknown";
  background: Location.PermissionStatus | "unknown";
  servicesEnabled: boolean;
  backgroundServiceRunning: boolean;
};

export type DeviceLocation = {
  timestamp?: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
  };
};

async function readBattery() {
  try {
    const [batteryLevel, batteryState] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync()
    ]);
    return {
      battery_level: batteryLevel >= 0 ? batteryLevel : null,
      is_charging:
        batteryState === Battery.BatteryState.CHARGING ||
        batteryState === Battery.BatteryState.FULL
    };
  } catch {
    return {
      battery_level: null,
      is_charging: null
    };
  }
}

async function toPayload(
  location: DeviceLocation,
  source: LocationPayload["source"]
): Promise<LocationPayload> {
  const battery = await readBattery();
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? null,
    speed: location.coords.speed ?? null,
    heading: location.coords.heading ?? null,
    source,
    recorded_at: new Date(location.timestamp ?? Date.now()).toISOString(),
    ...battery
  };
}

export async function uploadDeviceLocation(
  location: DeviceLocation,
  source: LocationPayload["source"]
) {
  const payload = await toPayload(location, source);
  return postLocation(payload);
}

export async function requestForegroundLocationPermission() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  return foreground.status === Location.PermissionStatus.GRANTED;
}

export async function requestBackgroundLocationPermission() {
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === Location.PermissionStatus.GRANTED;
}

async function requestNotificationPermission() {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) {
    return true;
  }

  const granted = await PermissionsAndroid.check(POST_NOTIFICATIONS_PERMISSION as never);
  if (granted) {
    return true;
  }

  const result = await PermissionsAndroid.request(POST_NOTIFICATIONS_PERMISSION as never);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getBackgroundLocationStatus(): Promise<BackgroundLocationStatus> {
  if (Platform.OS !== "android" || !AmapBackgroundLocation) {
    return { configured: false, running: false };
  }

  return AmapBackgroundLocation.getStatus().catch(() => ({ configured: false, running: false }));
}

export async function startBackgroundLocation(token: string) {
  if (Platform.OS !== "android") {
    throw new Error("后台定位目前仅支持 Android");
  }
  if (!AmapBackgroundLocation) {
    throw new Error("高德后台定位原生模块不可用，请重新构建 Android App");
  }
  if (!env.amapAndroidApiKey) {
    throw new Error("Missing EXPO_PUBLIC_AMAP_ANDROID_API_KEY");
  }

  await requestNotificationPermission().catch(() => false);
  return AmapBackgroundLocation.start({
    token,
    apiBaseUrl: env.apiBaseUrl,
    amapAndroidApiKey: env.amapAndroidApiKey,
    intervalMs: BACKGROUND_LOCATION_INTERVAL_MS
  });
}

export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  const [foreground, background, servicesEnabled, backgroundStatus] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
    Location.hasServicesEnabledAsync().catch(() => false),
    getBackgroundLocationStatus()
  ]);

  return {
    foreground: foreground?.status ?? "unknown",
    background: background?.status ?? "unknown",
    servicesEnabled,
    backgroundServiceRunning: backgroundStatus.running
  };
}

export async function stopBackgroundLocation() {
  if (Platform.OS === "android" && AmapBackgroundLocation) {
    await AmapBackgroundLocation.stop().catch((err) => {
      console.warn("Stop AMap background location failed", err);
    });
  }

  let started = false;
  try {
    started = await Location.hasStartedLocationUpdatesAsync(LEGACY_BACKGROUND_LOCATION_TASK);
  } catch (err) {
    console.warn("Check legacy background location status failed", err);
    return;
  }

  if (!started) {
    return;
  }

  try {
    await Location.stopLocationUpdatesAsync(LEGACY_BACKGROUND_LOCATION_TASK);
  } catch (err) {
    console.warn("Stop legacy background location failed", err);
  }
}
