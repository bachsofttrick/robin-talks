// Shared and saved state for a generated app, with nothing to mount.
//
// The contract used to ask every app to hand-build this: a React context, a
// Provider, a hook with a throw guard, an AsyncStorage load, a hydration flag,
// a save effect that must not run before the load, and an error state that
// must not hide the data. A third of the apps with api/ hooks got the first
// half wrong (state held once per screen), the save-before-load wipe was a
// recurring data-loss report, and a Provider declared but never mounted is a
// blank app. None of that is a modelling problem; it is plumbing, and this file
// is the plumbing, written once.
//
// The same shape core/premium.ts already uses for entitlements: a module
// singleton read through React's useSyncExternalStore, so every screen shares
// one value and re-renders when it changes, with no Provider to thread down.
//
// Resolved by the bundler wherever it is imported from (metro.config.js), and
// copied to the project root of a downloaded or App Store build, so
// `../../borel-store` from a screen and `../borel-store` from api/ both work
// on every surface.
//
// Persistence goes through AsyncStorage, which Borel's preview redirects to the
// host page (async-storage-shim.web.js) and a phone runs as the real package.
// It is loaded lazily and defensively, exactly as borel-intelligence.js does,
// so this file survives being dropped into a project without it.
import React from "react";

const { useSyncExternalStore } = React;

const STORAGE_PREFIX = "borel-store:";
const BACKUP_SUFFIX = ":backup";
const WRITE_DELAY_MS = 150;

const LOAD_FAILED = "Could not load what was saved on this device.";
const SAVE_FAILED = "That change could not be saved on this device.";
const OLDER_DATA = "Some saved data is from an older version of this app.";

const stores = new Map();

let storage = null;
function getStorage() {
  if (storage !== null) return storage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    storage = require("@react-native-async-storage/async-storage").default ?? false;
  } catch {
    storage = false;
  }
  return storage;
}

// The technical half of a failure. It never goes into `error`, which a screen
// shows as it is; it is `detail`, for a "Details" tap and for the console.
function reasonOf(err) {
  if (err && typeof err.message === "string" && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  return null;
}

function kindOf(v) {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v;
}

// True when JSON would change the value: a Date comes back a string, a Map or
// a Set an empty object. Walks plain data only, once per object.
function hasNonJsonValue(v, seen) {
  if (v === null || typeof v !== "object") return false;
  if (v instanceof Date || v instanceof Map || v instanceof Set) return true;
  if (seen.has(v)) return false;
  seen.add(v);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (hasNonJsonValue(v[i], seen)) return true;
    return false;
  }
  for (const k in v) {
    if (Object.prototype.hasOwnProperty.call(v, k) && hasNonJsonValue(v[k], seen)) return true;
  }
  return false;
}

/**
 * One piece of state every screen shares.
 *
 *   const habits = createStore("habits", [], { persist: true });
 *
 *   habits.use()        the current value, in a component; re-renders on change
 *   habits.get()        the current value, anywhere
 *   habits.set(next)    replace it, or habits.set((prev) => next)
 *   habits.useStatus()  { ready, error, detail, retry } in a component
 *   habits.subscribe(fn) called after every change; returns unsubscribe
 *   habits.reset()      back to the initial value
 *
 * `persist: true` keeps the value on the device: it is loaded once on first
 * use (`ready` is false until then) and every change is saved shortly after it
 * is made. A change made before the load has finished shows at once, and is
 * replayed onto what was stored when the load finishes, so
 * `set((prev) => [...prev, item])` adds to the saved list rather than replacing
 * it. If the load fails, nothing is saved until `retry()` has read the stored
 * value, so a failure can never write over data that was not read.
 *
 * A load or save that fails leaves the value on screen and sets `error` to one
 * plain sentence a screen can show as it is, `detail` to the technical reason
 * (for a "Details" tap only), and `retry()` tries again.
 *
 * When the shape of what is stored changes, give the store a version and a
 * migrate function: `{ persist: true, version: 2, migrate: (old, fromVersion)
 * => next }`. A value saved without a version counts as version 1. If migrate
 * throws, or the stored value is no longer the same kind as `initial` (a list
 * where an object is expected), the old data is kept aside under
 * `borel-store:<key>:backup`, the store starts from `initial`, and `error` says
 * so. Store plain data only: objects, arrays, strings, numbers, booleans. A
 * Date is stored as its ISO string, and becomes that string straight away.
 *
 * The same key always returns the same store, so calling this inside a hook
 * or a component is safe; a second `initial` for a key already created is
 * ignored.
 */
