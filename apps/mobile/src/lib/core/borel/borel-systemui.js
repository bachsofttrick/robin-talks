// Real-device counterpart to src/SystemUI/runtime/shimSource.ts. On a
// physical phone via Expo Go there's no parent browser window to bridge
// permission/UI-simulation requests to — this file backs each exported
// function with the real Expo API for that capability instead, so generated
// code that calls these gets genuine device behavior here: a real OS
// permission prompt, a real Face ID scan, a real photo library/camera, a
// real clipboard read, a real local notification.
//
// This file is compiled into real App Store builds as well (easBuild.ts
// copies it into every project it assembles), so "does the right thing on a
// real device" has to mean the right thing in a shipped binary too. Payments
// are where those two diverge, and the split is deliberate:
//
//   requestPurchase()  — REAL. StoreKit 2 through expo-iap in a compiled
//     build; a simulated success only in the browser preview and in Expo Go,
//     which Apple never ships to end users. In a build it either charges or
//     returns { status: "failure" } — never a success that didn't happen.
//     See the long comment above the implementation.
//
//   requestApplePay()  — NOT AVAILABLE. It answers failure on every surface,
//     and a build that names it is still refused by
//     server/src/scripts/assertNoPreviewCode.ts and
//     metro-service/src/previewGuard.ts, which the EAS runner executes against
//     the exact source tree it is about to compile. Apple Pay needs a merchant
//     identifier provisioned per app; Borel doesn't do that yet, so no build
//     containing it is allowed out.
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";
// A namespace import on purpose: only useIncomingLink reads it, when a screen
// calls it, so nothing here depends on React at the moment this file loads.
import * as React from "react";
import { Linking, Platform, Share } from "react-native";
import { File } from 'expo-file-system';

// --- Native modules, loaded on first use -----------------------------------
//
// An App Store build links only the Expo modules this app's own code uses: the
// EAS runner excludes the rest from autolinking (metro-service/src/easBuild.ts),
// so that prebuild's auto-applied config plugins cannot write permission strings
// and entitlements into a binary that never uses them. The JavaScript of an
// excluded package is still bundled, and most of them look up their native half
// the moment they are evaluated and throw when it is missing. These used to be
// imported at the top of this file, which ran every one of them while the app
// was starting: a launch crash for any app that imported this file for a share
// sheet in a build without, say, expo-notifications.
//
// So nothing optional is imported at the top. Each package is required the first
// time a function needs it, and only after expo-modules-core says its native half
// is in this binary. Asking first is the part that matters: metro-runtime reports
// a module that throws while loading outside app start-up as a FATAL error
// (guardedLoadModule), straight past any try/catch around the require, so a
// missing module has to be recognised before require runs. A function whose
// module is absent answers with its own honest "unavailable" result.
// server/src/__tests__/excludableModulesLazy.test.ts holds every runtime module
// to this.
const loadedNativeModules = new Map();

function nativeModule(nativeName, load, web = false) {
  if (loadedNativeModules.has(nativeName)) return loadedNativeModules.get(nativeName);
  let loaded = null;
  try {
    if ((web && Platform.OS === "web") || requireOptionalNativeModule(nativeName)) loaded = load() ?? null;
  } catch {
    loaded = null;
  }
  loadedNativeModules.set(nativeName, loaded);
  return loaded;
}

const imagePickerModule = () => nativeModule("ExponentImagePicker", () => require("expo-image-picker"));
const imageManipulatorModule = () => nativeModule("ExpoImageManipulator", () => require("expo-image-manipulator"));
const localAuthenticationModule = () => nativeModule("ExpoLocalAuthentication", () => require("expo-local-authentication"));
const notificationsModule = () => nativeModule("ExpoNotificationScheduler", () => require("expo-notifications"));
const clipboardModule = () => nativeModule("ExpoClipboard", () => require("expo-clipboard"));
const locationModule = () => nativeModule("ExpoLocation", () => require("expo-location"));
const audioModule = () => nativeModule("ExpoAudio", () => require("expo-audio"), true);
const speechModule = () => nativeModule("ExpoSpeech", () => require("expo-speech"), true);

// Registered once at module load (this file is always imported, see App.js)
// so a locally-scheduled notification actually shows a banner while the app
// is in the foreground — Expo's own default handler suppresses foreground
// notifications otherwise, which would make showNotification() below look
// broken even though it scheduled successfully. Only when this build links
// expo-notifications: without it, nothing in this app schedules one either.
{
  const Notifications = notificationsModule();
  if (Notifications) {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch {
      // Foreground banners stay Expo's default; scheduling still works.
    }
  }
}

export async function requestPermission(kind) {
  try {
    let result;
    switch (kind) {
      case "camera":
        result = await imagePickerModule()?.requestCameraPermissionsAsync();
        break;
      case "photos":
        result = await imagePickerModule()?.requestMediaLibraryPermissionsAsync();
        break;
      case "notifications":
        result = await notificationsModule()?.requestPermissionsAsync();
        break;
      case "microphone":
        result = await audioModule()?.requestRecordingPermissionsAsync();
        break;
      case "location":
        result = await locationModule()?.requestForegroundPermissionsAsync();
        break;
      default:
        return "deny";
    }
    // No result: this build does not link the module, so the permission cannot be given.
    return result?.granted ? "allow" : "deny";
  } catch {
    return "deny";
  }
}

// The standing answer for one permission, WITHOUT raising a prompt:
// "granted", "denied" or "undetermined" (never asked yet). requestPermission
// always asks, so a settings switch had no way to show its real state when a
// screen opened without prompting on the spot.
export async function getPermissionStatus(kind) {
  try {
    let result;
    switch (kind) {
      case "camera":
        result = await imagePickerModule()?.getCameraPermissionsAsync();
        break;
      case "photos":
        result = await imagePickerModule()?.getMediaLibraryPermissionsAsync();
        break;
      case "notifications":
        result = await notificationsModule()?.getPermissionsAsync();
        break;
      case "microphone":
        result = await audioModule()?.getRecordingPermissionsAsync();
        break;
      case "location":
        result = await locationModule()?.getForegroundPermissionsAsync();
        break;
      default:
        return "denied";
    }
    if (!result) return "denied";
    if (result.granted) return "granted";
    return result.status === "denied" ? "denied" : "undetermined";
  } catch {
    return "denied";
  }
}

// These three mean this phone cannot do Face ID or Touch ID at all right now,
// not that a scan failed. Reported as "failed" they locked people out of any
// screen that opens only on "success", with nothing they could do about it.
const BIOMETRIC_UNAVAILABLE_ERRORS = new Set(["not_enrolled", "not_available", "passcode_not_set"]);

export async function requestFaceID() {
  try {
    const LocalAuthentication = localAuthenticationModule();
    if (!LocalAuthentication) return "unavailable";
    // NONE means no biometrics AND no passcode. A phone without Face ID or
    // fingerprint hardware but with a passcode still confirms with the
    // passcode (authenticateAsync falls back to it), so no hardware alone is
    // not "unavailable": reading it that way turned such a lock off.
    const none = LocalAuthentication.SecurityLevel ? LocalAuthentication.SecurityLevel.NONE : 0;
    if ((await LocalAuthentication.getEnrolledLevelAsync()) === none) return "unavailable";
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm your identity" });
    if (result.success) return "success";
    if (result.error === "user_cancel" || result.error === "system_cancel" || result.error === "app_cancel") {
      return "cancelled";
    }
    if (BIOMETRIC_UNAVAILABLE_ERRORS.has(result.error)) return "unavailable";
    return "failed";
  } catch {
    return "failed";
  }
}

