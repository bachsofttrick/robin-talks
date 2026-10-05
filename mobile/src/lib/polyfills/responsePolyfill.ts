// Hermes in Expo Go has Response but not its static Response.json().
// @neondatabase/auth calls it in beforeFetch when the session cache hits,
// so the second getSession() throws "undefined is not a function" on a phone
// while the same code works on web, where the static exists. Back it with the
// constructor before the rest of the app is imported.
type ResponseWithJson = typeof Response & { json?: (data: unknown, init?: ResponseInit) => Response };

const R = globalThis.Response as ResponseWithJson | undefined;

if (R && typeof R.json !== "function") {
  R.json = (data, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return new R(JSON.stringify(data), { ...init, headers });
  };
}