export function createStore(key, initial, options) {
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("createStore needs a key: a short name for what this store holds, like \"habits\".");
  }
  const existing = stores.get(key);
  if (existing) return existing;

  const persist = Boolean(options && options.persist);
  const backend = options && options.storage ? options.storage : null;
  const version =
    options && typeof options.version === "number" && Number.isInteger(options.version) && options.version >= 1
      ? options.version
      : null;
  const migrate = options && typeof options.migrate === "function" ? options.migrate : null;

  let value = initial;
  let status = { ready: !persist, error: null, detail: null, retry };
  let hydrated = !persist;
  let loading = false;
  let loadFailed = false;
  // Changes made before the stored value is known, replayed onto it in order.
  let pending = [];
  let lastFailure = null;
  let writeTimer = null;
  let warnedNonJson = false;
  const listeners = new Set();
  const statusListeners = new Set();

  function emit() {
    for (const listener of listeners) listener();
  }
  function setStatus(next) {
    status = { ...status, ...next };
    for (const listener of statusListeners) listener();
  }
  function fail(kind, sentence, err) {
    const detail = reasonOf(err);
    lastFailure = kind;
    try {
      console.warn(`[borel-store] "${key}": ${sentence}${detail ? ` ${detail}` : ""}`);
    } catch {
      // A console that throws is not worth losing the status over.
    }
    return { error: sentence, detail };
  }

  function storageFor() {
    if (backend) return backend;
    return getStorage() || null;
  }

  // What set() stores, made to look now the way it will after a relaunch.
  function normalize(next) {
    if (!persist || next === null || typeof next !== "object") return next;
    if (!hasNonJsonValue(next, new WeakSet())) return next;
    if (!warnedNonJson) {
      warnedNonJson = true;
      try {
        console.warn(
          `[borel-store] "${key}" was given a Date, Map or Set. Saved data is plain JSON, so it is stored as JSON would bring it back (a Date becomes its ISO string).`,
        );
      } catch {
        // ignore
      }
    }
    try {
      return JSON.parse(JSON.stringify(next));
    } catch {
      return next;
    }
  }

  function encode(v) {
    return JSON.stringify(version === null ? v : { v: version, data: v });
  }

  async function write() {
    const store = storageFor();
    if (!store) return;
    const snapshot = value;
    try {
      await store.setItem(STORAGE_PREFIX + key, encode(snapshot));
      if (lastFailure === "save") {
        lastFailure = null;
        setStatus({ error: null, detail: null });
      }
    } catch (err) {
      setStatus(fail("save", SAVE_FAILED, err));
    }
  }

  function scheduleWrite() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void write();
    }, WRITE_DELAY_MS);
  }

  // Turns the stored text into a value this version of the app can use.
  // Returns { value } to use, { none: true } when there is nothing usable, or
  // { older: err } when the data is set aside.
  function decode(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { none: true };
    }
    if (parsed === undefined || parsed === null) return { none: true };
    let data = parsed;
    let from = 1;
    // Only a versioned store writes the envelope, but every store reads it: an
    // edit that drops `version` from the options must still find what the
    // versioned app saved, rather than set it aside as the wrong shape.
    const isEnvelope =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Number.isInteger(parsed.v) &&
      Object.prototype.hasOwnProperty.call(parsed, "data") &&
      Object.keys(parsed).length === 2;
    if (isEnvelope) {
      data = parsed.data;
      from = parsed.v;
    }
    let migrated = false;
    if (version !== null && from < version && migrate) {
      try {
        data = migrate(data, from);
        migrated = true;
      } catch (err) {
        return { older: err };
      }
    }
    if (initial !== null && initial !== undefined && kindOf(data) !== kindOf(initial)) {
      return {
        older: new Error(`The saved value is ${kindOf(data)} but this version of the app expects ${kindOf(initial)}.`),
      };
    }
    return { value: normalize(data), migrated };
  }

  async function load() {
    if (loading) return;
    const store = storageFor();
    if (!store) {
      hydrated = true;
      loadFailed = false;
      pending = [];
      setStatus({ ready: true });
      return;
    }
    loading = true;
    try {
      const raw = await store.getItem(STORAGE_PREFIX + key);
      let base = initial;
      let needsWrite = false;
      let older = null;
      if (raw !== null && raw !== undefined) {
        const decoded = decode(raw);
        if (decoded.older !== undefined) {
          older = decoded.older;
          // Kept aside before anything can be saved over it.
          await store.setItem(STORAGE_PREFIX + key + BACKUP_SUFFIX, raw);
        } else if (!decoded.none) {
          base = decoded.value;
          needsWrite = Boolean(decoded.migrated);
        }
      }
      let next = base;
      for (const change of pending) {
        if ("fn" in change) {
          try {
            next = normalize(change.fn(next));
          } catch (err) {
            try {
              console.warn(`[borel-store] "${key}": a change made while loading could not be applied. ${reasonOf(err) ?? ""}`);
            } catch {
              // ignore
            }
          }
        } else {
          next = change.value;
        }
      }
      if (pending.length > 0 && !Object.is(next, base)) needsWrite = true;
      pending = [];
      hydrated = true;
      loadFailed = false;
      if (!Object.is(next, value)) {
        value = next;
        emit();
      }
      if (needsWrite) scheduleWrite();
      if (older !== null) {
        setStatus({ ready: true, ...fail("older", OLDER_DATA, older) });
      } else {
        lastFailure = null;
        setStatus({ ready: true, error: null, detail: null });
      }
    } catch (err) {
      // The screen stays usable with what it has, but nothing is saved until
      // the stored value has been read: saving now would write over it.
      hydrated = true;
      loadFailed = true;
      setStatus({ ready: true, ...fail("load", LOAD_FAILED, err) });
    } finally {
      loading = false;
    }
  }

  function retry() {
    if (lastFailure === "load") {
      hydrated = false;
      setStatus({ ready: false, error: null, detail: null });
      void load();
    } else if (lastFailure === "save") {
      void write();
    } else if (lastFailure === "older") {
      // The old data is in the backup and cannot be read by this version, so
      // trying again would only say the same thing. Acknowledge it.
      lastFailure = null;
      setStatus({ error: null, detail: null });
    }
  }

  function get() {
    return value;
  }

  function set(next) {
    const isFn = typeof next === "function";
    const resolved = normalize(isFn ? next(value) : next);
    if (persist && (!hydrated || loadFailed)) {
      // Queued even when it changes nothing here: an updater that hands back
      // `prev` for the initial value (a daily reset with nothing stale yet)
      // can be the whole point once it runs against what was stored, and a
      // reset() mid-load must not let the stored value come back.
      pending.push(isFn ? { fn: next } : { value: resolved });
      if (!Object.is(resolved, value)) {
        value = resolved;
        emit();
      }
      return;
    }
    if (Object.is(resolved, value)) return;
    value = resolved;
    emit();
    if (persist) scheduleWrite();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function subscribeStatus(listener) {
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }

  function getStatus() {
    return status;
  }

  function use() {
    return useSyncExternalStore(subscribe, get, get);
  }

  function useStatus() {
    return useSyncExternalStore(subscribeStatus, getStatus, getStatus);
  }

  function reset() {
    set(initial);
  }

  // `status()` is the same snapshot useStatus() hands a component, for code
  // that runs outside a render.
  const store = { key, use, useStatus, status: getStatus, get, set, subscribe, subscribeStatus, reset, persist };
  stores.set(key, store);
  if (persist) void load();
  return store;
}

