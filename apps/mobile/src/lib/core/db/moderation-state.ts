// The cache behind moderation: what this person reported and who they blocked.
// It lives apart from the moderation client so auth can forget a person's state
// on sign-in and sign-out without importing the client, which needs auth for
// its bearer token - the two would import each other.

export type ModerationStateResult = { ok: boolean; json: any };

export const hiddenContent = new Set<string>();
export const blockedAuthors = new Set<string>();
export const moderationListeners = new Set<() => void>();

let moderationEpoch = 0;
// Bumped whenever the person may have changed, so a load still on its way for
// the last person cannot fill the sets in for the next one.
let moderationLoaded: Promise<void> | null = null;

export function moderationChanged(): void {
  for (const listener of moderationListeners) listener();
}

/** What one person reported and blocked is theirs: forgotten on every sign-in and sign-out, and loaded again for whoever is next. */
export function forgetModeration(): void {
  moderationEpoch++;
  moderationLoaded = null;
  if (hiddenContent.size === 0 && blockedAuthors.size === 0) return;
  hiddenContent.clear();
  blockedAuthors.clear();
  moderationChanged();
}

export function loadModeration(fetchState: () => Promise<ModerationStateResult>): Promise<void> {
  if (!moderationLoaded) {
    const epoch = moderationEpoch;
    moderationLoaded = fetchState().then(({ ok, json }) => {
      if (epoch !== moderationEpoch) return;
      if (!ok) {
        moderationLoaded = null;
        return;
      }
      for (const id of json.reported || []) hiddenContent.add(String(id));
      for (const id of json.blocked || []) blockedAuthors.add(String(id));
      moderationChanged();
    });
  }
  return moderationLoaded;
}
