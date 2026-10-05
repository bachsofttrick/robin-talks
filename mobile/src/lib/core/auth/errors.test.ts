import { authErrorMessage, displayNameFor, madeWithoutSession } from "./errors";

describe("authErrorMessage", () => {
  test("invalid email or password", () => {
    expect(authErrorMessage("Invalid email or password")).toBe(
      "That email and password do not match an account.",
    );
  });

  test("unconfirmed email", () => {
    expect(authErrorMessage("Email not confirmed")).toBe(
      "Confirm your email first - enter the code we emailed you.",
    );
  });

  test("invalid or expired code", () => {
    expect(authErrorMessage("invalid code")).toBe("That code is wrong or has expired. Ask for a new one.");
  });

  test("too many attempts", () => {
    expect(authErrorMessage("too many attempts")).toBe("Too many tries. Ask for a new code.");
  });

  test("already exists", () => {
    expect(authErrorMessage("already exists")).toBe(
      "That email already has an account. Sign in instead.",
    );
  });

  test("password too short", () => {
    expect(authErrorMessage("password too short")).toBe("Use at least 8 characters.");
  });

  test("invalid email", () => {
    expect(authErrorMessage("invalid email")).toBe("That does not look like a valid email address.");
  });

  test("rate limit", () => {
    expect(authErrorMessage("rate limit")).toBe("Too many attempts. Wait a minute and try again.");
  });

  test("network failure", () => {
    expect(authErrorMessage("failed to fetch")).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });

  test("empty string", () => {
    expect(authErrorMessage("")).toBe("Something went wrong. Please try again.");
  });

  test("unrecognised message falls through to the raw message", () => {
    expect(authErrorMessage("some unknown server failure")).toBe("some unknown server failure");
  });

  test("accepts an Error object", () => {
    expect(authErrorMessage(new Error("invalid email or password"))).toBe(
      "That email and password do not match an account.",
    );
  });

  test("accepts a string", () => {
    expect(authErrorMessage("rate limit")).toBe("Too many attempts. Wait a minute and try again.");
  });
});

describe("displayNameFor", () => {
  test("uses metadata.name when present", () => {
    expect(displayNameFor("jane@example.com", { name: "Jane Doe" })).toBe("Jane Doe");
  });

  test("falls back to metadata.display_name", () => {
    expect(displayNameFor("jane@example.com", { display_name: "Jane D" })).toBe("Jane D");
  });

  test("falls back to metadata.full_name", () => {
    expect(displayNameFor("jane@example.com", { full_name: "Jane Doe" })).toBe("Jane Doe");
  });

  test("derives a spaced name from the email local part", () => {
    expect(displayNameFor("jane.doe_x@example.com")).toBe("jane doe x");
  });

  test("falls back to there", () => {
    expect(displayNameFor("___@example.com")).toBe("there");
  });
});

describe("madeWithoutSession", () => {
  test("true for a session_not_found code", () => {
    expect(madeWithoutSession({ code: "session_not_found" })).toBe(true);
  });

  test("true for a failed to retrieve user session message", () => {
    expect(madeWithoutSession({ message: "Failed to retrieve user session" })).toBe(true);
  });

  test("false for a generic error", () => {
    expect(madeWithoutSession({ message: "network failure" })).toBe(false);
  });
});