/**
 * A single saved value, as a hook: `const [value, setValue, status] =
 * usePersistedState("theme", "light")`. The same store as
 * createStore(key, initial, { persist: true }), so two screens calling this
 * with the same key share one value.
 */
export function usePersistedState(key, initial) {
  const store = createStore(key, initial, { persist: true });
  return [store.use(), store.set, store.useStatus()];
}

/** The store a key was created with, or null. For code that wants to reach one by name. */
export function getStore(key) {
  return stores.get(key) ?? null;
}

// --- Collections ---------------------------------------------------------------
//
// The person's things, with everything a list of them needs.
//
// Every app hand-wrote the same hundred lines around a persisted list: an id,
// when it was made, add, edit, remove, a sort. None of them wrote undo, because
// it was never worth the lines, so a swipe that deletes was final in every app.
// This is that plumbing once. A collection is a createStore list underneath
// (the same key, the same saved value), so every promise above still holds: the
// load-before-save order, a change made mid-load replayed, a failed save kept
// and said.
//
// Rows are plain objects with snake_case keys, a UUID `id`, and `created_at` /
// `updated_at` as ISO strings: the shape a table has. Every change applies at
// once and ALSO resolves `{ data, error }`, and `reload` / `loadMore` answer
// today, so the day a collection moves to the person's account no screen that
// uses it changes.