// The longest edge any photo leaves here with, and the JPEG quality it is
// re-encoded at.
//
// This is not a nicety. A generated app's only way to send a photo anywhere is
// Borel's proxy, and Vercel rejects a request body over ~4.5MB at the edge —
// before any of Borel's code runs, with an opaque 413. A modern phone camera
// produces 3-8MB per shot, which base64s to well past that, so an unbounded
// photo could never be sent at all. There is no canvas in React Native and the
// generated app has no image library, so if this function doesn't do it, the
// app it belongs to has no way to. 1024px at q0.6 lands around 100-300KB.
const MAX_PHOTO_EDGE = 1024;
const PHOTO_QUALITY = 0.6;

// Normalises whatever expo-image-picker returned into the one asset shape both
// surfaces promise, with `base64` already present. Generated code must never
// have to convert a uri — the browser APIs it would reach for to do that
// (`new Image()`, canvas, `URL.createObjectURL`) do not exist here.
async function toBorelAsset(asset) {
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  let out = asset;

  // Only re-encode when it would actually change something. Re-running the
  // manipulator on an already-small image costs time and loses quality for
  // nothing.
  if (longEdge > MAX_PHOTO_EDGE || !asset.base64) {
    try {
      const manipulator = imageManipulatorModule();
      if (!manipulator) throw new Error("No image manipulator in this build");
      const context = manipulator.ImageManipulator.manipulate(asset.uri);
      if (longEdge > MAX_PHOTO_EDGE) {
        // Constrain the long edge and let the other follow, so portrait and
        // landscape both come out bounded without distorting the aspect ratio.
        const portrait = (asset.height ?? 0) >= (asset.width ?? 0);
        context.resize(portrait ? { height: MAX_PHOTO_EDGE } : { width: MAX_PHOTO_EDGE });
      }
      const rendered = await context.renderAsync();
      out = await rendered.saveAsync({ format: manipulator.SaveFormat.JPEG, compress: PHOTO_QUALITY, base64: true });
    } catch {
      // Fall through with the original. A photo without base64 is worse than
      // one with, but it is much better than the picker appearing to fail.
      out = asset;
    }
  }

  const base64 = out.base64 ?? asset.base64 ?? null;
  return {
    // A data URL, not the `file://` path expo-image-picker hands back — so this
    // is byte-for-byte the same kind of value the in-browser preview returns,
    // and code written against one surface cannot behave differently on the
    // other. It also removes the single worst failure here: `uri` is the field
    // a photo is mostly talked about by, so it is what gets attached to an AI
    // request, and a `file://` path in that field means the phone kept the
    // bytes and the provider answered "Base64 string of provided image cannot
    // be decoded" - a message naming neither the file nor the mistake. Renders
    // through <Image source={{ uri }} /> exactly as the old value did.
    uri: base64 ? `data:image/jpeg;base64,${base64}` : (out.uri ?? asset.uri),
    base64,
    width: out.width ?? asset.width ?? 0,
    height: out.height ?? asset.height ?? 0,
    type: "image",
    mimeType: "image/jpeg",
    fileName: asset.fileName ?? "photo.jpg",
    // Real bytes, derived from the base64 we are actually handing over — base64
    // carries 3 bytes per 4 characters, minus any padding.
    fileSize: base64 ? Math.floor((base64.length * 3) / 4) : (asset.fileSize ?? 0),
  };
}

export async function pickImage() {
  try {
    const ImagePicker = imagePickerModule();
    if (!ImagePicker) return null;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: PHOTO_QUALITY,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    // Still a uri string, which is what the contract has always promised and
    // what existing generated apps read. pickImageAsset below is the way to
    // get the bytes.
    const asset = await toBorelAsset(result.assets[0]);
    return asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
  } catch {
    return null;
  }
}

// The full asset for the photo library, matching launchCamera's shape — for
// anything that needs the bytes rather than something to render.
export async function pickImageAsset() {
  try {
    const ImagePicker = imagePickerModule();
    if (!ImagePicker) return { canceled: true, assets: null };
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { canceled: true, assets: null };
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: PHOTO_QUALITY,
    });
    if (result.canceled || !result.assets?.[0]) return { canceled: true, assets: null };
    return { canceled: false, assets: [await toBorelAsset(result.assets[0])] };
  } catch {
    return { canceled: true, assets: null };
  }
}

export async function launchCamera(options) {
  try {
    const ImagePicker = imagePickerModule();
    if (!ImagePicker) return { canceled: true, assets: null };
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { canceled: true, assets: null };
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: PHOTO_QUALITY,
      allowsEditing: options?.allowsEditing ?? false,
    });
    if (result.canceled || !result.assets?.[0]) return { canceled: true, assets: null };
    return { canceled: false, assets: [await toBorelAsset(result.assets[0])] };
  } catch {
    return { canceled: true, assets: null };
  }
}

// --- Microphone -----------------------------------------------------------
//
// Two ways in, one result. `recordAudio()` is the one-call version (the
// in-browser preview shows a system recorder sheet for it; on a phone it
// simply records for the requested duration, because the real device's
// recorder UI is the app's own to draw). `startRecording()`/`stopRecording()`
// are for an app that draws its own record button, timer and level meter.
//
// Both produce the identical AudioRecording object, and both produce the same
// object the preview does — see src/SystemUI/Microphone/states.ts, which is
// held to this file by server/src/__tests__/microphoneContract.test.ts.

const MAX_RECORDING_MS = 120000;
// What recordAudio() captures when it is given no duration. Short on
// purpose: recordAudio is a FIXED-LENGTH capture, so its default is how long
// the app will sit there, and two minutes of silence is not a default anyone
// wants. startRecording/stopRecording is the path for a recording the user
// ends themselves; MAX_RECORDING_MS is only that path's safety ceiling.
const DEFAULT_CAPTURE_MS = 15000;
// Base64 is 4 characters per 3 bytes and the proxy's whole request budget is
// 4.5 MB, so about 3 MB of audio is the most that can ever be sent onward. A
// longer recording still records and still plays; it just comes back without
// `base64`, which beats producing a request that is rejected later with an
// error naming neither Borel nor the provider.
const MAX_BASE64_BYTES = 3 * 1024 * 1024;

let activeRecorder = null;
let recordingStartedAt = 0;
let recordingLimit = null;

// expo-audio's documented entry point is the useAudioRecorder hook, which
// cannot be used here: this is a plain module, not a component, and the app
// calls these functions from event handlers. `AudioModule.AudioRecorder` is
// the same class that hook constructs, and importing from "expo-audio" is what
// applies the option-normalising prototype patch the hook relies on.
function createRecorder(audio, options) {
  const { AudioModule, RecordingPresets } = audio;
  // Native exposes AudioModule.AudioRecorder; expo-audio's web build exposes
  // AudioRecorderWeb instead, so resolve whichever this platform has once.
  const Recorder = AudioModule.AudioRecorder ?? AudioModule.AudioRecorderWeb;
  // Metering has to be requested up front. Without isMeteringEnabled the
  // status never carries a level, and the pause detector that reads
  // getRecordingStatus().metering has nothing to work with.
  if (options?.quality !== "low")
    return new Recorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  // expo-audio's low preset records Android as AMR in a 3GP file: not the
  // audio/m4a this shim reports, and not audio Borel AI can hear. AAC in M4A,
  // as on iOS, at the preset's own low bit rate, is both.
  const low = RecordingPresets.LOW_QUALITY;
  return new Recorder({
    ...low,
    // Same flag as the high preset above, so this preset reports a level too.
    isMeteringEnabled: true,
    android: { ...(low && low.android), extension: ".m4a", outputFormat: "mpeg4", audioEncoder: "aac" },
  });
}

// The recorder hands back a file:// path. The bytes are read
// the way React Native itself can: fetch the local file and read the blob.
// Non-fatal by design — a recording that cannot be encoded is still one that
// plays.
async function readBase64(uri, size) {
  if (size > MAX_BASE64_BYTES) return "";
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const comma = String(dataUrl).indexOf(",");
    return comma === -1 ? "" : String(dataUrl).slice(comma + 1);
  } catch {
    return "";
  }
}

