import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { aiConsentWording, askAiConsent } from "./consent";

jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn() }));

const getItemMock = AsyncStorage.getItem as unknown as jest.Mock;
const alertSpy = jest.spyOn(Alert, "alert");

beforeEach(() => {
  getItemMock.mockReset();
  getItemMock.mockResolvedValue(null);
  alertSpy.mockReset();
});

describe("aiConsentWording", () => {
  test("text chat names OpenRouter and the GPT-6 maker under a fresh key", () => {
    const { key, message } = aiConsentWording("chat", "openai/gpt-6-luna");
    expect(key).toBe("openrouter:chat");
    expect(message).toContain("OpenRouter.ai");
    expect(message).toContain("GPT-6 by OpenAI");
  });

  test("photo chat also names the photos and keeps the GPT-6 maker", () => {
    const { key, message } = aiConsentWording("photoChat", "openai/gpt-6-luna");
    expect(key).toBe("openrouter:photo");
    expect(message).toContain("OpenRouter.ai");
    expect(message).toContain("GPT-6 by OpenAI");
    expect(message).toContain("photos");
  });

  test("audio names OpenRouter and the Qwen3 ASR maker", () => {
    const { key, message } = aiConsentWording("audio", "");
    expect(key).toBe("openrouter:audio");
    expect(message).toContain("OpenRouter.ai");
    expect(message).toContain("Qwen3 ASR by Alibaba");
  });

  test("image and editImage stay on OpenAI", () => {
    expect(aiConsentWording("image", "").key).toBe("openai:image");
    expect(aiConsentWording("editImage", "").key).toBe("openai:edit");
  });
});

describe("askAiConsent", () => {
  test("a stored old-style key does not satisfy the new chat key", async () => {
    getItemMock.mockImplementation(async (key: string) => (key === "borel.aiConsent.v1:neon:GPT-6 by OpenAI" ? "yes" : null));
    alertSpy.mockImplementation((_title: string, _message?: string, buttons?: { onPress?: () => void }[]) => {
      buttons?.[0].onPress?.();
    });
    const allowed = await askAiConsent("chat", "openai/gpt-6-luna");
    expect(allowed).toBe(false);
    expect(alertSpy).toHaveBeenCalled();
  });
});
