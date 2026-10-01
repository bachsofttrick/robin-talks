import { LABELS, labelsWith } from "./labels";

describe("labelsWith", () => {
  test("no argument returns LABELS", () => {
    expect(labelsWith()).toBe(LABELS);
  });

  test("overrides one key and keeps the other defaults", () => {
    const labels = labelsWith({ signIn: "Custom" });
    expect(labels.signIn).toBe("Custom");
    expect(labels.signUp).toBe(LABELS.signUp);
    expect(labels.email).toBe(LABELS.email);
    expect(labels.password).toBe(LABELS.password);
  });
});
