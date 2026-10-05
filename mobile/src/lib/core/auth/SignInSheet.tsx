import React from "react";
import { Modal, ScrollView, View } from "react-native";
import { labelsWith } from "./labels";
import type { AccountKitLabels } from "./labels";
import { LinkButton } from "./controls";
import { SignInFlow } from "./SignInFlow";

/** The same flow in a sheet, for a single control that needs an account. */
export function SignInSheet(props: {
  visible: boolean;
  onClose: () => void;
  reason?: string;
  mode?: "signIn" | "signUp";
  labels?: Partial<AccountKitLabels>;
}) {
  const t = labelsWith(props.labels);
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <ScrollView contentContainerStyle={{ flex: 1, justifyContent: "center", paddingBottom: 75 }} keyboardShouldPersistTaps="handled">
        <SignInFlow reason={props.reason} mode={props.mode} labels={props.labels} onDone={props.onClose} />
        <View style={{ alignItems: "center" }}>
          <LinkButton title={t.cancel} onPress={props.onClose} />
        </View>
      </ScrollView>
    </Modal>
  );
}
