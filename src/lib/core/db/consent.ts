import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

// ---------------------------------------------------------------------------
// Asking before anything goes to AI. App Store Review Guideline 5.1.2(i): an
// app must "clearly disclose where personal data will be shared with third
// parties, including with third-party AI, and obtain explicit permission
// before doing so". Apple rejects an app that sends what someone types or a
// photo they chose to an AI company without saying what goes where and asking
// first, so every db.ai call asks here, once per company, before it sends.
// "Allow" is remembered on this device; "Don't Allow" is not, so the next use
// asks again. Nothing is sent without it.
// ---------------------------------------------------------------------------

const AI_CONSENT_KEY = "borel.aiConsent.v1:";
const AI_MAKERS: Record<string, string> = {"qwen3-next-80b-a3b-instruct":"Qwen by Alibaba","gpt-oss-120b":"gpt-oss by OpenAI","gpt-oss-20b":"gpt-oss by OpenAI","llama-4-maverick":"Llama by Meta","gemini-3-flash":"Gemini by Google","claude-sonnet-5":"Claude by Anthropic","claude-haiku-4-5":"Claude by Anthropic","gpt-5-mini":"GPT-5 by OpenAI","gpt-5-nano":"GPT-5 by OpenAI"};
// The one model that hears a recording (Borel sends every recording to it).
export const AI_AUDIO_MODEL = "gemini-3-flash";
export const AI_DECLINED = "This feature shares what you send with AI, so it needs your permission. Use it again and tap Allow to turn it on.";
const aiConsentGiven = new Set<string>();
const aiConsentAsking = new Map<string, Promise<boolean>>();

type AiConsentKind = "chat" | "photoChat" | "audio" | "image" | "editImage";

function aiConsentWording(kind: AiConsentKind, model: string): { key: string; message: string } {
  if (kind === "audio") {
    // A voice is its own kind of personal data, so it is asked about on its own.
    const maker = AI_MAKERS[AI_AUDIO_MODEL] || "an AI model";
    return {
      key: "neon:audio:" + maker,
      message: "To answer, this app sends your recording to Neon, which runs " + maker + ". They use it only to create the answer.",
    };
  }
  if (kind === "chat") {
    const maker = AI_MAKERS[model] || AI_MAKERS["qwen3-next-80b-a3b-instruct"] || "an AI model";
    return {
      key: "neon:" + maker,
      message: "To answer, this app sends what you type to Neon, which runs " + maker + ". They use it only to create the answer.",
    };
  }
  if (kind === "photoChat") {
    return {
      key: "openai:chat",
      message: "To answer, this app sends what you type and the photos you add to OpenAI. OpenAI uses them only to create the answer.",
    };
  }
  if (kind === "image") {
    return {
      key: "openai:image",
      message: "To make the picture, this app sends your description to OpenAI. OpenAI uses it only to create the picture.",
    };
  }
  return {
    key: "openai:edit",
    message: "To change the picture, this app sends the photo and your instructions to OpenAI. OpenAI uses them only to create the new picture.",
  };
}

export async function askAiConsent(kind: AiConsentKind, model: string): Promise<boolean> {
  const { key, message } = aiConsentWording(kind, model);
  if (aiConsentGiven.has(key)) return true;
  const asking = aiConsentAsking.get(key);
  if (asking) return asking;
  const pending = (async () => {
    try {
      if ((await AsyncStorage.getItem(AI_CONSENT_KEY + key)) === "yes") {
        aiConsentGiven.add(key);
        return true;
      }
    } catch {
      // Storage unavailable (the preview's sandbox): ask instead.
    }
    const allowed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      Alert.alert(
        "Share with AI?",
        message + " Nothing is sent unless you allow it.",
        [
          { text: "Don't Allow", style: "cancel", onPress: () => settle(false) },
          { text: "Allow", onPress: () => settle(true) },
        ],
        { cancelable: true, onDismiss: () => settle(false) },
      );
    });
    if (allowed) {
      aiConsentGiven.add(key);
      try {
        await AsyncStorage.setItem(AI_CONSENT_KEY + key, "yes");
      } catch {
        // Remembered for this session only.
      }
    }
    return allowed;
  })();
  aiConsentAsking.set(key, pending);
  try {
    return await pending;
  } finally {
    aiConsentAsking.delete(key);
  }
}