const UNDO_LIMIT = 20;
const UNDO_MS = 15000;

const collections = new Map();
let nowFn = () => Date.now();
let memoryStorage = null;

function iso(ms) {
  return new Date(ms).toISOString();
}

// A version 4 UUID: what a `uuid` column takes as it is. crypto when the
// platform has it, Math.random otherwise; these are names for rows on one
// phone, not secrets.
function uuid() {
  const bytes = new Array(16);
  let c = null;
  try {
    c = typeof crypto !== "undefined" ? crypto : null;
  } catch {
    c = null;
  }
  let gotRandom = false;
  if (c && typeof c.getRandomValues === "function") {
    try {
      const buf = new Uint8Array(16);
      c.getRandomValues(buf);
      for (let i = 0; i < 16; i++) bytes[i] = buf[i];
      gotRandom = true;
    } catch {
      gotRandom = false;
    }
  }
  if (!gotRandom) {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => (b < 16 ? "0" : "") + b.toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isRow(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function warnOnce(flags, flag, message) {
  if (flags[flag]) return;
  flags[flag] = true;
  try {
    console.warn(message);
  } catch {
    // ignore
  }
}

const RESERVED_OPTIONS = ["filter", "key", "cloud", "refreshOnFocus", "refreshEvery"];

/**
 * A saved list of the person's things: `const habits = createCollection("habits")`.
 *
 * Read it with `habits.use()` (every screen shares one list and re-renders when
 * it changes), one row with `habits.useItem(id)`, and anything worked out from
 * the rows with `habits.useDerived((rows) => ...)`. Change it with
 * `habits.insert({ name })`, `habits.update(id, { name })` or
 * `habits.update(id, (row) => ({ ... }))`, `habits.remove(id)`, `habits.clear()`
 * and, for a list the person orders by hand, `habits.move(id, toIndex)`.
 * `habits.undo()` brings back the last thing removed, for fifteen seconds: it
 * is what an Undo button on a toast calls.
 *
 * Saved on the device unless `{ persist: false }`. Newest first unless
 * `{ order: { by: "name", ascending: true } }` or `{ order: "manual" }`.
 * `version` and `migrate` are createStore's. The same name always returns the
 * same collection.
 */
export function createCollection(name, options) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("createCollection needs a name: a short word for what it holds, like \"habits\".");
  }
  const existing = collections.get(name);
  if (existing) return existing;

  const opts = options || {};
  const warned = {};
  for (const key of RESERVED_OPTIONS) {
    if (key in opts) warnOnce(warned, key, `[borel-store] "${name}": the "${key}" option does nothing yet. The collection works on this device without it.`);
  }
  const manual = opts.order === "manual";
  const orderBy = manual ? "position" : opts.order && typeof opts.order.by === "string" ? opts.order.by : "created_at";
  // Newest first for the default, A to Z for a named field, unless told.
  const ascending = manual ? true : opts.order && typeof opts.order.ascending === "boolean" ? opts.order.ascending : orderBy !== "created_at";

  const store = createStore(name, [], {
    persist: opts.persist !== false,
    ...(opts.storage ? { storage: opts.storage } : {}),
    ...(typeof opts.version === "number" ? { version: opts.version } : {}),
    ...(typeof opts.migrate === "function" ? { migrate: opts.migrate } : {}),
  });

  // A list saved by an older version of the app, or by createStore under the
  // same name: adopted, and given what its rows lack. Handed back untouched
  // when nothing is missing, so it costs no write.
  function heal(list) {
    if (!Array.isArray(list)) return [];
    let changed = false;
    const at = iso(nowFn());
    const next = list.map((row, index) => {
      if (!isRow(row)) {
        changed = true;
        return { id: uuid(), created_at: at, updated_at: at, value: row, ...(manual ? { position: index } : {}) };
      }
      if (row.id && row.created_at && (!manual || typeof row.position === "number")) return row;
      changed = true;
      const created = row.created_at || row.createdAt || at;
      return { ...row, id: row.id || uuid(), created_at: created, updated_at: row.updated_at || created, ...(manual && typeof row.position !== "number" ? { position: index } : {}) };
    });
    return changed ? next : list;
  }
  store.set((prev) => heal(prev));

  function compare(a, b) {
    const x = a[orderBy];
    const y = b[orderBy];
    let result = 0;
    if (x !== y) {
      if (x === undefined || x === null) result = 1;
      else if (y === undefined || y === null) result = -1;
      else result = x < y ? -1 : 1;
      if (!ascending) result = -result;
    }
    if (result !== 0) return result;
    // Two rows made in the same millisecond keep the order they were made in.
    return 0;
  }

  let lastRaw = null;
  let lastSorted = [];
  function sorted(raw) {
    if (raw === lastRaw) return lastSorted;
    const list = Array.isArray(raw) ? raw.filter(isRow) : [];
    // Insertion order first, so a stable sort keeps same-instant rows apart:
    // newest first reverses it, every other order leaves it.
    const base = !ascending && orderBy === "created_at" ? [...list].reverse() : [...list];
    lastSorted = base.sort(compare);
    lastRaw = raw;
    return lastSorted;
  }

  function get() {
    return sorted(store.get());
  }

  const undoStack = [];
  function remember(rows) {
    undoStack.push({ rows, at: nowFn() });
    while (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }

  function ok(data) {
    return Promise.resolve({ data, error: null });
  }
  function no(data, error) {
    return Promise.resolve({ data, error });
  }

  function insert(fields) {
    if (!isRow(fields)) return no(null, "That could not be added.");
    if (Object.keys(fields).some((key) => /[a-z][A-Z]/.test(key))) {
      warnOnce(warned, "camel", `[borel-store] "${name}": row keys are written like a table's columns (days_done, not daysDone), so the collection can move to the person's account later.`);
    }
    const at = iso(nowFn());
    const current = Array.isArray(store.get()) ? store.get() : [];
    const position = manual ? current.reduce((max, row) => (isRow(row) && typeof row.position === "number" && row.position > max ? row.position : max), -1) + 1 : undefined;
    const row = { ...fields, id: typeof fields.id === "string" && fields.id ? fields.id : uuid(), created_at: at, updated_at: at, ...(manual ? { position } : {}) };
    store.set((prev) => [...(Array.isArray(prev) ? prev : []), row]);
    return ok(row);
  }

  function update(id, patch) {
    const current = (Array.isArray(store.get()) ? store.get() : []).find((row) => isRow(row) && row.id === id);
    if (!current) return no(null, "That item is no longer here.");
    const change = typeof patch === "function" ? patch(current) : patch;
    if (!isRow(change)) return no(null, "That could not be changed.");
    const next = { ...current, ...change, id: current.id, created_at: current.created_at, updated_at: iso(nowFn()) };
    store.set((prev) => (Array.isArray(prev) ? prev.map((row) => (isRow(row) && row.id === id ? next : row)) : prev));
    return ok(next);
  }

  function remove(idOrIds) {
    const ids = new Set(Array.isArray(idOrIds) ? idOrIds : [idOrIds]);
    const raw = Array.isArray(store.get()) ? store.get() : [];
    const taken = [];
    raw.forEach((row, index) => {
      if (isRow(row) && ids.has(row.id)) taken.push({ row, index });
    });
    if (taken.length === 0) return ok([]);
    remember(taken);
    store.set((prev) => (Array.isArray(prev) ? prev.filter((row) => !(isRow(row) && ids.has(row.id))) : prev));
    return ok(taken.map((t) => t.row));
  }

  function clear() {
    const raw = Array.isArray(store.get()) ? store.get() : [];
    if (raw.length === 0) return ok([]);
    remember(raw.map((row, index) => ({ row, index })));
    store.set([]);
    return ok(raw.filter(isRow));
  }

  function undo() {
    let entry = undoStack.pop();
    while (entry && nowFn() - entry.at > UNDO_MS) entry = undoStack.pop();
    if (!entry) return ok([]);
    const restored = [];
    store.set((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const present = new Set(next.filter(isRow).map((row) => row.id));
      for (const { row, index } of entry.rows) {
        if (!isRow(row) || present.has(row.id)) continue;
        next.splice(Math.min(Math.max(index, 0), next.length), 0, row);
        restored.push(row);
      }
      return next;
    });
    return ok(restored);
  }

  function move(id, toIndex) {
    if (!manual) {
      warnOnce(warned, "move", `[borel-store] "${name}": move() is for a collection created with { order: "manual" }.`);
      return ok(get());
    }
    const list = [...get()];
    const from = list.findIndex((row) => row.id === id);
    if (from < 0) return no(get(), "That item is no longer here.");
    const [row] = list.splice(from, 1);
    list.splice(Math.min(Math.max(Math.round(toIndex), 0), list.length), 0, row);
    const position = new Map(list.map((r, index) => [r.id, index]));
    store.set((prev) => (Array.isArray(prev) ? prev.map((r) => (isRow(r) && position.has(r.id) && r.position !== position.get(r.id) ? { ...r, position: position.get(r.id) } : r)) : prev));
    return ok(get());
  }

  function use() {
    return sorted(store.use());
  }
  function useItem(id) {
    return use().find((row) => row.id === id) ?? null;
  }
  // A value worked out from the rows: a total, a streak, a grouping. Computed
  // when the rows change, never inside the store's snapshot.
  function useDerived(fn, deps) {
    const rows = use();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return React.useMemo(() => fn(rows), [rows, ...(Array.isArray(deps) ? deps : [])]);
  }

  const collection = {
    name,
    use,
    useItem,
    useStatus: store.useStatus,
    useDerived,
    status: store.status,
    get,
    insert,
    update,
    remove,
    clear,
    undo,
    move,
    reload: () => ok(get()),
    loadMore: () => ok(get()),
    subscribe: store.subscribe,
  };
  collections.set(name, collection);
  return collection;
}

// --- The app over time ------------------------------------------------------------
//
// "First open, after the first action, returning" is what makes an app feel
// alive, and it used to take a persistence design per app. Three small hooks,
// saved under reserved keys.

const VISIT_KEY = "borel:visit";
const FIRST_RUN_KEY = "borel:first-run";
const MILESTONES_KEY = "borel:milestones";
// Reopening within half an hour is the same visit: a preview reloads on every
// change, and that must not read as thirty visits.
const SESSION_MS = 30 * 60 * 1000;
const NOT_READY_VISIT = Object.freeze({ ready: false, first: false, count: 0, daysSinceLast: null, lastAt: null });

let visitSnapshot = NOT_READY_VISIT;
let visitStarted = false;
const visitListeners = new Set();
const claimedMilestones = new Set();
const finishers = new Map();

function memoryOptions() {
  return { persist: true, ...(memoryStorage ? { storage: memoryStorage } : {}) };
}

// Whole calendar days between two moments, in the phone's own time zone.
function calendarDaysBetween(thenIso, nowMs) {
  const then = new Date(thenIso);
  const now = new Date(nowMs);
  if (Number.isNaN(then.getTime())) return null;
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

function startVisit() {
  if (visitStarted) return;
  visitStarted = true;
  const store = createStore(VISIT_KEY, { count: 0, first_at: null, last_at: null, previous_at: null }, memoryOptions());
  const settle = () => {
    if (visitSnapshot.ready || !store.status().ready) return;
    const saved = store.get() || {};
    const now = nowFn();
    const count = typeof saved.count === "number" ? saved.count : 0;
    const sameVisit = count > 0 && typeof saved.last_at === "string" && now - Date.parse(saved.last_at) < SESSION_MS;
    const nextCount = sameVisit ? count : count + 1;
    const previous = sameVisit ? saved.previous_at ?? null : saved.last_at ?? null;
    // Decided once and kept for as long as the app is open: a screen must not
    // flip from "welcome" to "welcome back" because the save landed.
    visitSnapshot = Object.freeze({
      ready: true,
      first: nextCount === 1,
      count: nextCount,
      daysSinceLast: previous ? calendarDaysBetween(previous, now) : null,
      lastAt: previous,
    });
    store.set({ count: nextCount, first_at: saved.first_at ?? iso(now), last_at: iso(now), previous_at: previous });
    for (const listener of visitListeners) listener();
  };
  store.subscribeStatus(settle);
  store.subscribe(settle);
  settle();
}

function subscribeVisit(listener) {
  visitListeners.add(listener);
  return () => {
    visitListeners.delete(listener);
  };
}

/** This visit, without a hook: `{ ready, first, count, daysSinceLast, lastAt }`. */
export function getVisit() {
  startVisit();
  return visitSnapshot;
}

/**
 * How the person comes to the app today: `const { ready, first, count,
 * daysSinceLast } = useVisit()`. `first` is true for the whole first visit and
 * never again; `daysSinceLast` is null on it, 0 later the same day. Until
 * `ready`, `first` is false, so someone returning never sees a welcome flash.
 */
export function useVisit() {
  startVisit();
  return useSyncExternalStore(subscribeVisit, getVisit, getVisit);
}

function firstRunStore() {
  return createStore(FIRST_RUN_KEY, {}, memoryOptions());
}

function finisherFor(key) {
  let finish = finishers.get(key);
  if (!finish) {
    finish = () => firstRunStore().set((prev) => (prev && prev[key] ? prev : { ...(prev || {}), [key]: iso(nowFn()) }));
    finishers.set(key, finish);
  }
  return finish;
}

/** A first run, without a hook: `{ ready, done, finish }`. */
export function firstRun(key) {
  const name = typeof key === "string" && key ? key : "default";
  const store = firstRunStore();
  return { ready: store.status().ready, done: Boolean((store.get() || {})[name]), finish: finisherFor(name) };
}

/**
 * Something shown once: `const { ready, done, finish } = useFirstRun("welcome")`.
 * Show it when `ready && !done`, and call `finish()` when the person is through
 * it (or skips it). It stays done for good. Separate keys are separate runs.
 */
export function useFirstRun(key) {
  const name = typeof key === "string" && key ? key : "default";
  const store = firstRunStore();
  const value = store.use();
  const status = store.useStatus();
  return { ready: status.ready, done: Boolean((value || {})[name]), finish: finisherFor(name) };
}

/** Claims a milestone: true the first time ever, false every time after. */
export function claimMilestone(id) {
  if (typeof id !== "string" || !id) return false;
  const store = createStore(MILESTONES_KEY, {}, memoryOptions());
  if (!store.status().ready) return false;
  if (claimedMilestones.has(id) || (store.get() || {})[id]) return false;
  claimedMilestones.add(id);
  store.set((prev) => ({ ...(prev || {}), [id]: iso(nowFn()) }));
  return true;
}

/**
 * A moment that happens once: `useMilestone("week-streak", streak >= 7, () =>
 * setCelebrating(true))`. `onReach` runs the first time `reached` is true and
 * never again, not on the next launch and not when the screen mounts twice.
 * Returns whether it has ever been reached.
 */
export function useMilestone(id, reached, onReach) {
  const store = createStore(MILESTONES_KEY, {}, memoryOptions());
  const value = store.use();
  const status = store.useStatus();
  const callback = React.useRef(onReach);
  callback.current = onReach;
  React.useEffect(() => {
    if (!status.ready || !reached) return;
    if (claimMilestone(id) && typeof callback.current === "function") callback.current();
  }, [status.ready, reached, id]);
  return Boolean((value || {})[id]);
}

/**
 * For tests of this file: a storage and a clock to use instead of the phone's,
 * and `reset` to forget this run's visit, claims and collections. An app never
 * calls it.
 */
export function configureAppMemory(options) {
  const opts = options || {};
  if ("storage" in opts) memoryStorage = opts.storage || null;
  if (typeof opts.now === "function") nowFn = opts.now;
  if (opts.reset) {
    visitSnapshot = NOT_READY_VISIT;
    visitStarted = false;
    visitListeners.clear();
    claimedMilestones.clear();
    finishers.clear();
    for (const key of [VISIT_KEY, FIRST_RUN_KEY, MILESTONES_KEY]) stores.delete(key);
  }
}
