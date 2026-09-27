import type { Profile } from "./useProfile";

export const LEGACY_PROFILE_KEY = "borel-store:robin.profile";

const LEVELS: readonly Profile["level"][] = ["Beginner", "Intermediate", "Advanced"];

function isLevel(value: unknown): value is Profile["level"] {
  return LEVELS.includes(value as Profile["level"]);
}

function unwrapEnvelope(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.v === "number" && "data" in obj) {
    const inner = obj.data;
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return null;
    return inner as Record<string, unknown>;
  }
  return obj;
}

// Reads a profile saved on the phone by an older build, either as a plain
// object or inside a versioned { v, data } envelope. Returns null unless the
// name is non-empty and the level is one of the three known levels.
export function parseLegacyProfile(raw: unknown): Profile | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
  const candidate = unwrapEnvelope(value);
  if (!candidate) return null;
  const name = candidate.displayName ?? candidate.display_name ?? candidate.name;
  if (typeof name !== "string") return null;
  const displayName = name.trim();
  if (displayName === "") return null;
  if (!isLevel(candidate.level)) return null;
  return {
    displayName,
    level: candidate.level,
    onboarded: typeof candidate.onboarded === "boolean" ? candidate.onboarded : true,
  };
}
