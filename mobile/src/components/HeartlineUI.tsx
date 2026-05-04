import type { ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";

import { colors, radius, shadows, spacing } from "../theme";

const logoSource = require("../../assets/stitch_sweet_trace_map/icon.png/screen.png");

export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <View style={[styles.logoWrap, { width: size, height: size, borderRadius: size * 0.24 }]}>
      <Image source={logoSource} style={styles.logoImage} />
    </View>
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.wordmarkRow}>
      {compact ? <LogoMark size={36} /> : null}
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
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}

export function ScreenTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.screenTitleRow}>
      <View style={styles.screenTitleText}>
        <Text style={styles.largeTitle}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
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

export function Section({
  title,
  footer,
  children,
  style,
}: ViewProps & {
  title?: string;
  footer?: string;
}) {
  return (
    <View style={style}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  destructive = false,
  onPress,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  destructive?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      {left}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.destructiveText]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
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
        props.disabled && styles.disabled,
        pressed && !props.disabled && styles.pressed,
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === "ghost" && styles.pillGhostText,
          tone === "danger" && styles.pillDangerText,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segmentButton, active && styles.segmentButtonActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconBubble({
  icon,
  tone = "primary",
  size = 36,
}: {
  icon: string;
  tone?: "primary" | "secondary" | "mint" | "plain" | "danger" | "warning" | "rose";
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconBubble,
        { width: size, height: size, borderRadius: size * 0.28 },
        tone === "secondary" && styles.iconSecondary,
        tone === "mint" && styles.iconMint,
        tone === "plain" && styles.iconPlain,
        tone === "danger" && styles.iconDanger,
        tone === "warning" && styles.iconWarning,
        tone === "rose" && styles.iconRose,
      ]}
    >
      <Text style={[styles.iconText, tone === "primary" && styles.iconPrimaryText]}>{icon}</Text>
    </View>
  );
}

export function StatusPill({
  label,
  tone = "primary",
}: {
  label: string;
  tone?: "primary" | "mint" | "danger" | "warning" | "plain";
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === "mint" && styles.statusMint,
        tone === "danger" && styles.statusDanger,
        tone === "warning" && styles.statusWarning,
        tone === "plain" && styles.statusPlain,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          tone === "mint" && styles.statusDotMint,
          tone === "danger" && styles.statusDotDanger,
          tone === "warning" && styles.statusDotWarning,
          tone === "plain" && styles.statusDotPlain,
        ]}
      />
      <Text style={styles.statusText}>{label}</Text>
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

export function StatTile({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "primary" | "mint" | "warning" | "danger";
}) {
  return (
    <View
      style={[
        styles.statTile,
        tone === "primary" && styles.statPrimary,
        tone === "mint" && styles.statMint,
        tone === "warning" && styles.statWarning,
        tone === "danger" && styles.statDanger,
      ]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.soft
  },
  logoImage: {
    width: "100%",
    height: "100%"
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  wordmark: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800"
  },
  wordmarkCompact: {
    fontSize: 22
  },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(248,248,248,0.94)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  headerSide: {
    width: 54,
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
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1
  },
  screenTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md
  },
  screenTitleText: {
    flex: 1
  },
  largeTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadows.soft
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    textTransform: "uppercase"
  },
  group: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  sectionFooter: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line
  },
  rowPressed: {
    backgroundColor: colors.fill
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  destructiveText: {
    color: colors.danger
  },
  pillButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg
  },
  pillSecondary: {
    backgroundColor: colors.secondary
  },
  pillGhost: {
    backgroundColor: colors.fill
  },
  pillDanger: {
    backgroundColor: colors.dangerSoft
  },
  pillMint: {
    backgroundColor: colors.tertiary
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.72
  },
  pillText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700"
  },
  pillGhostText: {
    color: colors.primary
  },
  pillDangerText: {
    color: colors.danger
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.md,
    backgroundColor: colors.fillStrong,
    padding: 2
  },
  segmentButton: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
    ...shadows.soft
  },
  segmentText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "600"
  },
  segmentTextActive: {
    color: colors.text
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
    backgroundColor: colors.fill
  },
  iconDanger: {
    backgroundColor: colors.dangerSoft
  },
  iconWarning: {
    backgroundColor: colors.warningSoft
  },
  iconRose: {
    backgroundColor: colors.roseSoft
  },
  iconText: {
    color: colors.textSoft,
    fontSize: 16,
    fontWeight: "800"
  },
  iconPrimaryText: {
    color: colors.primary
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  statusMint: {
    backgroundColor: colors.tertiarySoft
  },
  statusDanger: {
    backgroundColor: colors.dangerSoft
  },
  statusWarning: {
    backgroundColor: colors.warningSoft
  },
  statusPlain: {
    backgroundColor: colors.fill
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary
  },
  statusDotMint: {
    backgroundColor: colors.tertiary
  },
  statusDotDanger: {
    backgroundColor: colors.danger
  },
  statusDotWarning: {
    backgroundColor: colors.warning
  },
  statusDotPlain: {
    backgroundColor: colors.muted
  },
  statusText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700"
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: spacing.xs,
    paddingHorizontal: 2
  },
  empty: {
    gap: spacing.sm,
    alignItems: "center"
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20
  },
  statTile: {
    flex: 1,
    minWidth: "47%",
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    padding: spacing.md,
    gap: 6
  },
  statPrimary: {
    backgroundColor: colors.primarySoft
  },
  statMint: {
    backgroundColor: colors.tertiarySoft
  },
  statWarning: {
    backgroundColor: colors.warningSoft
  },
  statDanger: {
    backgroundColor: colors.dangerSoft
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  statValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  }
});
