import { Image, Pressable, StyleSheet, Text, View, type PressableProps, type ViewProps } from "react-native";
import type { ReactNode } from "react";

import { colors, radius, shadows, spacing } from "../theme";

const logoSource = require("../../assets/stitch_sweet_trace_map/icon.png/screen.png");

export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <View style={[styles.logoWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={logoSource} style={styles.logoImage} />
    </View>
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.wordmarkRow}>
      {compact ? <LogoMark size={42} /> : null}
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>Heartline</Text>
    </View>
  );
}

export function AppHeader({
  title = "Heartline",
  subtitle,
  left,
  right,
}: {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left}</View>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.headerSide, styles.headerRight]}>{right ?? <Text style={styles.heart}>♡</Text>}</View>
    </View>
  );
}

export function Card({ style, children, ...props }: ViewProps) {
  return (
    <View {...props} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function PillButton({
  label,
  tone = "primary",
  style,
  textStyle,
  ...props
}: PressableProps & {
  label: string;
  tone?: "primary" | "secondary" | "ghost" | "danger" | "mint";
  textStyle?: object;
}) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.pillButton,
        tone === "secondary" && styles.pillSecondary,
        tone === "ghost" && styles.pillGhost,
        tone === "danger" && styles.pillDanger,
        tone === "mint" && styles.pillMint,
        pressed && styles.pressed,
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === "secondary" && styles.pillSecondaryText,
          tone === "ghost" && styles.pillGhostText,
          tone === "danger" && styles.pillDangerText,
          tone === "mint" && styles.pillMintText,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconBubble({
  icon,
  tone = "primary",
  size = 44,
}: {
  icon: string;
  tone?: "primary" | "secondary" | "mint" | "plain" | "danger";
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconBubble,
        { width: size, height: size, borderRadius: size / 2 },
        tone === "secondary" && styles.iconSecondary,
        tone === "mint" && styles.iconMint,
        tone === "plain" && styles.iconPlain,
        tone === "danger" && styles.iconDanger,
      ]}
    >
      <Text style={styles.iconText}>{icon}</Text>
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    overflow: "hidden",
    backgroundColor: colors.surfaceWarm,
    borderWidth: 3,
    borderColor: colors.primarySoft,
    ...shadows.soft
  },
  logoImage: {
    width: "100%",
    height: "100%"
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  wordmark: {
    color: colors.primary,
    fontSize: 42,
    fontWeight: "900",
    fontStyle: "italic"
  },
  wordmarkCompact: {
    fontSize: 28
  },
  header: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.md,
    ...shadows.card
  },
  headerSide: {
    width: 52,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  headerRight: {
    alignItems: "flex-end"
  },
  headerCenter: {
    flex: 1,
    alignItems: "center"
  },
  headerTitle: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "900",
    fontStyle: "italic"
  },
  headerSubtitle: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "700"
  },
  heart: {
    color: colors.primary,
    fontSize: 34,
    fontWeight: "700"
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(214,194,196,0.6)",
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: spacing.lg,
    ...shadows.card
  },
  pillButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    ...shadows.soft
  },
  pillSecondary: {
    backgroundColor: colors.secondarySoft
  },
  pillGhost: {
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface
  },
  pillDanger: {
    borderWidth: 1,
    borderColor: colors.dangerSoft,
    backgroundColor: "#fff7f7"
  },
  pillMint: {
    backgroundColor: colors.tertiarySoft
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  pillText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "900"
  },
  pillSecondaryText: {
    color: colors.secondary
  },
  pillGhostText: {
    color: colors.primaryStrong
  },
  pillDangerText: {
    color: colors.danger
  },
  pillMintText: {
    color: colors.tertiary
  },
  iconBubble: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft
  },
  iconSecondary: {
    backgroundColor: colors.secondarySoft
  },
  iconMint: {
    backgroundColor: colors.tertiarySoft
  },
  iconPlain: {
    backgroundColor: colors.surfaceContainer
  },
  iconDanger: {
    backgroundColor: colors.dangerSoft
  },
  iconText: {
    color: colors.primaryStrong,
    fontSize: 22,
    fontWeight: "900"
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    paddingLeft: spacing.md
  },
  empty: {
    gap: spacing.sm,
    alignItems: "center"
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center"
  }
});
