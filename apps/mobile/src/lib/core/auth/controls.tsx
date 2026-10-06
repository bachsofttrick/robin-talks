import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KIT } from "./constants";

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  secure?: boolean;
  keyboard?: "email-address" | "number-pad" | "default";
  textContentType?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 6 }}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure === true}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={props.keyboard ?? "default"}
        textContentType={props.textContentType as never}
        autoComplete={props.autoComplete as never}
        maxLength={props.maxLength}
        style={{
          backgroundColor: KIT.field,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          color: KIT.text,
        }}
      />
    </View>
  );
}

export function PrimaryButton(props: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: "accent" | "danger" }) {
  const background = props.tone === "danger" ? KIT.danger : KIT.accent;
  const disabled = props.disabled === true || props.busy === true;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        backgroundColor: background,
        opacity: disabled ? 0.5 : 1,
        borderRadius: 12,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      }}
    >
      {props.busy ? <ActivityIndicator color={KIT.onAccent} /> : <Text style={{ color: KIT.onAccent, fontSize: 16, fontWeight: "600" }}>{props.title}</Text>}
    </Pressable>
  );
}

export function LinkButton(props: { title: string; onPress: () => void; tone?: "muted" | "danger" }) {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: props.tone === "danger" ? KIT.danger : KIT.accent, fontSize: 15 }}>{props.title}</Text>
    </Pressable>
  );
}

export function Problem(props: { text: string | null }) {
  if (!props.text) return null;
  return <Text style={{ color: KIT.danger, fontSize: 14, marginBottom: 12 }}>{props.text}</Text>;
}

export function Note(props: { text: string | null }) {
  if (!props.text) return null;
  return <Text style={{ color: KIT.muted, fontSize: 14, marginBottom: 12 }}>{props.text}</Text>;
}
