export const colors = {
  background: "#fef8fa",
  surface: "#ffffff",
  surfaceWarm: "#fff0f3",
  surfaceCool: "#eef7ff",
  surfaceContainer: "#f8f2f4",
  surfaceContainerHigh: "#ece7e9",
  text: "#1d1b1d",
  textSoft: "#4a4e69",
  muted: "#847376",
  line: "#e7d5d8",
  outline: "#d6c2c4",
  primary: "#ff8fab",
  primaryStrong: "#874d5b",
  primaryDark: "#6c3644",
  primarySoft: "#ffd9e0",
  secondary: "#42617d",
  secondarySoft: "#cde5ff",
  tertiary: "#49654c",
  tertiarySoft: "#cbebca",
  lavender: "#b9a7dc",
  danger: "#ba1a1a",
  dangerSoft: "#ffdad6",
  shadow: "#f2b8c6"
};

export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  xl: 42,
  full: 999
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40
};

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 4
  },
  soft: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 3
  }
};
