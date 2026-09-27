import { parseLegacyProfile } from "./profileImport";

describe("parseLegacyProfile", () => {
  test("accepts a valid raw object and trims the name", () => {
    expect(parseLegacyProfile({ displayName: "  Ana  ", level: "Beginner", onboarded: true })).toEqual({
      displayName: "Ana",
      level: "Beginner",
      onboarded: true,
    });
  });

  test("accepts a versioned envelope", () => {
    expect(parseLegacyProfile({ v: 1, data: { displayName: "Bob", level: "Advanced" } })).toEqual({
      displayName: "Bob",
      level: "Advanced",
      onboarded: true,
    });
  });

  test("accepts a JSON string of a valid profile", () => {
    expect(parseLegacyProfile('{"displayName":"Cara","level":"Intermediate"}')).toEqual({
      displayName: "Cara",
      level: "Intermediate",
      onboarded: true,
    });
  });

  test("rejects an empty name", () => {
    expect(parseLegacyProfile({ displayName: "   ", level: "Beginner" })).toBeNull();
  });

  test("rejects an unknown level", () => {
    expect(parseLegacyProfile({ displayName: "Ana", level: "Fluent" })).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(parseLegacyProfile("{not json")).toBeNull();
  });
});
