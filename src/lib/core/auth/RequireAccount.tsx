import React, { useState } from "react";
import { Text, View } from "react-native";
import { labelsWith } from "./labels";
import type { AccountKitLabels } from "./labels";
import { PrimaryButton } from "./controls";
import { useKitSession } from "./context";
import { SignInSheet } from "./SignInSheet";
import { KIT } from "./constants";
import { Bird } from "../../ui";

/**
 * Sign-in in front of what genuinely needs an account, and nothing else.
 *
 * Signed out, it shows a short card where that data or control would be, and
 * the rest of the app keeps working - which is what Apple asks for in Guideline
 * 5.1.1(v): people use everything that does not need an account without one.
 */
export function RequireAccount(props: {
  reason?: string;
  children: React.ReactNode;
  labels?: Partial<AccountKitLabels>;
  style?: unknown;
}) {
  const t = labelsWith(props.labels);
  const session = useKitSession();
  const [open, setOpen] = useState(false);
  if (session.loading) return null;
  if (session.signedIn) return <>{props.children}</>;
  return (
    <View style={[{ flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }, props.style as never]}>
      <Bird size={48} />
      <Text style={{ color: KIT.text, fontSize: 16, marginBottom: 12, textAlign: "center" }}>{props.reason ? t.signInPrompt + " " + props.reason : t.signInPrompt}</Text>
      <PrimaryButton title={t.signIn} onPress={() => setOpen(true)} />
      <SignInSheet visible={open} onClose={() => setOpen(false)} reason={props.reason} labels={props.labels} />
    </View>
  );
}