async function finalizeRecording(recorder, durationMs) {
  const uri = recorder.uri;
  if (!uri) return null;
  let size = 0;
  let mimeType = "audio/m4a";
  let base64;
  try {
    const protocol = (new URL(uri)).protocol
    // Expo Go use file:// protocol, which does not work on fetch()
    if (protocol === "file:") {
      const response = new File(uri);
      size = response.size;
      // Get the actual media type
      if (typeof response.type === "string" && response.type.startsWith("audio/")) mimeType = response.type;
      base64 = await response.base64();
    } else {
      const response = await fetch(uri);
      const blob = await response.blob();
      size = blob.size;
      // The web recorder produces audio/webm rather than the native audio/m4a,
      // so trust the blob's own type when it names an audio format.
      if (typeof blob.type === "string" && blob.type.startsWith("audio/")) mimeType = blob.type;
      base64 = await readBase64(uri, size);
    }
  } catch {
    size = 0;
  }
  return {
    // A playable handle, NOT something to send: on a phone this is a file://
    // path and in the preview it is a data: URL. `base64` is the field that
    // travels to an API.
    uri,
    base64,
    durationMs,
    mimeType,
    fileName: mimeType === "audio/webm" ? "recording.webm" : "recording.m4a",
    fileSize: size || (base64 ? Math.floor((base64.length * 3) / 4) : 0),
  };
}

function clearLimit() {
  if (recordingLimit !== null) clearTimeout(recordingLimit);
  recordingLimit = null;
}

export async function startRecording(options) {
  if (activeRecorder) return { started: true };
  try {
    const audio = audioModule();
    if (!audio) return { started: false, reason: "unavailable" };
    const permission = await audio.requestRecordingPermissionsAsync();
    if (!permission.granted) return { started: false, reason: "denied" };
    // Without this, iOS records under the wrong session category and the file
    // can come back silent — audible in the app, invisible in the code.
    await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const recorder = createRecorder(audio, options);
    await recorder.prepareToRecordAsync();
    recorder.record();
    activeRecorder = recorder;
    recordingStartedAt = Date.now();
    const limit = Math.max(1000, options?.maxDurationMs ?? MAX_RECORDING_MS);
    clearLimit();
    recordingLimit = setTimeout(() => {
      // Stops itself at the ceiling. Whatever was captured is kept, waiting in
      // `activeRecorder` for the app's own stopRecording() call.
      if (activeRecorder) {
        try {
          activeRecorder.stop();
        } catch {
          // Already stopped.
        }
      }
    }, limit);
    return { started: true };
  } catch {
    activeRecorder = null;
    clearLimit();
    return { started: false, reason: "unavailable" };
  }
}

export async function stopRecording() {
  const recorder = activeRecorder;
  if (!recorder) return null;
  activeRecorder = null;
  clearLimit();
  const durationMs = Date.now() - recordingStartedAt;
  try {
    await recorder.stop();
  } catch {
    // Already stopped by the duration limit; the file is still there.
  }
  try {
    // expo-audio sets the whole mode at once, and a field left out goes back
    // to its default. playsInSilentMode stays on, as it was while recording:
    // off, a voice note played back (or words read aloud) right after is
    // silent on a phone whose ring switch is set to silent.
    await audioModule()?.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  } catch {
    // Leaving the session in recording mode only affects playback volume.
  }
  try {
    return await finalizeRecording(recorder, durationMs);
  } catch {
    return null;
  }
}

export function cancelRecording() {
  const recorder = activeRecorder;
  activeRecorder = null;
  clearLimit();
  if (!recorder) return;
  try {
    recorder.stop();
  } catch {
    // Nothing to stop.
  }
  audioModule()
    ?.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    .catch(() => {});
}

export function getRecordingStatus() {
  if (!activeRecorder) return { isRecording: false, durationMs: 0, metering: 0 };
  let state = null;
  try {
    state = activeRecorder.getStatus();
  } catch {
    state = null;
  }
  return {
    isRecording: state ? Boolean(state.isRecording) : true,
    durationMs: Date.now() - recordingStartedAt,
    // expo-audio reports metering in dBFS (roughly -160 silent, 0 loudest) and
    // only when it was asked for. Normalised to the same 0..1 the preview
    // reports, so one level meter works on both surfaces.
    metering: state && typeof state.metering === "number" ? Math.max(0, Math.min(1, (state.metering + 60) / 60)) : 0,
  };
}

// A fixed-length capture, and deliberately not a system UI.
//
// The camera has a real one to present here - launchCamera() opens Apple's
// own camera. iOS has no equivalent system recorder for audio, so there is
// nothing to show and this simply records for the requested time. The
// in-browser preview DOES draw a recorder sheet for the same call, with a
// stop button that ends it early; that is the one place these two surfaces
// differ, it cannot be papered over, and it is stated in the contract so an
// app that needs the user to control the ending uses start/stop instead.
export async function recordAudio(options) {
  const started = await startRecording(options);
  if (!started.started) return { canceled: true, recording: null };
  const duration = Math.max(1000, options?.maxDurationMs ?? DEFAULT_CAPTURE_MS);
  await new Promise((resolve) => setTimeout(resolve, duration));
  const recording = await stopRecording();
  return recording ? { canceled: false, recording } : { canceled: true, recording: null };
}

// --- Reading aloud ----------------------------------------------------------
//
// speak(text, { language, rate, pitch, onDone }) says words out loud in the
// phone's own voice: expo-speech, which is AVSpeechSynthesizer on iOS and the
// system's text-to-speech engine on Android. No network, no AI, no cost.
// stopSpeaking() stops it; isSpeaking() says whether it is still talking. The
// in-browser preview does the same with the browser's own speechSynthesis
// (borel-systemui.web.js), so a "listen" button really speaks in both places.
//
// One voice at a time: a new speak() stops what was being said, which is what
// tapping "listen" again means. speak() resolves when the words end, however
// they end ("done", "stopped" or "failed"), and onDone is called once with the
// same word, so a screen's "speaking" state always comes back.

// Android's engine refuses a text longer than 4,000 characters, so a long text
// is handed over in pieces that end at a sentence.
const SPEECH_PIECE_CHARS = 3000;
const speechFinishers = new Set();

function speechPieces(text, max) {
  const pieces = [];
  let rest = text;
  while (rest.length > max) {
    let cut = -1;
    for (let i = max; i > max / 2; i--) {
      // . ! ? a line break, or the ideographic full stop.
      const code = rest.charCodeAt(i - 1);
      if (code === 46 || code === 33 || code === 63 || code === 10 || code === 12290) {
        cut = i;
        break;
      }
    }
    if (cut === -1) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  if (rest.trim()) pieces.push(rest.trim());
  return pieces.filter(Boolean);
}

function speechNumber(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
}

// iOS mutes speech with the ring/silent switch unless the audio session plays
// in silent mode, and a lesson read aloud to a phone on silent says nothing.
// expo-audio sets the whole mode at once, so a recording in progress is kept.
async function speechAudioMode() {
  try {
    await audioModule()?.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: activeRecorder !== null });
  } catch {
    // Speech still plays, only not on a phone switched to silent.
  }
}

