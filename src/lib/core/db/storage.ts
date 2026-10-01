import { BOREL_STORAGE, BOREL_ACCOUNT, borelHeaders } from "./config";
import { authHeader } from "./auth";
import { looksPlain, messageOf, refusalOf, noteRefusal, CLOUD_NEUTRAL } from "./errors";

type StorageResult<T> = { data: T; error: null } | { data: null; error: { message: string; detail?: string } };

const FILES_SAY = {
  save: "That file couldn't be saved, so please try again.",
  read: "That file couldn't be read, so try picking it again.",
  open: "That file couldn't be opened right now, so please try again.",
  remove: "That file couldn't be deleted right now, so please try again.",
  offline: "Couldn't reach this app's files, so check your connection and try again.",
  tooBig: "That file is too big to upload, so choose a smaller one.",
};

// The most one file may be (lib/cloudStorage.ts on Borel's side): a video may
// be far bigger than anything else, and the app's total storage still applies.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

async function storageCall<T>(action: string, body: unknown, failed: string = FILES_SAY.save): Promise<StorageResult<T>> {
  try {
    const bearer = await authHeader();
    const res = await fetch(BOREL_STORAGE + "/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders(), ...(bearer ? { Authorization: "Bearer " + bearer } : {}) },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const reason = refusalOf(res.status, json);
      if (reason) {
        noteRefusal(reason, "cloud");
        return { data: null, error: { message: CLOUD_NEUTRAL[reason] } };
      }
      const said = messageOf(json);
      return { data: null, error: { message: looksPlain(said) ? said.trim() : failed, detail: said || "status " + res.status } };
    }
    return { data: json as T, error: null };
  } catch (err) {
    return { data: null, error: { message: FILES_SAY.offline, detail: err instanceof Error ? err.message : undefined } };
  }
}

/** A Blob, a data: or file:// URI, the asset object pickImage() returns, or a video from ./borel-video. */
export type Uploadable = Blob | string | { uri: string; type?: string; mimeType?: string };

async function toBlob(file: Uploadable): Promise<Blob> {
  if (typeof Blob !== "undefined" && file instanceof Blob) return file;
  // A video picked in the preview carries the picked File itself.
  const picked = typeof file === "object" ? (file as { file?: unknown }).file : undefined;
  if (typeof Blob !== "undefined" && picked instanceof Blob) return picked;
  const uri = typeof file === "string" ? file : (file as { uri: string }).uri;
  const res = await fetch(uri);
  return await res.blob();
}

function contentTypeOf(file: Uploadable, blob: Blob): string {
  if (typeof file === "object" && !(typeof Blob !== "undefined" && file instanceof Blob)) {
    const declared = (file as { mimeType?: string; type?: string }).mimeType || (file as { type?: string }).type;
    if (declared) return declared;
  }
  if (blob.type) return blob.type;
  if (typeof file === "string" && file.startsWith("data:")) {
    const match = /^data:([^;,]+)/.exec(file);
    if (match) return match[1];
  }
  return "application/octet-stream";
}

/**
 * The bytes to the presigned URL. With `onProgress` it goes through
 * XMLHttpRequest, the one request on a phone and in a browser that reports how
 * much of the body has been sent; fetch cannot.
 */
function putBytes(url: string, blob: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<number> {
  if (!onProgress || typeof XMLHttpRequest === "undefined") {
    return fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob }).then((res) => res.status);
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(0.99, event.loaded / event.total));
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("the upload was interrupted"));
    xhr.onabort = () => reject(new Error("the upload was stopped"));
    xhr.send(blob);
  });
}

// The whole path as ONE URL segment (slashes become %2F), so Borel's route
// can take it as a single parameter and no wildcard is involved.
function encodePath(path: string): string {
  return encodeURIComponent(path);
}

/**
 * Files, spelled the way this app's code has always spelled them:
 * db.storage.from("avatars").upload(path, file). A "bucket" here is a folder
 * inside this app's own private store; there is nothing to create first. Store
 * the PATH you uploaded to, and turn it into a URL with getPublicUrl() when you
 * render it.
 */
export const storage = {
  from(bucket: string) {
    return {
      async upload(
        path: string,
        file: Uploadable,
        options: { contentType?: string; onProgress?: (fraction: number) => void } = {},
      ): Promise<StorageResult<{ path: string; fullPath: string }>> {
        let blob: Blob;
        try {
          blob = await toBlob(file);
        } catch (err) {
          return { data: null, error: { message: FILES_SAY.read, detail: err instanceof Error ? err.message : undefined } };
        }
        const contentType = options.contentType || contentTypeOf(file, blob);
        const limit = contentType.toLowerCase().startsWith("video/") ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
        if (blob.size > limit) return { data: null, error: { message: FILES_SAY.tooBig, detail: blob.size + " bytes" } };
        const signed = await storageCall<{ uploadUrl: string }>("presign", { bucket, path, contentType, size: blob.size });
        if (signed.error) return signed;
        try {
          const status = await putBytes(signed.data.uploadUrl, blob, contentType, options.onProgress);
          if (status < 200 || status >= 300) return { data: null, error: { message: FILES_SAY.save, detail: "upload status " + status } };
          if (options.onProgress) options.onProgress(1);
        } catch (err) {
          return { data: null, error: { message: FILES_SAY.offline, detail: err instanceof Error ? err.message : undefined } };
        }
        await storageCall("confirm", { bucket, path, contentType, size: blob.size });
        return { data: { path, fullPath: bucket + "/" + path }, error: null };
      },
      /** A URL that renders in <Image>. Synchronous, so it can be used inline in JSX. */
      getPublicUrl(path: string): { data: { publicUrl: string } } {
        return { data: { publicUrl: BOREL_STORAGE + "/o/" + encodeURIComponent(bucket) + "/" + encodePath(path) } };
      },
      async createSignedUrl(path: string, expiresIn = 3600): Promise<StorageResult<{ signedUrl: string }>> {
        const r = await storageCall<{ url: string }>("sign", { bucket, path, expiresIn }, FILES_SAY.open);
        return r.error ? r : { data: { signedUrl: r.data.url }, error: null };
      },
      async remove(paths: string[]): Promise<StorageResult<{ name: string }[]>> {
        const r = await storageCall<{ removed: string[] }>("remove", { bucket, paths }, FILES_SAY.remove);
        return r.error ? r : { data: r.data.removed.map((name) => ({ name })), error: null };
      },
    };
  },
};

/**
 * The signed-in person's own account. `delete()` removes it on the server:
 * the sign-in itself, every row of theirs in this app's tables, and every file
 * they uploaded. Use it through `deleteAccount()` in core/auth, which also
 * signs the device out.
 */
export const account = {
  async delete(): Promise<{ ok: boolean; error: string | null }> {
    try {
      const bearer = await authHeader();
      if (!bearer || bearer === "bps_anon") return { ok: false, error: "Sign in again to delete your account." };
      const res = await fetch(BOREL_ACCOUNT + "/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...borelHeaders(), Authorization: "Bearer " + bearer },
        body: "{}",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return { ok: false, error: json.error || "Your account couldn't be deleted. Please try again." };
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    }
  },
};
