import { createStore } from "../../../borel-store";

export interface StoreStatus {
  ready: boolean;
  error: string | null;
  detail: string | null;
  retry: () => void;
}

export interface AppStore<T> {
  use: () => T;
  useStatus: () => StoreStatus;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  reset: () => void;
}

const registry = new Map<string, AppStore<unknown>>();

export function createAppStore<T>(key: string, initial: T): AppStore<T> {
  const existing = registry.get(key);
  if (existing) return existing as AppStore<T>;
  const store = createStore(key, initial) as {
    use: () => T;
    useStatus: () => StoreStatus;
    get: () => T;
    set: (next: T | ((prev: T) => T)) => void;
    subscribe: (listener: () => void) => () => void;
    reset: () => void;
  };
  const appStore: AppStore<T> = {
    use: () => store.use(),
    useStatus: () => store.useStatus(),
    get: () => store.get(),
    set: (next) => store.set(next),
    subscribe: (listener) => store.subscribe(listener),
    reset: () => store.reset(),
  };
  registry.set(key, appStore as AppStore<unknown>);
  return appStore;
}
