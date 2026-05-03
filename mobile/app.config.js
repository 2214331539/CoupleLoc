module.exports = {
  expo: {
    name: "CoupleLoc",
    slug: "coupleloc",
    icon: "./assets/icon.png",
    version: "0.1.0",
    orientation: "portrait",
    scheme: "coupleloc",
    userInterfaceStyle: "light",
    android: {
      package: "com.coupleloc.app",
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "POST_NOTIFICATIONS"
      ]
    },
    plugins: [
      [
        "expo-location",
        {
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true
        }
      ],
      "expo-secure-store"
    ],
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      wsBaseUrl: process.env.EXPO_PUBLIC_WS_BASE_URL,
      amapAndroidApiKey:
        process.env.EXPO_PUBLIC_AMAP_ANDROID_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
      eas: {
        projectId: "d099e584-b02e-4bfc-86bc-8b57bbffe89b"
      }
    }
  }
};
