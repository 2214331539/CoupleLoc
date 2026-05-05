import * as Battery from "expo-battery";
import * as Location from "expo-location";

import { postLocation } from "../api/client";
import type { LocationPayload } from "../types";

const LEGACY_BACKGROUND_LOCATION_TASK = "coupleloc-background-location";

export type PermissionSnapshot = {
  foreground: Location.PermissionStatus | "unknown";
  servicesEnabled: boolean;
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

export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  const [foreground, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.hasServicesEnabledAsync().catch(() => false)
  ]);

  return {
    foreground: foreground?.status ?? "unknown",
    servicesEnabled
  };
}

export async function stopBackgroundLocation() {
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
