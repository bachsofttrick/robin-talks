import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { BOREL_ACCOUNT, borelHeaders } from "./config";
import { authHeader } from "./auth";
import { hiddenContent, blockedAuthors, moderationListeners, moderationChanged, loadModeration } from "./moderation-state";
export { forgetModeration } from "./moderation-state";

export type ReportReason = "spam" | "abuse" | "sexual" | "violence" | "other";

/** What a post, comment, message or profile is, for a report or a block. */
export interface ModerationTarget {
  /** The row's id. */
  contentId: string;
  /** The table the row is in, so the owner can remove it. */
  table?: string;
  /** The account id of whoever wrote it. */
  authorId?: string | null;
  /** "post", "comment", "message", "profile"... */
  kind?: string;
  /** A short piece of the text, so the owner knows what was reported. */
  excerpt?: string;
}

const BOREL_MODERATION = BOREL_ACCOUNT.slice(0, BOREL_ACCOUNT.lastIndexOf("/")) + "/moderation";

async function moderationCall(path: string, body?: unknown): Promise<{ ok: boolean; json: any }> {
  try {
    const bearer = await authHeader();
    if (!bearer || bearer === "bps_anon") return { ok: false, json: { error: "Sign in to report or block." } };
    const res = await fetch(BOREL_MODERATION + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders(), Authorization: "Bearer " + bearer },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: { error: "Could not reach the server. Check your connection and try again." } };
  }
}

function loadState(): Promise<void> {
  return loadModeration(() => moderationCall("/state"));
}

const REASON_LABELS: [ReportReason, string][] = [
  ["spam", "Spam"],
  ["abuse", "Harassment or abuse"],
  ["sexual", "Sexual content"],
  ["violence", "Violence or threats"],
  ["other", "Something else"],
];

export const moderation = {
  /** Sends a report to the app's owner and hides the item for this person. */
  async report(target: ModerationTarget & { reason?: ReportReason }): Promise<{ ok: boolean; error: string | null }> {
    const { ok, json } = await moderationCall("/report", {
      contentId: String(target.contentId),
      table: target.table,
      authorId: target.authorId ? String(target.authorId) : undefined,
      kind: target.kind,
      reason: target.reason || "other",
      excerpt: target.excerpt ? String(target.excerpt).slice(0, 500) : undefined,
    });
    if (!ok) return { ok: false, error: json.error || "That report couldn't be sent. Please try again." };
    hiddenContent.add(String(target.contentId));
    moderationChanged();
    return { ok: true, error: null };
  },
  /** Hides everything this account posts or sends, for this person, everywhere they sign in. */
  async block(userId: string): Promise<{ ok: boolean; error: string | null }> {
    const { ok, json } = await moderationCall("/block", { userId: String(userId) });
    if (!ok) return { ok: false, error: json.error || "That person couldn't be blocked. Please try again." };
    blockedAuthors.add(String(userId));
    moderationChanged();
    return { ok: true, error: null };
  },
  async unblock(userId: string): Promise<{ ok: boolean; error: string | null }> {
    const { ok, json } = await moderationCall("/unblock", { userId: String(userId) });
    if (!ok) return { ok: false, error: json.error || "That person couldn't be unblocked. Please try again." };
    blockedAuthors.delete(String(userId));
    moderationChanged();
    return { ok: true, error: null };
  },
  /** Account ids this person blocked, for a "Blocked people" list. */
  blockedIds(): string[] {
    void loadState();
    return [...blockedAuthors];
  },
  /** True when this item was reported by, or its author blocked by, this person. */
  isHidden(target: { contentId?: string | null; authorId?: string | null }): boolean {
    void loadState();
    return Boolean(
      (target.contentId && hiddenContent.has(String(target.contentId))) || (target.authorId && blockedAuthors.has(String(target.authorId))),
    );
  },
  /** The items this person should see: filter every list of posts, comments, messages or profiles through it. */
  visible<T>(items: T[], describe: (item: T) => { contentId?: string | null; authorId?: string | null }): T[] {
    return items.filter((item) => !moderation.isHidden(describe(item)));
  },
  /** Re-renders the calling component when something is reported or someone is blocked. */
  useChanges(): void {
    const [, setTick] = useState(0);
    useEffect(() => {
      const listener = () => setTick((n) => n + 1);
      moderationListeners.add(listener);
      void loadState();
      return () => {
        moderationListeners.delete(listener);
      };
    }, []);
  },
  /**
   * The menu behind a post's "..." button: Report, Block, Cancel. Asks for a
   * reason, sends the report, and says what happens next. Resolves true when
   * something was reported or someone was blocked.
   */
  openMenu(target: ModerationTarget & { authorName?: string }): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmBlock = () =>
        Alert.alert(
          "Block " + (target.authorName || "this person") + "?",
          "You won't see anything they post or send.",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Block",
              style: "destructive",
              onPress: () => {
                void moderation.block(String(target.authorId)).then((r) => {
                  Alert.alert(r.ok ? "Blocked" : "Couldn't block", r.ok ? "You won't see anything from them." : r.error || "");
                  resolve(r.ok);
                });
              },
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      const chooseReason = () =>
        Alert.alert(
          "Why are you reporting this?",
          undefined,
          [
            ...REASON_LABELS.map(([reason, label]) => ({
              text: label,
              onPress: () => {
                void moderation.report({ ...target, reason }).then((r) => {
                  Alert.alert(
                    r.ok ? "Thanks for reporting" : "Couldn't report",
                    r.ok ? "It's hidden for you now, and it will be reviewed within 24 hours." : r.error || "",
                  );
                  resolve(r.ok);
                });
              },
            })),
            { text: "Cancel", style: "cancel" as const, onPress: () => resolve(false) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      Alert.alert(
        target.kind ? "This " + target.kind : "Options",
        undefined,
        [
          { text: "Report", onPress: chooseReason },
          ...(target.authorId ? [{ text: "Block " + (target.authorName || "this person"), style: "destructive" as const, onPress: confirmBlock }] : []),
          { text: "Cancel", style: "cancel" as const, onPress: () => resolve(false) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  },
  /**
   * Checks text for objectionable content before it is posted where others
   * see it. { allowed: false } means don't post it; show the error sentence.
   */
  async check(text: string): Promise<{ allowed: boolean; error: string | null }> {
    try {
      const res = await fetch(BOREL_MODERATION + "/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...borelHeaders() },
        body: JSON.stringify({ text: String(text || "").slice(0, 20000) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.allowed === false) {
        return { allowed: false, error: "This can't be posted because it may break the community rules. Please change it and try again." };
      }
      return { allowed: true, error: null };
    } catch {
      return { allowed: true, error: null };
    }
  },
};
