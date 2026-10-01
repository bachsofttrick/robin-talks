import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { labelsWith } from "./labels";
import type { AccountKitLabels } from "./labels";
import { Field, PrimaryButton, LinkButton, Note, Problem } from "./controls";
import { useKitSession } from "./context";
import { updatePassword, deleteAccount, signOut } from "./actions";
import { WRONG_CURRENT_PASSWORD, MANAGE_SUBSCRIPTIONS_URL, KIT } from "./constants";
import { RequireAccount } from "./RequireAccount";

/**
 * The account screen: who is signed in, changing a password, signing out, and
 * deleting the account for real.
 *
 * Delete is two steps on purpose, and it says what is deleted before it asks
 * again. Apple requires it to be here, in the app, and to remove the account
 * itself rather than sign the person out (Guideline 5.1.1(v)).
 */
export function AccountPanel(props: {
  compact?: boolean;
  labels?: Partial<AccountKitLabels>;
  onDeleted?: () => void;
  onSignedOut?: () => void;
  style?: unknown;
}) {
  const t = labelsWith(props.labels);
  const session = useKitSession();
  const [stage, setStage] = useState<"idle" | "password" | "confirmDelete" | "deleted">("idle");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Before the signed-out check: deleting the account signs this device out.
  if (stage === "deleted") {
    return (
      <View style={[{ padding: 20 }, props.style as never]}>
        <Text style={{ color: KIT.text, fontSize: 16 }}>{t.deleted}</Text>
      </View>
    );
  }
  if (session.loading) return null;
  if (!session.signedIn) {
    return (
      <View style={[{ padding: 20 }, props.style as never]}>
        <RequireAccount labels={props.labels} style={{ padding: 0 }}>
          <View />
        </RequireAccount>
      </View>
    );
  }

  const onChangePassword = async () => {
    setBusy(true);
    setError(null);
    const result = await updatePassword(next, current);
    setBusy(false);
    if (result.error === WRONG_CURRENT_PASSWORD) {
      // Nothing on the session tells an account made with Apple (whose
      // password only Borel holds) from a mistyped password, so this says
      // both, in place of a form that cannot succeed for the first.
      setCurrent("");
      setNext("");
      setStage("idle");
      setNote(t.wrongCurrentPassword);
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrent("");
    setNext("");
    setStage("idle");
    setNote(t.changedPassword);
  };

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStage("deleted");
    if (props.onDeleted) props.onDeleted();
  };

  return (
    <View style={[{ padding: 20, borderTopWidth: props.compact ? 0 : 1, borderTopColor: KIT.line }, props.style as never]}>
      <Text style={{ color: KIT.muted, fontSize: 13 }}>{t.signedInAs}</Text>
      <Text style={{ color: KIT.text, fontSize: 16, fontWeight: "600", marginBottom: 16 }}>{session.user && session.user.email ? session.user.email : ""}</Text>
      <Note text={note} />
      <Problem text={error} />

      {stage === "password" ? (
        <View style={{ marginBottom: 8 }}>
          <Field label={t.currentPassword} value={current} onChangeText={setCurrent} secure textContentType="password" />
          <Field label={t.newPassword} value={next} onChangeText={setNext} secure textContentType="newPassword" />
          <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 12 }}>{t.passwordRule}</Text>
          <PrimaryButton title={t.changePassword} onPress={onChangePassword} busy={busy} disabled={!current || next.length < 8} />
          <LinkButton title={t.cancel} onPress={() => setStage("idle")} />
        </View>
      ) : stage === "confirmDelete" ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: KIT.text, fontSize: 16, fontWeight: "600", marginBottom: 8 }}>{t.deleteTitle}</Text>
          <Text style={{ color: KIT.muted, fontSize: 14, marginBottom: 12 }}>{t.deleteBody}</Text>
          <Text style={{ color: KIT.muted, fontSize: 14, marginBottom: 6 }}>{t.deleteSubscription}</Text>
          <LinkButton title={t.manageSubscriptions} onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)} />
          <View style={{ height: 8 }} />
          <PrimaryButton title={t.deleteConfirm} onPress={onDelete} busy={busy} tone="danger" />
          <LinkButton title={t.cancel} onPress={() => setStage("idle")} />
        </View>
      ) : (
        <View>
          <LinkButton title={t.changePassword} onPress={() => setStage("password")} />
          <LinkButton
            title={t.signOut}
            onPress={() => {
              void signOut();
              if (props.onSignedOut) props.onSignedOut();
            }}
          />
          <LinkButton title={t.deleteAccount} tone="danger" onPress={() => setStage("confirmDelete")} />
        </View>
      )}
    </View>
  );
}
