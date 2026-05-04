import { Platform } from "react-native";
import { AMapSdk } from "react-native-amap3d";

import { env } from "../config/env";

let initialized = false;

export function initializeAmap() {
  if (initialized) {
    return null;
  }

  if (!env.amapAndroidApiKey) {
    return "Missing EXPO_PUBLIC_AMAP_ANDROID_API_KEY";
  }

  try {
    AMapSdk.init(
      Platform.select({
        android: env.amapAndroidApiKey,
        default: env.amapAndroidApiKey
      })
    );
    initialized = true;
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Failed to initialize AMap SDK";
  }
}
