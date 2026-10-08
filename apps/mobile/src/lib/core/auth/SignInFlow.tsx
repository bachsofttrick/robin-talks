import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { AuthResult } from "./types";
import { PASSWORD_RESET_AVAILABLE, KIT } from "./constants";
import { labelsWith } from "./labels";
import type { AccountKitLabels } from "./labels";
import { Field, PrimaryButton, LinkButton, Note, Problem } from "./controls";
import { signIn, signUp, confirmEmail, resendConfirmation, sendPasswordReset, resetPassword } from "./actions";
import { useKitSession } from "./context";
import { openPrivacyPolicy, openTermsOfUse } from "../legal";
import { db } from "../db";

export type SignInStep = "signIn" | "signUp" | "confirm" | "forgot" | "reset";

/**
 * The whole sign-in flow: sign in, create an account, confirm an emailed code,
 * and reset a forgotten password. Place it on a screen, or open it as a sheet
 * with <SignInSheet />. It shows the terms and privacy links where an account
 * is created.
 */
export function SignInFlow(props: {
  mode?: "signIn" | "signUp";
  reason?: string;
  onDone?: () => void;
  labels?: Partial<AccountKitLabels>;
  accentColor?: string;
  style?: unknown;
}) {
  const t = labelsWith(props.labels);
  const [step, setStep] = useState<SignInStep>(props.mode === "signUp" ? "signUp" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const session = useKitSession();

  // Once per sign-in: both the call that signs in and the session it changes
  // say "done", and a second onDone (navigation.goBack) would pop two screens.
  const finished = useRef(false);
  const { onDone } = props;
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (onDone) onDone();
  }, [onDone]);
  useEffect(() => {
    if (session.signedIn) finish();
    else finished.current = false;
  }, [session.signedIn, finish]);

  // A different step starts clean: what the last one said does not belong there.
  const go = (next: SignInStep) => {
    setError(null);
    setNote(null);
    setStep(next);
  };

  const run = async (work: () => Promise<AuthResult>, after?: (result: AuthResult) => void) => {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok && !result.needsEmailConfirmation) {
      setError(result.error);
      return;
    }
    if (after) after(result);
  };

  const onSignIn = () =>
    run(
      () => signIn(email, password),
      (result) => {
        if (result.needsEmailConfirmation) {
          setNote(t.confirmBody);
          setStep("confirm");
          if (!result.ok) {
            void resendConfirmation(email).then((sent) => {
              if (!sent.ok) setError(sent.error);
            });
          }
        } else finish();
      },
    );

  const onSignUp = () =>
    run(
      () => signUp(email, password),
      (result) => {
        if (result.needsEmailConfirmation) {
          setNote(t.confirmBody);
          setStep("confirm");
        } else finish();
      },
    );

  const onConfirm = () =>
    run(
      () => confirmEmail(email, code),
      async () => {
        // The code is usually enough; when it is not, the password they just
        // chose is still in this screen's hands. Asked now rather than read
        // from this render: the code may have signed them in a moment ago.
        const now = await db.auth.getSession().catch(() => null);
        const signedInNow = Boolean(now && now.data && now.data.session);
        if (!signedInNow && password) await signIn(email, password);
        finish();
      },
    );

  const onResend = () =>
    run(
      () => resendConfirmation(email),
      () => setNote(t.resent),
    );

  const onForgot = () =>
    run(
      () => sendPasswordReset(email),
      () => {
        setNote(t.resetSent);
        setStep("reset");
      },
    );

  const onReset = () =>
    run(
      () => resetPassword(email, code, password),
      () => {
        setNote(t.changedPassword);
        setCode("");
        setPassword("");
        setStep("signIn");
      },
    );

  const heading =
    step === "signUp" ? t.signUp : step === "confirm" ? t.confirmTitle : step === "forgot" || step === "reset" ? t.resetTitle : t.signIn;

  return (
    <View style={[{ padding: 20 }, props.style as never]}>
      <Text style={{ color: KIT.text, fontSize: 24, fontWeight: "700", marginBottom: 6 }}>{heading}</Text>
      {props.reason ? <Text style={{ color: KIT.muted, fontSize: 15, marginBottom: 16 }}>{props.reason}</Text> : <View style={{ height: 10 }} />}
      <Note text={note} />
      <Problem text={error} />

      {step === "confirm" ? (
        <View>
          <Field label={t.code} value={code} onChangeText={setCode} keyboard="number-pad" textContentType="oneTimeCode" maxLength={6} />
          <PrimaryButton title={t.continue} onPress={onConfirm} busy={busy} disabled={code.trim().length < 4} />
          <LinkButton title={t.resend} onPress={onResend} />
        </View>
      ) : step === "forgot" ? (
        <View>
          <Text style={{ color: KIT.muted, fontSize: 15, marginBottom: 12 }}>{t.resetBody}</Text>
          <Field label={t.email} value={email} onChangeText={setEmail} keyboard="email-address" textContentType="emailAddress" autoComplete="email" />
          <PrimaryButton title={t.sendCode} onPress={onForgot} busy={busy} disabled={!email.trim()} />
          <LinkButton title={t.signIn} onPress={() => go("signIn")} />
        </View>
      ) : step === "reset" ? (
        <View>
          <Field label={t.code} value={code} onChangeText={setCode} keyboard="number-pad" textContentType="oneTimeCode" maxLength={6} />
          <Field label={t.newPassword} value={password} onChangeText={setPassword} secure textContentType="newPassword" />
          <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 12 }}>{t.passwordRule}</Text>
          <PrimaryButton title={t.continue} onPress={onReset} busy={busy} disabled={code.trim().length < 4 || password.length < 8} />
          <LinkButton title={t.cancel} onPress={() => go("signIn")} />
        </View>
      ) : (
        <View>
          <Field label={t.email} value={email} onChangeText={setEmail} keyboard="email-address" textContentType="emailAddress" autoComplete="email" />
          <Field
            label={t.password}
            value={password}
            onChangeText={setPassword}
            secure
            textContentType={step === "signUp" ? "newPassword" : "password"}
            autoComplete={step === "signUp" ? "new-password" : "current-password"}
          />
          {step === "signUp" ? <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 12 }}>{t.passwordRule}</Text> : null}
          <PrimaryButton
            title={step === "signUp" ? t.signUp : t.signIn}
            onPress={step === "signUp" ? onSignUp : onSignIn}
            busy={busy}
            disabled={!email.trim() || password.length < (step === "signUp" ? 8 : 1)}
          />
          {step === "signIn" && PASSWORD_RESET_AVAILABLE ? <LinkButton title={t.forgot} onPress={() => go("forgot")} /> : null}
          <LinkButton title={step === "signUp" ? t.haveAccount : t.noAccount} onPress={() => go(step === "signUp" ? "signIn" : "signUp")} />
          {step === "signUp" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
              <Text style={{ color: KIT.muted, fontSize: 13 }}>{t.agree} </Text>
              <Pressable onPress={() => openTermsOfUse()} accessibilityRole="link" hitSlop={8}>
                <Text style={{ color: KIT.accent, fontSize: 13 }}>{t.terms}</Text>
              </Pressable>
              <Text style={{ color: KIT.muted, fontSize: 13 }}> and </Text>
              <Pressable onPress={() => openPrivacyPolicy()} accessibilityRole="link" hitSlop={8}>
                <Text style={{ color: KIT.accent, fontSize: 13 }}>{t.privacy}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