export async function speak(text, options) {
  const words = text == null ? "" : String(text).trim();
  const onDone = options && typeof options.onDone === "function" ? options.onDone : null;
  const wasSpeaking = speechFinishers.size > 0;
  for (const stop of Array.from(speechFinishers)) stop("stopped");

  let settled = false;
  let guard = null;
  let resolveEnd = () => {};
  const ended = new Promise((resolve) => {
    resolveEnd = resolve;
  });
  const finish = (status) => {
    if (settled) return;
    settled = true;
    speechFinishers.delete(finish);
    if (guard !== null) clearTimeout(guard);
    try {
      if (onDone) onDone(status);
    } catch {
      // A throwing callback must not leave the caller waiting.
    }
    resolveEnd(status);
  };
  if (!words) {
    finish("done");
    return ended;
  }
  speechFinishers.add(finish);
  try {
    const Speech = speechModule();
    if (!Speech) throw new Error("No speech engine in this build");
    if (wasSpeaking) {
      await Speech.stop();
      // iOS can drop an utterance handed over in the same moment as a stop.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await speechAudioMode();
    if (settled) return ended;
    const rate = speechNumber(options && options.rate, 0.1, 2);
    const pitch = speechNumber(options && options.pitch, 0.5, 2);
    const language = options && typeof options.language === "string" && options.language.trim() ? options.language.trim() : undefined;
    const pieces = speechPieces(words, SPEECH_PIECE_CHARS);
    // Far longer than the words take even slowly, so a callback the engine
    // never sends cannot leave a screen saying "speaking" for good.
    guard = setTimeout(() => finish("done"), 15000 + (words.length * 250) / (rate || 1));
    pieces.forEach((piece, index) => {
      Speech.speak(piece, {
        language,
        rate,
        pitch,
        onDone: index === pieces.length - 1 ? () => finish("done") : undefined,
        onStopped: () => finish("stopped"),
        onError: () => finish("failed"),
      });
    });
  } catch {
    finish("failed");
  }
  return ended;
}

export async function stopSpeaking() {
  for (const stop of Array.from(speechFinishers)) stop("stopped");
  try {
    await speechModule()?.stop();
  } catch {
    // Nothing was speaking, or there is no voice on this phone.
  }
}

export function isSpeaking() {
  return speechFinishers.size > 0;
}

// Apple Pay can't be published from Borel yet. A real integration needs a
// merchant identifier and an entitlement provisioned per app against the
// author's own Apple Developer account, which Borel doesn't do, so
// previewGuard.ts and assertNoPreviewCode.ts refuse any store build that uses
// it, and the code contract tells the model never to call it.
//
// It answers failure EVERYWHERE, Expo Go included. It used to simulate a
// success there (and the browser sheet did too), which let a whole checkout be
// built, tried on a phone and trusted for an app no build of which may leave:
// the preview showed a feature that could not ship.
export function requestApplePay(_payload) {
  // Borel's preview resolved this to a fake success so the flow could be
  // demonstrated without money moving. That is not safe in a real build, so
  // this exported copy refuses instead of pretending.
  //
  // To make it real, wire up a payment processor's own Apple Pay integration and return its genuine result.
  console.warn(
    "[borel] requestApplePay() is not implemented in this exported project. " +
      "Wire up a payment processor's own Apple Pay integration before shipping — see README.md."
  );
  return Promise.resolve({ status: "failure" });
}

// --- In-App Purchase: real StoreKit 2, via expo-iap ------------------------
//
// requestPurchase() IS real now, and the rule it obeys is worth stating in full
// because the guard that used to keep this file out of every build was relaxed
// on the strength of it:
//
//   A simulated success happens in exactly two places — the browser preview
//   (borel-systemui.web.js) and Expo Go. In a compiled binary this either
//   performs a real StoreKit 2 purchase or resolves { status: "failure" }. It
//   never reports a success that did not happen.
//
// server/src/__tests__/iapContract.test.ts enforces that mechanically: no
// `status: "success"` literal may appear below outside the IS_EXPO_GO branch.
//
// Written against the signatures in node_modules/expo-iap/build/*.d.ts at
// version 5.4.0, not against the docs — the purchase API changed shape between
// minors, and the iOS request key is `request.apple.sku` (NOT `request.ios`,
// which fails silently). Re-read the typings before bumping the version.

// Expo Go is a prebuilt client with a fixed native module set, so expo-iap's
// native half does not exist there no matter what package.json says. Detected
// explicitly rather than inferred from a failed require: guessing wrong in the
// other direction — treating a real build as Expo Go — is the one failure mode
// that would ship an app confirming payments it never took.
const IS_EXPO_GO =
  Constants?.executionEnvironment === "storeClient" || Constants?.appOwnership === "expo";

// Not a static import. This module is imported by every generated app, and a
// top-level `import "expo-iap"` would turn "this app has no paywall" into a
// launch crash everywhere the native module is absent. Loaded through
// nativeModule like every other optional package (see the top of this file).
function loadIap() {
  if (IS_EXPO_GO) return null;
  return nativeModule("ExpoIap", () => require("expo-iap"));
}

// Written into app.json by server/src/lib/expoAppConfig.ts from the products
// that really exist in App Store Connect:
//   { productIdPrefix, products: [{ slug, productId, type }] }
const IAP_MANIFEST = Constants?.expoConfig?.extra?.borelIap ?? null;

// Generated code passes the bare slug it declared in `iapProducts`
// ("premium-plan"); StoreKit only knows the fully-qualified id
// ("com.acme.tally.iap.premium_plan"). The manifest is preferred over deriving
// the prefix because it also carries `type`, and `type` is what decides
// isConsumable on finishTransaction — get that wrong and either a consumable
// can never be re-bought, or Apple re-delivers a non-consumable forever.
function resolveProduct(input) {
  const raw = String(input ?? "");
  const listed = IAP_MANIFEST?.products?.find((p) => p.slug === raw || p.productId === raw);
  if (listed) return listed;
  const prefix =
    IAP_MANIFEST?.productIdPrefix ??
    (Constants?.expoConfig?.ios?.bundleIdentifier
      ? `${appleIdPart(Constants.expoConfig.ios.bundleIdentifier)}.iap.`
      : "");
  if (!prefix || raw.includes(".")) return { slug: raw, productId: raw, type: null };
  const productId = `${prefix}${appleIdPart(raw) || "product"}`.slice(0, 100).replace(/[_.]+$/, "");
  return { slug: raw, productId, type: null };
}

// Apple's API takes only letters, digits, underscores and periods in a product
// id, so a slug's hyphens are underscores there. The same rule as
// appleProductId in server/src/lib/monetization.ts, which named the product.
function appleIdPart(text) {
  return String(text)
    .replace(/[^A-Za-z0-9_.]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/[.]{2,}/g, ".")
    .replace(/^[_.]+|[_.]+$/g, "");
}

const SUBSCRIPTION_TYPES = new Set(["auto_renewable_subscription"]);
// Apple's non-renewing subscription is bought through the ordinary in-app
// product flow, and has to be finished as a consumable or the buyer can never
// renew it by buying again.
const CONSUMABLE_TYPES = new Set(["consumable", "non_renewing_subscription"]);

// A product's type reaches this file in two spellings, and it has to answer to
// both. The manifest carries Apple's own enum — "AUTO_RENEWABLE_SUBSCRIPTION" —
// because that is how App Store Connect names it and how the app_products row
// it is written from stores it; generated code passes the lowercase spelling
// the code contract teaches. Comparing only the lowercase one meant every
// product that came from the manifest read as neither a subscription nor a
// consumable, and both halves of that were silent:
//
//   a subscription was asked of StoreKit as an "in-app" product, which answers
//   nothing, so every real subscription purchase failed as "not_found";
//   a consumable was finished as a non-consumable, so it could never be
//   bought a second time.
const normalizeType = (type) => (typeof type === "string" ? type.toLowerCase() : null);

const queryType = (type) => (SUBSCRIPTION_TYPES.has(normalizeType(type)) ? "subs" : "in-app");

// StoreKit delivers the outcome of a purchase through the listeners, not
// through requestPurchase()'s return value, so a call parks itself here and is
// resolved by whichever listener fires first.
// Keyed by product id, and a LIST of waiters rather than one: two taps on the
// same button park two, and the second used to overwrite the first — so the
// first promise never settled, and when its own timeout fired five minutes
// later it deleted the second's entry on the way out. One StoreKit transaction
// is the answer to every request outstanding for that product.
const pendingPurchases = new Map();
let listenersBound = false;
let connectionPromise = null;

const waitersFor = (productId) => pendingPurchases.get(productId) ?? [];

function settle(productId, result) {
  const waiters = pendingPurchases.get(productId);
  if (!waiters || waiters.length === 0) return false;
  pendingPurchases.delete(productId);
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(result);
  }
  return true;
}

