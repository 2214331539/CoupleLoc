import { useEffect, useMemo, useState } from "react";
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
import { BrandWordmark, Card, FieldLabel, LogoMark, PillButton } from "../components/HeartlineUI";
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

  const title = mode === "forgot" ? "找回密码" : mode === "login" ? "登录" : "注册";
  const submitLabel =
    mode === "forgot" ? "重设密码并登录" : mode === "register" ? "创建账号" : "立即登录";

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
      if (normalizedPassword.length < 8) {
        return "请输入至少 8 位密码";
      }
      return null;
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
        response.debug_code
          ? `本地测试验证码：${response.debug_code}`
          : "验证码已发送，请注意查收"
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
      let auth;
      if (mode === "register") {
        auth = await registerWithSms(phone, code.trim(), displayName.trim(), normalizedPassword);
      } else if (mode === "forgot") {
        auth = await resetPasswordWithSms(phone, code.trim(), normalizedPassword);
      } else if (loginMethod === "sms") {
        auth = await loginWithSms(phone, code.trim());
      } else {
        auth = await login(phone, normalizedPassword);
      }
      onAuthenticated(auth.access_token, auth.user);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  const showCodeField = mode !== "login" || loginMethod === "sms";
  const showPasswordField = mode !== "login" || loginMethod === "password";

  return (
    <SafeScreen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <LogoMark size={104} />
            <BrandWordmark />
            <Text style={styles.subtitle}>连接跨越距离的爱</Text>
          </View>

          <Card style={styles.card}>
            <View style={styles.tabs}>
              <Pressable onPress={() => switchMode("login")} style={styles.tab}>
                <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                  登录
                </Text>
                {mode === "login" ? <View style={styles.tabLine} /> : null}
              </Pressable>
              <Pressable onPress={() => switchMode("register")} style={styles.tab}>
                <Text style={[styles.tabText, mode === "register" && styles.tabTextActive]}>
                  注册
                </Text>
                {mode === "register" ? <View style={styles.tabLine} /> : null}
              </Pressable>
            </View>

            {mode === "forgot" ? (
              <View style={styles.forgotHeader}>
                <Text style={styles.forgotTitle}>找回密码</Text>
                <Text style={styles.forgotSubtitle}>验证手机号后即可设置新密码</Text>
              </View>
            ) : null}

            {mode === "login" ? (
              <View style={styles.methodSwitch}>
                <Pressable
                  onPress={() => {
                    setLoginMethod("sms");
                    resetMessages();
                  }}
                  style={[styles.methodButton, loginMethod === "sms" && styles.methodActive]}
                >
                  <Text style={styles.methodText}>验证码登录</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setLoginMethod("password");
                    resetMessages();
                  }}
                  style={[styles.methodButton, loginMethod === "password" && styles.methodActive]}
                >
                  <Text style={styles.methodText}>密码登录</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.form}>
              {mode === "register" ? (
                <View style={styles.fieldGroup}>
                  <FieldLabel>昵称</FieldLabel>
                  <TextInput
                    onChangeText={setDisplayName}
                    placeholder="你想让另一半看到的名字"
                    placeholderTextColor={colors.outline}
                    style={styles.input}
                    value={displayName}
                  />
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <FieldLabel>手机号码</FieldLabel>
                <View style={styles.phoneInputRow}>
                  <Text style={styles.countryCode}>+86</Text>
                  <View style={styles.inputDivider} />
                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={setPhoneNumber}
                    placeholder="请输入您的手机号"
                    placeholderTextColor={colors.outline}
                    style={styles.phoneInput}
                    value={phoneNumber}
                  />
                </View>
              </View>

              {showCodeField ? (
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <FieldLabel>验证码</FieldLabel>
                    <Pressable disabled={cooldown > 0 || submitting} onPress={requestCode}>
                      <Text style={styles.linkText}>
                        {cooldown > 0 ? `${cooldown}s 后重发` : "获取验证码"}
                      </Text>
                    </Pressable>
                  </View>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={8}
                    onChangeText={setCode}
                    placeholder="请输入验证码"
                    placeholderTextColor={colors.outline}
                    style={styles.input}
                    value={code}
                  />
                </View>
              ) : null}

              {showPasswordField ? (
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <FieldLabel>{mode === "forgot" ? "新密码" : "密码"}</FieldLabel>
                    {mode === "login" ? (
                      <Pressable onPress={() => switchMode("forgot")}>
                        <Text style={styles.linkText}>找回密码？</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    maxLength={128}
                    onChangeText={setPassword}
                    placeholder="请输入至少 8 位密码"
                    placeholderTextColor={colors.outline}
                    secureTextEntry
                    style={styles.input}
                    value={password}
                  />
                </View>
              ) : null}

              {mode === "login" && loginMethod === "sms" ? (
                <Pressable onPress={() => switchMode("forgot")}>
                  <Text style={styles.forgotLink}>忘记密码？</Text>
                </Pressable>
              ) : null}

              {error || localError ? <Text style={styles.notice}>{localError || error}</Text> : null}

              <PillButton
                disabled={submitting}
                label={submitting ? "请稍候..." : `${submitLabel}  ->`}
                onPress={submit}
                style={submitting && styles.disabled}
              />
            </View>
          </Card>

          <Pressable
            onPress={() => switchMode(mode === "register" ? "login" : "register")}
          >
            <Text style={styles.switchHint}>
              {mode === "register" ? "已有账号？立即登录" : "还没有账号？立即注册"}
            </Text>
          </Pressable>

          {mode === "forgot" ? (
            <Pressable onPress={() => switchMode("login")}>
              <Text style={styles.switchHint}>返回登录</Text>
            </Pressable>
          ) : null}

          <Text style={styles.terms}>登录即代表您同意 服务协议 和 隐私政策</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
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
  hero: {
    alignItems: "center",
    gap: spacing.sm
  },
  subtitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600"
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  tab: {
    paddingBottom: spacing.sm
  },
  tabText: {
    color: colors.muted,
    fontSize: 30,
    fontWeight: "900"
  },
  tabTextActive: {
    color: colors.primaryStrong
  },
  tabLine: {
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.primaryStrong,
    marginTop: spacing.sm
  },
  forgotHeader: {
    gap: spacing.xs
  },
  forgotTitle: {
    color: colors.primaryStrong,
    fontSize: 24,
    fontWeight: "900"
  },
  forgotSubtitle: {
    color: colors.muted
  },
  methodSwitch: {
    flexDirection: "row",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    padding: 5
  },
  methodButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full
  },
  methodActive: {
    backgroundColor: colors.surface,
    ...shadows.card
  },
  methodText: {
    color: colors.primaryStrong,
    fontWeight: "900"
  },
  form: {
    gap: spacing.md
  },
  fieldGroup: {
    gap: spacing.sm
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  linkText: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: "900",
    paddingRight: spacing.md
  },
  forgotLink: {
    color: colors.primaryStrong,
    textAlign: "right",
    fontWeight: "900"
  },
  phoneInputRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    ...shadows.card
  },
  countryCode: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    paddingHorizontal: spacing.lg
  },
  inputDivider: {
    width: 1,
    height: 42,
    backgroundColor: colors.line
  },
  phoneInput: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: spacing.lg
  },
  input: {
    minHeight: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    ...shadows.card
  },
  notice: {
    color: colors.primaryStrong,
    fontWeight: "800",
    lineHeight: 20
  },
  disabled: {
    opacity: 0.7
  },
  switchHint: {
    color: colors.primaryStrong,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900"
  },
  terms: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22
  }
});
