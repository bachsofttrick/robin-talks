import { backendDataUrl } from "./config";
import { sessionCookieHeader } from "./auth";
import { messageOf } from "./errors";

// On a phone the app's tables live behind the backend's /api/data router, which
// authenticates with the better-auth session cookie. The browser preview keeps
// Borel's db.from; these functions are the native replacement.

export interface LearnerProfile {
  user_id: string;
  display_name: string | null;
  level: string | null;
}

export interface PracticeSessionRow {
  id: string;
  user_id: string;
  scenario_id: string | null;
  transcript: unknown;
  debrief: string | null;
  summary: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface MemoryRow {
  id: string;
  user_id: string;
  kind: string | null;
  content: string | null;
  created_at: string | null;
}

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string | null;
}

type DataError = { message: string };
type DataResult<T> = { data: T | null; error: DataError | null };

async function request<T>(path: string, init?: RequestInit): Promise<DataResult<T>> {
  const base = backendDataUrl();
  if (!base) return { data: null, error: { message: "The backend is not configured." } };
  const cookie = await sessionCookieHeader();
  try {
    const res = await fetch(base + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...init?.headers,
      },
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { data: (json ?? null) as T | null, error: null };
    return { data: null, error: { message: messageOf(json) ?? "Request failed (" + res.status + ")." } };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Network error." } };
  }
}

export function getProfile(): Promise<DataResult<LearnerProfile>> {
  return request<LearnerProfile>("/profile");
}

export function saveProfile(displayName: string, level: string): Promise<DataResult<LearnerProfile>> {
  return request<LearnerProfile>("/profile", {
    method: "PUT",
    body: JSON.stringify({ display_name: displayName, level }),
  });
}

export function createSession(scenarioId: string): Promise<DataResult<{ id: string }>> {
  return request<{ id: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
}

export function getOpenSession(): Promise<DataResult<PracticeSessionRow>> {
  return request<PracticeSessionRow>("/sessions/open");
}

export function getRecentSessions(): Promise<DataResult<PracticeSessionRow[]>> {
  return request<PracticeSessionRow[]>("/sessions/recent");
}

export function getSession(id: string): Promise<DataResult<PracticeSessionRow>> {
  return request<PracticeSessionRow>("/sessions/" + encodeURIComponent(id));
}

export function updateSession(
  id: string,
  patch: { transcript?: unknown; debrief?: string; summary?: string; ended_at?: string },
): Promise<DataResult<PracticeSessionRow>> {
  return request<PracticeSessionRow>("/sessions/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteAllSessions(): Promise<DataResult<null>> {
  return request<null>("/sessions", { method: "DELETE" });
}

export function listMemory(): Promise<DataResult<MemoryRow[]>> {
  return request<MemoryRow[]>("/memory");
}

export function addMemory(kind: string, content: string): Promise<DataResult<{ id: string }>> {
  return request<{ id: string }>("/memory", {
    method: "POST",
    body: JSON.stringify({ kind, content }),
  });
}

export function deleteAllMemory(): Promise<DataResult<null>> {
  return request<null>("/memory", { method: "DELETE" });
}

export function upsertProfile(input: {
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}): Promise<DataResult<ProfileRow>> {
  return request<ProfileRow>("/profiles", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
