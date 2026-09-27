import { createAppStore } from "./store";

describe("createAppStore", () => {
  test("get returns the initial value and set replaces it", () => {
    const store = createAppStore<number>("test.get-set", 1);
    expect(store.get()).toBe(1);
    store.set(2);
    expect(store.get()).toBe(2);
  });

  test("set accepts a functional update", () => {
    const store = createAppStore<number>("test.functional", 1);
    store.set((prev) => prev + 1);
    expect(store.get()).toBe(2);
  });

  test("subscribe notifies and unsubscribe stops notifications", () => {
    const store = createAppStore<number>("test.subscribe", 0);
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("equal value does not notify", () => {
    const store = createAppStore<number>("test.equal", 0);
    const listener = jest.fn();
    store.subscribe(listener);
    store.set(0);
    expect(listener).not.toHaveBeenCalled();
  });

  test("reset returns to the initial value", () => {
    const store = createAppStore<number>("test.reset", 5);
    store.set(9);
    expect(store.get()).toBe(9);
    store.reset();
    expect(store.get()).toBe(5);
  });

  test("the same key returns the same store", () => {
    const first = createAppStore<number>("test.same-key", 1);
    const second = createAppStore<number>("test.same-key", 2);
    expect(second).toBe(first);
    expect(second.get()).toBe(first.get());
  });
});