async function ensureConnection() {
  const iap = loadIap();
  if (!iap) return null;
  if (!connectionPromise) {
    connectionPromise = (async () => {
      await iap.initConnection();
      if (!listenersBound) {
        listenersBound = true;
        iap.purchaseUpdatedListener(async (purchase) => {
          const resolved = resolveProduct(purchase?.productId);
          // The manifest's type first; failing that, the type the caller
          // declared when it parked this purchase. A product created by hand
          // in App Store Connect is absent from the manifest, and a consumable
          // finished as a non-consumable can never be bought again.
          const declaredType = resolved.type ?? waitersFor(purchase?.productId)[0]?.type ?? null;
          const isConsumable = CONSUMABLE_TYPES.has(normalizeType(declaredType));
          // A purchase still in `pending` is Ask-to-Buy or a bank
          // authorisation: real, not yet granted, and NOT a success.
          if (purchase?.purchaseState === "pending") {
            settle(purchase.productId, { status: "pending", productId: purchase.productId });
            return;
          }
          try {
            await iap.finishTransaction({ purchase, isConsumable });
          } catch {
            // Finishing failed; StoreKit will redeliver on next launch, which
            // is the correct outcome. The grant below still stands.
          }
          const granted = {
            status: purchase?.purchaseState === "purchased" ? "success" : "failure",
            transactionId: purchase?.id,
            productId: purchase?.productId,
            // Milliseconds since the epoch. A non-renewing subscription is a
            // fixed period the app itself keeps, and this is what it counts
            // from; nothing else in the result says when the sale happened.
            transactionDate: purchase?.transactionDate ?? null,
          };
          if (granted.status !== "success") granted.error = "not_purchased";
          // Before settling, so a paywall that navigates away on success does
          // not race the report. Not awaited: see reportSale.
          if (granted.status === "success") void reportSale(purchase, false);
          settle(purchase?.productId, granted);
        });
        iap.purchaseErrorListener((error) => {
          const cancelled = error?.code === "user-cancelled";
          const outcome = (productId) => ({
            status: cancelled ? "cancelled" : "failure",
            productId: productId ?? undefined,
            ...(cancelled ? {} : { error: error?.code ?? "unknown" }),
          });
          // `productId` is optional on expo-iap's PurchaseError, and an error
          // that arrives without one used to settle nothing — the paywall sat
          // on its spinner for the full five-minute timeout. With no product
          // named, every waiting purchase is the one that failed.
          const named = [error?.productId, ...(Array.isArray(error?.productIds) ? error.productIds : [])].filter(Boolean);
          const targets = named.length > 0 ? named : [...pendingPurchases.keys()];
          for (const productId of targets) settle(productId, outcome(productId));
        });
      }
      return iap;
    })().catch((err) => {
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

// --- Reporting a sale, so RevenueCat can see it ---------------------------
//
// This app buys through StoreKit directly. RevenueCat therefore never hears
// about a purchase unless somebody tells it, and until somebody does, an
// author who connects their RevenueCat account finds an empty dashboard.
//
// So every completed purchase is posted to Borel, which relays it to
// RevenueCat when the author has connected one (server/src/lib/
// revenueCatReceipts.ts). Posting to Borel rather than to RevenueCat directly
// is what lets an author connect months after shipping: there is no key in
// this binary to go stale, and the relay simply starts working. `restorePurchases`
// reports too, with isRestore, so the first launch after connecting back-fills
// everyone already subscribed.
//
// FIRE AND FORGET, ALWAYS. The buyer has been charged by Apple and unlocked by
// the app already; this is a reporting mirror and nothing more. Nothing here
// may reject, retry in a loop, or delay what requestPurchase resolves.
const REPORTING = Constants?.expoConfig?.extra?.borelPurchaseReporting ?? null;

const BUYER_ID_KEY = "borel.buyerId";
let buyerIdPromise = null;

// A stable id for this buyer, kept on the device. RevenueCat needs one to hang
// a subscription off; without it every renewal would look like a new customer.
// Anonymous on purpose — it is a random value with nothing of the person in it.
function buyerId() {
  if (!buyerIdPromise) {
    buyerIdPromise = (async () => {
      try {
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        const stored = await AsyncStorage.getItem(BUYER_ID_KEY);
        if (stored) return stored;
        const minted = `borel-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        await AsyncStorage.setItem(BUYER_ID_KEY, minted);
        return minted;
      } catch {
        // No storage is not a reason to drop the sale on the floor. A per-launch
        // id still lets RevenueCat record the purchase; it just cannot join it
        // to the same buyer next time.
        return `borel-session-${Math.random().toString(36).slice(2)}`;
      }
    })();
  }
  return buyerIdPromise;
}

async function reportSale(purchase, isRestore) {
  if (!REPORTING?.endpoint || !REPORTING?.ingestKey) return;
  const fetchToken = purchase?.purchaseToken;
  const productId = purchase?.productId;
  if (!fetchToken || !productId) return;
  try {
    await fetch(REPORTING.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-borel-ingest-key": REPORTING.ingestKey },
      body: JSON.stringify({
        fetchToken,
        productId,
        appUserId: await buyerId(),
        isRestore: Boolean(isRestore),
        platform: Platform.OS === "android" ? "android" : "ios",
      }),
    });
  } catch {
    // Offline, or Borel unreachable. The next restore reports it again, and
    // RevenueCat de-duplicates on the transaction, so nothing is lost by
    // staying quiet here.
  }
}

// Five minutes: long enough for Ask-to-Buy approval or a slow SCA challenge,
// short enough that a promise can't hang for the life of the process.
const PURCHASE_TIMEOUT_MS = 5 * 60 * 1000;

export async function requestPurchase(payload) {
  const resolved = resolveProduct(payload?.productId);
  const type = resolved.type ?? payload?.type ?? null;

  if (IS_EXPO_GO) {
    return { status: "success", transactionId: "expo-go-simulated", productId: resolved.productId, simulated: true };
  }

  let iap;
  try {
    iap = await ensureConnection();
  } catch {
    return { status: "failure", error: "unavailable" };
  }
  if (!iap) return { status: "failure", error: "unavailable" };

  try {
    // StoreKit will not sell a product the app never loaded. An empty result
    // here is the single most common real-world failure — the product isn't
    // Ready to Submit yet, the bundle id doesn't match, or the Paid
    // Applications Agreement is unsigned — so the id is named in the warning,
    // because that string is what has to be found in App Store Connect.
    const products = await iap.fetchProducts({ skus: [resolved.productId], type: queryType(type) });
    if (!Array.isArray(products) || products.length === 0) {
      console.warn(`[borel] App Store has no purchasable product "${resolved.productId}".`);
      return { status: "failure", error: "not_found", productId: resolved.productId };
    }
  } catch {
    return { status: "failure", error: "network", productId: resolved.productId };
  }

  const outcome = new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Only this waiter gives up. Another caller still waiting on the same
      // product keeps its place rather than being dropped with it.
      const rest = waitersFor(resolved.productId).filter((w) => w.resolve !== resolve);
      if (rest.length > 0) pendingPurchases.set(resolved.productId, rest);
      else pendingPurchases.delete(resolved.productId);
      resolve({ status: "failure", error: "timeout", productId: resolved.productId });
    }, PURCHASE_TIMEOUT_MS);
    pendingPurchases.set(resolved.productId, [...waitersFor(resolved.productId), { resolve, timer, type }]);
  });

  try {
    await iap.requestPurchase({
      request: { apple: { sku: resolved.productId }, google: { skus: [resolved.productId] } },
      type: queryType(type),
    });
  } catch (err) {
    if (settle(resolved.productId, { status: "failure", error: err?.code ?? "failed", productId: resolved.productId })) {
      // settled synchronously; fall through to await the same promise
    }
  }
  return outcome;
}

// Guideline 3.1.1 requires a restore path for anything restorable, and the
// paywall the model builds is told to offer one.
export async function restorePurchases() {
  if (IS_EXPO_GO) return { status: "success", productIds: [], slugs: [], simulated: true };

  let iap;
  try {
    iap = await ensureConnection();
  } catch {
    return { status: "failure", productIds: [], slugs: [], error: "unavailable" };
  }
  if (!iap) return { status: "failure", productIds: [], slugs: [], error: "unavailable" };

  try {
    const purchases = (await iap.getAvailablePurchases()) ?? [];
    // The back-fill. Everything StoreKit still considers active is reported,
    // which is what makes connecting RevenueCat after the fact catch up with
    // the subscribers an app already had.
    for (const purchase of purchases) void reportSale(purchase, true);
    const productIds = purchases.map((p) => p?.productId).filter(Boolean);
    return {
      status: "success",
      productIds,
      slugs: productIds.map((id) => resolveProduct(id).slug),
    };
  } catch {
    return { status: "failure", productIds: [], slugs: [], error: "failed" };
  }
}

// So a paywall can show Apple's own localized price. A hardcoded "$9.99" is
// wrong in every storefront that isn't USD, which is a review problem of its
// own — the declared price is only ever the fallback.
export async function getProducts(slugs) {
  const wanted = (
    Array.isArray(slugs) && slugs.length > 0
      ? slugs.map(resolveProduct)
      : (IAP_MANIFEST?.products ?? [])
  ).filter((p) => p?.productId);
  if (wanted.length === 0) return [];

  if (IS_EXPO_GO) return [];

  let iap;
  try {
    iap = await ensureConnection();
  } catch {
    return [];
  }
  if (!iap) return [];

  try {
    const bySku = new Map(wanted.map((p) => [p.productId, p]));
    const subs = wanted.some((p) => SUBSCRIPTION_TYPES.has(p.type));
    const products =
      (await iap.fetchProducts({ skus: [...bySku.keys()], type: subs ? "all" : "in-app" })) ?? [];
    return products.map((product) => ({
      slug: bySku.get(product.id)?.slug ?? product.id,
      productId: product.id,
      title: product.title,
      description: product.description,
      displayPrice: product.displayPrice,
      price: product.price ?? null,
      currency: product.currency,
    }));
  } catch {
    return [];
  }
}

export async function shareContent(payload) {
  try {
    const result = await Share.share({ message: payload?.message ?? "", url: payload?.url });
    if (result.action === Share.sharedAction) {
      return { action: "shared", target: result.activityType ?? undefined };
    }
    return { action: "dismissed" };
  } catch {
    return { action: "dismissed" };
  }
}

export async function readClipboard() {
  try {
    const Clipboard = clipboardModule();
    if (!Clipboard) return null;
    const text = await Clipboard.getStringAsync();
    return text || null;
  } catch {
    return null;
  }
}

// Matches the contract's own "auto-dismisses on its own after a few
// seconds if not tapped" wording — long enough for a genuine glance/tap,
// short enough that generated code calling `await showNotification(...)`
// isn't left hanging.
const NOTIFICATION_RESPONSE_TIMEOUT_MS = 5000;

// --- Reading a reminder payload -------------------------------------------
//
// Hand-synced across borel-systemui.js, borel-systemui.web.js and
// src/SystemUI/runtime/shimSource.ts, so a payload means the same thing on a
// phone and in both previews (systemuiDeviceReminders.test.ts and
// systemuiPreviewReminders.test.ts run the same cases against each).
//
// Borel's own shape is at, afterSeconds, daily, weekly or every. Expo's own
// shape (a trigger object, or seconds/date/hour/weekday at the top level) is
// what a model that knows expo-notifications writes, and it used to take the
// immediate path: a reminder for 8am slid down the moment it was set. It is
// now read into Borel's shape, and anything that looks like a schedule but
// cannot be read resolves "invalid" instead of firing now.
const REMINDER_SCHEDULE_KEYS = [
  "at",
  "afterSeconds",
  "daily",
  "weekly",
  "every",
  "trigger",
  "seconds",
  "date",
  "hour",
  "minute",
  "weekday",
  "repeats",
];
const INVALID_REMINDER = { kind: "invalid" };
// A repeating interval shorter than this is refused on iOS, and a reminder
// every few seconds is never what anyone wanted.
const MIN_REPEAT_SECONDS = 60;

function reminderClock(value) {
  if (!value || typeof value !== "object") return null;
  const hour = Number(value.hour);
  const minute = Number(value.minute == null ? 0 : value.minute);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour: hour, minute: minute };
}

function reminderWeekly(value) {
  const clock = reminderClock(value);
  const weekday = Number(value && value.weekday);
  if (!clock || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return INVALID_REMINDER;
  return { kind: "weekly", weekday: weekday, hour: clock.hour, minute: clock.minute };
}

function reminderDaily(value) {
  const clock = reminderClock(value);
  return clock ? { kind: "daily", hour: clock.hour, minute: clock.minute } : INVALID_REMINDER;
}

function reminderMoment(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now() ? { kind: "at", time: time } : INVALID_REMINDER;
}

function reminderDelay(value) {
  const seconds = Math.round(Number(value));
  return Number.isFinite(seconds) && seconds >= 1 ? { kind: "after", seconds: seconds } : INVALID_REMINDER;
}

function reminderRepeat(seconds) {
  const rounded = Math.round(Number(seconds));
  return Number.isFinite(rounded) && rounded >= MIN_REPEAT_SECONDS ? { kind: "every", seconds: rounded } : INVALID_REMINDER;
}

// null for an immediate banner, { kind: "invalid" } for a schedule that
// cannot be read, and otherwise one of daily / weekly / every / at / after.
function planReminder(payload) {
  const p = payload || {};
  if (!REMINDER_SCHEDULE_KEYS.some((key) => p[key] != null)) return null;

  if (p.daily != null) return reminderDaily(p.daily);
  if (p.weekly != null) return reminderWeekly(p.weekly);
  if (p.every != null) {
    const every = p.every;
    if (!every || typeof every !== "object") return INVALID_REMINDER;
    return reminderRepeat(Number(every.hours || 0) * 3600 + Number(every.minutes || 0) * 60 + Number(every.seconds || 0));
  }
  if (p.at != null) return reminderMoment(p.at);
  if (p.afterSeconds != null) return reminderDelay(p.afterSeconds);

  if (p.trigger != null && (p.trigger instanceof Date || typeof p.trigger !== "object")) return reminderMoment(p.trigger);
  const e = p.trigger != null ? p.trigger : p;
  const type = typeof e.type === "string" ? e.type.toLowerCase() : "";
  // A monthly or yearly repeat has no Borel shape yet; read as its hour alone it
  // became a DAILY reminder, thirty times as often as asked.
  if (e.day != null || e.month != null || type === "monthly" || type === "yearly") return INVALID_REMINDER;
  if (e.date != null || type === "date") return reminderMoment(e.date);
  if (e.seconds != null || type === "timeinterval") {
    return e.repeats === true ? reminderRepeat(e.seconds) : reminderDelay(e.seconds);
  }
  if (e.weekday != null || type === "weekly") return reminderWeekly(e);
  if (e.hour != null || type === "daily" || type === "calendar") return reminderDaily(e);
  return INVALID_REMINDER;
}

function reminderContent(payload) {
  const p = payload || {};
  const nested = p.content && typeof p.content === "object" ? p.content : {};
  const title = p.title != null ? p.title : nested.title;
  const body = p.body != null ? p.body : nested.body;
  const data = p.data != null ? p.data : nested.data;
  const content = { title: title == null ? "" : String(title), body: body == null ? "" : String(body) };
  if (data != null && typeof data === "object") content.data = data;
  return content;
}

// Only called once showNotification has found expo-notifications in this build.
function reminderTrigger(plan) {
  const types = notificationsModule().SchedulableTriggerInputTypes;
  if (plan.kind === "daily") return { type: types.DAILY, hour: plan.hour, minute: plan.minute };
  if (plan.kind === "weekly") return { type: types.WEEKLY, weekday: plan.weekday, hour: plan.hour, minute: plan.minute };
  if (plan.kind === "every") return { type: types.TIME_INTERVAL, seconds: plan.seconds, repeats: true };
  if (plan.kind === "at") return { type: types.DATE, date: new Date(plan.time) };
  return { type: types.TIME_INTERVAL, seconds: plan.seconds, repeats: false };
}

// With `at`, `afterSeconds`, `daily`, `weekly` or `every` in the payload (or
// Expo's own trigger shape, see planReminder) this SCHEDULES instead of showing
// a banner now, and resolves as soon as the OS has accepted it:
// `{ action: "scheduled", id }`, or `{ action: "failed", reason }` where reason
// is "denied", "invalid" (a time in the past, an hour that isn't one, a repeat
// under a minute, a schedule it cannot read) or "unavailable". Without one it
// is the immediate banner it always was, with its original
// { action: "dismissed" | "tapped" } contract untouched.
//
// `id` is the OS identifier, so scheduling again under the same id REPLACES
// the reminder. Without it, an effect that schedules on every launch stacked a
// new copy each time and the phone buzzed once per launch ever made. `data`
// rides along to onNotificationTapped below.
export async function showNotification(payload) {
  const plan = planReminder(payload);
  const scheduled = plan !== null;
  if (plan && plan.kind === "invalid") return { action: "failed", reason: "invalid" };
  try {
    const Notifications = notificationsModule();
    if (!Notifications) return scheduled ? { action: "failed", reason: "unavailable" } : { action: "dismissed" };
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return scheduled ? { action: "failed", reason: "denied" } : { action: "dismissed" };

    const content = reminderContent(payload);
    const identifier = payload && payload.id != null && payload.id !== "" ? String(payload.id) : undefined;

    if (scheduled) {
      if (identifier) {
        try {
          await Notifications.cancelScheduledNotificationAsync(identifier);
        } catch {
          // Nothing scheduled under that id yet.
        }
      }
      const request = { content, trigger: reminderTrigger(plan) };
      if (identifier) request.identifier = identifier;
      const id = await Notifications.scheduleNotificationAsync(request);
      return { action: "scheduled", id };
    }

    const immediate = { content, trigger: null };
    if (identifier) immediate.identifier = identifier;
    const shownId = await Notifications.scheduleNotificationAsync(immediate);

    return await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        subscription.remove();
        resolve({ action: "dismissed" });
      }, NOTIFICATION_RESPONSE_TIMEOUT_MS);
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        if (settled || response.notification.request.identifier !== shownId) return;
        settled = true;
        clearTimeout(timer);
        subscription.remove();
        resolve({ action: "tapped" });
      });
    });
  } catch {
    return scheduled ? { action: "failed", reason: "unavailable" } : { action: "dismissed" };
  }
}

// Cancels one scheduled notification by the id showNotification resolved (or
// the id it was given), or every one this app scheduled with the explicit
// "all". A missing id cancels NOTHING and resolves false: it used to cancel
// everything, so `cancelNotification(habit.reminderId)` on a habit that never
// had a reminder silently deleted every other habit's reminder.
export async function cancelNotification(id) {
  if (id == null || id === "") return false;
  try {
    const Notifications = notificationsModule();
    if (!Notifications) return false;
    if (id === "all") await Notifications.cancelAllScheduledNotificationsAsync();
    else await Notifications.cancelScheduledNotificationAsync(String(id));
    return true;
  } catch {
    return false;
  }
}

// Responses already handed to the app. The launch-response read below skips
// any that were delivered before its listener subscribed, so a screen mounted
// later never replays an old tap. Live taps still reach every listener.
const deliveredNotificationResponses = new Set();

function notificationResponseKey(response) {
  const notification = response && response.notification;
  const request = notification && notification.request;
  return request ? String(request.identifier) + ":" + String(notification.date) : null;
}

function notificationTap(response) {
  const request = response && response.notification && response.notification.request;
  if (!request) return null;
  // A notification one person of the app sent another (db.notify in core/db.ts)
  // carries its data under the APNs payload's `body`, which expo-notifications
  // hands over as content.data. Read from the payload as well, so a version
  // that does not still lets the tap open the right screen.
  const payload = request.trigger && request.trigger.payload;
  const fromPayload = payload && payload.body && typeof payload.body === "object" ? payload.body : null;
  const data = request.content && request.content.data != null ? request.content.data : fromPayload;
  return { id: request.identifier == null ? null : request.identifier, data: data == null ? {} : data };
}

// Calls listener({ id, data }) when the person taps a notification this app
// showed or scheduled, including the tap that opened the app from closed.
// Returns the unsubscribe function, for an effect's cleanup.
export function onNotificationTapped(listener) {
  let active = true;
  let subscription = null;
  const handed = new Set();
  const deliveredBefore = new Set(deliveredNotificationResponses);
  const Notifications = notificationsModule();
  if (!Notifications) return () => {};
  const deliver = (response, fromLaunch) => {
    const tap = notificationTap(response);
    const key = notificationResponseKey(response);
    if (!active || !tap) return;
    if (key) {
      if (handed.has(key) || (fromLaunch && deliveredBefore.has(key))) return;
      handed.add(key);
      deliveredNotificationResponses.add(key);
    }
    listener(tap);
  };
  try {
    subscription = Notifications.addNotificationResponseReceivedListener((response) => deliver(response, false));
  } catch {
    return () => {};
  }
  (async () => {
    try {
      const last =
        typeof Notifications.getLastNotificationResponse === "function"
          ? Notifications.getLastNotificationResponse()
          : await Notifications.getLastNotificationResponseAsync();
      if (last) deliver(last, true);
    } catch {
      // No launch response to read.
    }
  })();
  return () => {
    active = false;
    try {
      if (subscription) subscription.remove();
    } catch {
      // Already removed.
    }
  };
}

// One real position reading, in the foreground.
//
// requestPermission("location") used to be the whole location surface: a real
// OS prompt, and then nothing to do with the grant. An app that asked could
// only show a map pinned somewhere invented. This asks for the permission
// itself when it hasn't been given, reads the device's position once, and
// resolves the same shape the browser preview does (nativeCalls.ts,
// "locationRead"). "unavailable" covers location services switched off and a
// reading that never came; neither is ever papered over with a guess.
export async function getCurrentLocation(options) {
  try {
    const Location = locationModule();
    if (!Location) return { status: "unavailable", location: null };
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: "denied", location: null };
    const position = await Location.getCurrentPositionAsync({
      accuracy: options?.accuracy === "high" ? Location.Accuracy.High : Location.Accuracy.Balanced,
    });
    return {
      status: "granted",
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        altitude: position.coords.altitude ?? null,
        timestamp: position.timestamp,
      },
    };
  } catch {
    return { status: "unavailable", location: null };
  }
}

// Written into app.json by server/src/lib/expoAppConfig.ts for a store build
// of an app that uses push: { endpoint, ingestKey }. Absent in Expo Go and in
// the preview, which is what keeps their tokens out of the owner's device list.
const PUSH_REGISTRATION = Constants?.expoConfig?.extra?.borelPush ?? null;

// Fire and forget, like reportSale: the app asked for permission and got it,
// and a Borel outage must never turn that into a failure. The next launch that
// calls registerForPushNotifications() registers again.
function reportPushToken(token) {
  if (!PUSH_REGISTRATION?.endpoint || !PUSH_REGISTRATION?.ingestKey) return;
  const bundleId = Constants?.expoConfig?.ios?.bundleIdentifier;
  if (!bundleId || Platform.OS !== "ios") return;
  fetch(PUSH_REGISTRATION.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-borel-ingest-key": PUSH_REGISTRATION.ingestKey },
    body: JSON.stringify({ token, platform: "ios", bundleId }),
  }).catch(() => {});
}

// Remote push registration, the real thing: the OS permission prompt, then
// this device is registered with Borel so the app's owner can send it a
// notification from the Notifications panel (server/src/routes/push.ts).
// Distinct from showNotification() above, which schedules a local
// notification and needs no token or server at all.
//
// The token is the device's own APNs token, not an Expo push token. Borel
// signs builds with local credentials, so Expo's push service holds no key for
// these apps and an Expo token from a store build could never be delivered;
// Borel sends through Apple directly with the owner's push key instead. It
// used to return an Expo token and tell the owner to run a server of their own,
// which left every push-enabled app unable to receive anything.
export async function registerForPushNotifications() {
  try {
    const Notifications = notificationsModule();
    if (!Notifications) return { status: "denied", token: null };
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return { status: "denied", token: null };

    // Required on Android before a notification can be displayed at all —
    // without a channel the OS silently drops it, a failure mode that looks
    // exactly like "push doesn't work" from inside the app.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Expo Go's device token belongs to Expo Go, not to this app: Apple would
    // refuse it for this app's bundle, so it is never registered. The Expo
    // token is still handed back for the demonstration, and a failure to get
    // one is not a denial — the person said yes.
    if (IS_EXPO_GO) {
      try {
        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? undefined;
        const expoToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        return { status: "granted", token: expoToken.data };
      } catch {
        return { status: "granted", token: null };
      }
    }

    const device = await Notifications.getDevicePushTokenAsync();
    const token = typeof device?.data === "string" ? device.data : null;
    if (token) {
      reportPushToken(token);
      announcePushToken(token);
    }
    return { status: "granted", token };
  } catch {
    return { status: "denied", token: null };
  }
}

// Where core/db.ts looks for this device's push token, so it can link the
// device to whoever is signed in and people of the app can notify each other
// (db.notify). Kept on the device for later launches, and announced to a
// listener core/db.ts registers, for a person who is already signed in when
// they turn notifications on. Only a store build's own APNs token: Expo Go's
// belongs to Expo Go, and it never reaches this line.
const PUSH_TOKEN_STORAGE_KEY = "borel.push.deviceToken";

function announcePushToken(token) {
  if (Platform.OS !== "ios") return;
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token).catch(() => {});
  } catch {
    // No device storage: the listener below still hears it for this launch.
  }
  try {
    const listeners = globalThis.__borelPushTokenListeners;
    if (listeners && typeof listeners.forEach === "function") {
      listeners.forEach((listener) => {
        try {
          listener(token);
        } catch {
          // One listener failing is not a reason to skip the rest.
        }
      });
    }
  } catch {
    // Nothing is listening in an app without a cloud.
  }
}

// --- Links that open this app ------------------------------------------------
//
// An invite link (createInviteLink in core/db.ts) is
// https://borel.one/i/<name>-<linkId>/<code>. The page it lands on opens a
// store build through the app's own scheme, borel-<linkId>://join/<code>
// (expoAppConfig.ts writes the scheme); Expo Go is opened with
// exps://<host>/--/join/<code>. Every shape carries the code, and this reads it
// out of any of them, so a screen never parses a URL: useIncomingLink() gives
// { url, path, code }, getInviteCode() the code, and clearIncomingLink() says
// it was handled. The browser preview's counterpart reads the same thing from
// the preview page's own address (borel-systemui.web.js).
//
// Hand-synced with borel-systemui.web.js and src/SystemUI/runtime/shimSource.ts
// (systemuiIncomingLinks.test.ts runs the same shapes against each).
const INVITE_CODE_SHAPE = /^[A-Za-z0-9_-]{3,64}$/;
// Schemes whose first segment is a host, not part of the app's own path.
const HOSTED_SCHEMES = ["http", "https", "exp", "exps"];

function readIncomingLink(url) {
  if (typeof url !== "string") return null;
  const raw = url.trim();
  if (!raw || raw.length > 2048) return null;
  let rest = raw;
  const fragment = rest.indexOf("#");
  if (fragment !== -1) rest = rest.slice(0, fragment);
  const query = rest.indexOf("?");
  if (query !== -1) rest = rest.slice(0, query);
  let dropHost = false;
  const deepLink = rest.indexOf("/--/");
  if (deepLink !== -1) {
    rest = rest.slice(deepLink + 4);
  } else {
    const separator = rest.indexOf("://");
    if (separator !== -1) {
      dropHost = HOSTED_SCHEMES.indexOf(rest.slice(0, separator).toLowerCase()) !== -1;
      rest = rest.slice(separator + 3);
    }
  }
  let parts = rest.split("/").filter((part) => part.length > 0);
  if (dropHost) parts = parts.slice(1);
  parts = parts.map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts.length === 0) return null;
  const candidate = parts[0] === "join" ? parts[1] : parts[0] === "i" ? parts[2] : null;
  return { url: raw, path: parts.join("/"), code: INVITE_CODE_SHAPE.test(candidate || "") ? candidate : null };
}

let incomingLink = null;
let incomingLinkRead = null;
const incomingLinkListeners = new Set();

function receiveLink(url) {
  const link = readIncomingLink(url);
  if (!link) return;
  incomingLink = link;
  incomingLinkListeners.forEach((listener) => listener(link));
}

function watchIncomingLinks() {
  if (!incomingLinkRead) {
    try {
      Linking.addEventListener("url", (event) => receiveLink(event && event.url));
    } catch {
      // No link events on this surface; the launch link is still read below.
    }
    incomingLinkRead = (async () => {
      try {
        const url = await Linking.getInitialURL();
        // A link that arrived while this was being read is the newer one.
        if (url && !incomingLink) receiveLink(url);
      } catch {
        // Opened from the home screen, or no Linking at all.
      }
    })();
  }
  return incomingLinkRead;
}

// The link that opened the app or arrived while it was open, as
// { url, path, code }, or null. Re-renders when another arrives, and when
// clearIncomingLink() is called. `code` is the invite code, or null when the
// link carries none.
export function useIncomingLink() {
  const [link, setLink] = React.useState(incomingLink);
  React.useEffect(() => {
    let active = true;
    const listener = (next) => {
      if (active) setLink(next);
    };
    incomingLinkListeners.add(listener);
    watchIncomingLinks().then(() => {
      if (active) setLink(incomingLink);
    });
    return () => {
      active = false;
      incomingLinkListeners.delete(listener);
    };
  }, []);
  return link;
}

// The invite code the app was opened with, or null. For code outside a screen.
export async function getInviteCode() {
  await watchIncomingLinks();
  return incomingLink ? incomingLink.code : null;
}

// Once the app has acted on a link (joined the group it names), so a screen
// that mounts again does not act on it twice.
export function clearIncomingLink() {
  incomingLink = null;
  incomingLinkListeners.forEach((listener) => listener(null));
}

export function triggerHaptic(_style) {
  // No-op here — generated code should use expo-haptics directly for real
  // haptic feedback on a physical device.
}

// The real-device counterpart to the browser preview's keyboard bridge (see
// borel-systemui.web.js). There is nothing to bridge here: this is a real
// phone with a real keyboard, so React Native's own Keyboard module and
// KeyboardAvoidingView already work exactly as they're documented to, and
// the OS already reports real safe-area insets that shrink when the keyboard
// is up. Exported anyway because App.js is the single shared entry point for
// both platforms and imports this by name — and returning a working
// unsubscribe keeps any caller's cleanup honest.
export function subscribeKeyboardFrame(listener) {
  listener({ visible: false, height: 0 });
  return () => {};
}

export function getKeyboardFrame() {
  return { visible: false, height: 0 };
}
