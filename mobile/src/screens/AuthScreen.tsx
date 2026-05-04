import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  login,
  loginWithSms,
  registerWithSms,
  resetPasswordWithSms,
  sendSmsCode,
  type SmsPurpose,
} from "../api/client";
import {
  BrandWordmark,
  FieldLabel,
  LogoMark,
  PillButton,
  ScreenTitle,
  SegmentedControl,
} from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, shadows, spacing } from "../theme";
import type { User } from "../types";

type Props = {
  error: string | null;
  onAuthenticated: (token: string, user: User) => void;
};

type AuthMode = "login" | "register" | "forgot";
type LoginMethod = "sms" | "password";

export function AuthScreen({ error, onAuthenticated }: Props) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("sms");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const smsPurpose: SmsPurpose = useMemo(() => {
    if (mode === "register") {
      return "register";
    }
    if (mode === "forgot") {
      return "reset_password";
    }
    return "login";
  }, [mode]);

  const title = mode === "register" ? "创建账号" : mode === "forgot" ? "找回密码" : "欢迎回来";
  const subtitle =
    mode === "register"
      ? "用手机号注册后，在「我的」页面添加另一半。"
      : mode === "forgot"
        ? "验证手机号后设置一个新的登录密码。"
        : "登录后直接查看你们的实时状态。";

  const resetMessages = () => {
    setLocalError(null);
    setCode("");
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    if (nextMode !== "login") {
      setLoginMethod("sms");
    }
    resetMessages();
  };

  const validate = () => {
    const phone = phoneNumber.trim();
    const normalizedPassword = password.trim();

    if (phone.length < 5) {
      return "请输入手机号";
    }
    if (mode === "login" && loginMethod === "password") {
      return normalizedPassword.length < 8 ? "请输入至少 8 位密码" : null;
    }
    if (code.trim().length < 4) {
      return "请输入验证码";
    }
    if ((mode === "register" || mode === "forgot") && normalizedPassword.length < 8) {
      return "请输入至少 8 位密码";
    }
    if (mode === "register" && displayName.trim().length < 1) {
      return "请输入昵称";
    }
    return null;
  };

  const requestCode = async () => {
    if (cooldown > 0 || submitting) {
      return;
    }
    if (phoneNumber.trim().length < 5) {
      setLocalError("请输入手机号");
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    try {
      const response = await sendSmsCode(phoneNumber.trim(), smsPurpose);
      setCooldown(response.resend_after_seconds);
      setLocalError(
        response.debug_code ? `本地测试验证码：${response.debug_code}` : "验证码已发送，请注意查收"
      );
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    try {
      const phone = phoneNumber.trim();
      const normalizedPassword = password.trim();
      const auth =
        mode === "register"
          ? await registerWithSms(phone, code.trim(), displayName.trim(), normalizedPassword)
          : mode === "forgot"
            ? await resetPasswordWithSms(phone, code.trim(), normalizedPassword)
            : loginMethod === "sms"
              ? await loginWithSms(phone, code.trim())
              : await login(phone, normalizedPassword);

      onAuthenticated(auth.access_token, auth.user);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  const showCodeField = mode !== "login" || loginMethod === "sms";
  const showPasswordField = mode !== "login" || loginMethod === "password";
  const submitLabel =
    mode === "register" ? "注册并登录" : mode === "forgot" ? "重设密码" : "登录";

  return (
    <SafeScreen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <LogoMark size={76} />
            <BrandWordmark />
          </View>

          <ScreenTitle title={title} subtitle={subtitle} />

          <View style={styles.panel}>
            <SegmentedControl
              value={mode === "register" ? "register" : "login"}
              options={[
                { value: "login", label: "登录" },
                { value: "register", label: "注册" },
              ]}
              onChange={(value) => switchMode(value)}
            />

            {mode === "login" ? (
              <SegmentedControl
                value={loginMethod}
                options={[
                  { value: "sms", label: "验证码" },
                  { value: "password", label: "密码" },
                ]}
                onChange={(value) => {
                  setLoginMethod(value);
                  resetMessages();
                }}
              />
            ) : null}

            <View style={styles.form}>
              {mode === "register" ? (
                <Field label="昵称">
                  <TextInput
                    onChangeText={setDisplayName}
                    placeholder="另一半看到的名字"
                    placeholderTextColor={colors.tertiaryText}
                    style={styles.input}
                    value={displayName}
                  />
                </Field>
              ) : null}

              <Field label="手机号">
                <View style={styles.phoneRow}>
                  <Text style={styles.countryCode}>+86</Text>
                  <View style={styles.divider} />
                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={setPhoneNumber}
                    placeholder="请输入手机号"
                    placeholderTextColor={colors.tertiaryText}
                    style={styles.phoneInput}
                    value={phoneNumber}
                  />
                </View>
              </Field>

              {showCodeField ? (
                <Field
                  label="验证码"
                  action={
                    <Pressable disabled={cooldown > 0 || submitting} onPress={requestCode}>
                      <Text style={[styles.link, (cooldown > 0 || submitting) && styles.linkDisabled]}>
                        {cooldown > 0 ? `${cooldown}s 后重发` : "获取验证码"}
                      </Text>
                    </Pressable>
                  }
                >
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={8}
                    onChangeText={setCode}
                    placeholder="6 位验证码"
                    placeholderTextColor={colors.tertiaryText}
                    style={styles.input}
                    value={code}
                  />
                </Field>
              ) : null}

              {showPasswordField ? (
                <Field
                  label={mode === "forgot" ? "新密码" : "密码"}
                  action={
                    mode === "login" ? (
                      <Pressable onPress={() => switchMode("forgot")}>
                        <Text style={styles.link}>忘记密码？</Text>
                      </Pressable>
                    ) : null
                  }
                >
                  <TextInput
                    maxLength={128}
                    onChangeText={setPassword}
                    placeholder="至少 8 位"
                    placeholderTextColor={colors.tertiaryText}
                    secureTextEntry
                    style={styles.input}
                    value={password}
                  />
                </Field>
              ) : null}
            </View>

            {mode === "login" && loginMethod === "sms" ? (
              <Pressable onPress={() => switchMode("forgot")}>
                <Text style={styles.forgotLink}>无法登录？通过验证码找回密码</Text>
              </Pressable>
            ) : null}

            {error || localError ? <Text style={styles.notice}>{localError || error}</Text> : null}

            <PillButton
              disabled={submitting}
              label={submitting ? "请稍候..." : submitLabel}
              onPress={submit}
            />
          </View>

          {mode === "forgot" ? (
            <Pressable onPress={() => switchMode("login")}>
              <Text style={styles.switchHint}>返回登录</Text>
            </Pressable>
          ) : null}

          <Text style={styles.terms}>继续即表示你同意服务协议与隐私政策。</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View>
      <View style={styles.fieldTop}>
        <FieldLabel>{label}</FieldLabel>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  keyboard: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.lg
  },
  brand: {
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm
  },
  panel: {
    gap: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadows.card
  },
  form: {
    gap: spacing.md
  },
  fieldTop: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center"
  },
  phoneRow: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.fill
  },
  countryCode: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: spacing.md
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: colors.line
  },
  phoneInput: {
    flex: 1,
    height: "100%",
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center"
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600"
  },
  linkDisabled: {
    color: colors.tertiaryText
  },
  forgotLink: {
    color: colors.primary,
    textAlign: "center",
    fontWeight: "600"
  },
  notice: {
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.md
  },
  switchHint: {
    color: colors.primary,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600"
  },
  terms: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18
  }
});
