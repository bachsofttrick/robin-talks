import * as Crypto from "expo-crypto";

// Hermes on Android has no global `crypto`. @neondatabase/auth calls
// crypto.randomUUID() while its module loads, before any app code runs, so the
// global is backed by expo-crypto before the rest of the app is imported.
type CryptoLike = {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
  randomUUID?: () => string;
};

const existing = (globalThis as { crypto?: CryptoLike }).crypto;

if (!existing) {
  (globalThis as { crypto?: CryptoLike }).crypto = {
    getRandomValues: (array) => Crypto.getRandomValues(array),
    randomUUID: () => Crypto.randomUUID(),
  };
} else {
  if (typeof existing.getRandomValues !== "function") {
    existing.getRandomValues = (array) => Crypto.getRandomValues(array);
  }
  if (typeof existing.randomUUID !== "function") {
    existing.randomUUID = () => Crypto.randomUUID();
  }
}
