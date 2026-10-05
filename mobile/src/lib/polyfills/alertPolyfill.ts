import { Alert, Platform } from "react-native";

// react-native-web ships Alert as an empty method (static alert() {}), so on
// the web preview nothing happens when a screen asks the person a question:
// the consent prompt, "Finish now", and the refusal notice all silently do
// nothing. This backs Alert.alert with a DOM dialog that carries the same
// shape: a title, a message, buttons with onPress, and the cancelable /
// onDismiss pair Android uses. Imported from expo-entry.js before the app.

type WebAlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: "default" | "cancel" | "destructive";
};

type WebAlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

type OpenAlert = {
  cancelable: boolean;
  onDismiss?: () => void;
  element: HTMLElement;
};

const STYLE_ID = "rn-alert-polyfill-styles";
const openAlerts: OpenAlert[] = [];
let keyListenerInstalled = false;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    ".rn-alert-backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,0.45);z-index:2147483647;}",
    ".rn-alert-box{width:100%;max-width:320px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.25);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}",
    ".rn-alert-title{margin:0;padding:20px 20px 2px;font-size:17px;font-weight:600;line-height:1.3;text-align:center;color:#111;}",
    ".rn-alert-message{margin:0;padding:6px 20px 18px;font-size:14px;line-height:1.4;text-align:center;color:#3c3c43;}",
    ".rn-alert-buttons{display:flex;flex-direction:column;border-top:1px solid rgba(0,0,0,0.1);}",
    ".rn-alert-button{appearance:none;border:0;margin:0;padding:14px;font:inherit;font-size:17px;color:#0a84ff;background:transparent;cursor:pointer;border-top:1px solid rgba(0,0,0,0.1);}",
    ".rn-alert-buttons>.rn-alert-button:first-child{border-top:0;}",
    ".rn-alert-button:hover{background:rgba(0,0,0,0.04);}",
    ".rn-alert-button.rn-alert-cancel{font-weight:600;}",
    ".rn-alert-button.rn-alert-destructive{color:#ff3b30;}",
  ].join("");
  document.head.appendChild(style);
}

function closeAlert(entry: OpenAlert, dismissed: boolean): void {
  const index = openAlerts.indexOf(entry);
  if (index === -1) return;
  openAlerts.splice(index, 1);
  entry.element.remove();
  if (dismissed) entry.onDismiss?.();
}

function installKeyListener(): void {
  if (keyListenerInstalled) return;
  keyListenerInstalled = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const top = openAlerts[openAlerts.length - 1];
    if (!top || !top.cancelable) return;
    event.preventDefault();
    closeAlert(top, true);
  });
}

export function showWebAlert(
  title?: string | null,
  message?: string | null,
  buttons?: WebAlertButton[] | null,
  options?: WebAlertOptions | null,
): void {
  if (typeof document === "undefined") return;
  injectStyles();

  const list: WebAlertButton[] = buttons && buttons.length ? buttons.slice() : [{ text: "OK" }];
  const cancelable = options?.cancelable === true;

  const backdrop = document.createElement("div");
  backdrop.className = "rn-alert-backdrop";

  const box = document.createElement("div");
  box.className = "rn-alert-box";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-modal", "true");
  if (typeof title === "string" && title) box.setAttribute("aria-label", title);

  if (typeof title === "string" && title) {
    const heading = document.createElement("p");
    heading.className = "rn-alert-title";
    heading.textContent = title;
    box.appendChild(heading);
  }
  if (typeof message === "string" && message) {
    const body = document.createElement("p");
    body.className = "rn-alert-message";
    body.textContent = message;
    box.appendChild(body);
  }

  const entry: OpenAlert = { cancelable, onDismiss: options?.onDismiss, element: backdrop };

  const row = document.createElement("div");
  row.className = "rn-alert-buttons";
  for (const button of list) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "rn-alert-button";
    if (button.style === "cancel") el.classList.add("rn-alert-cancel");
    if (button.style === "destructive") el.classList.add("rn-alert-destructive");
    el.textContent = button.text || (button.style === "cancel" ? "Cancel" : "OK");
    el.addEventListener("click", () => {
      closeAlert(entry, false);
      button.onPress?.();
    });
    row.appendChild(el);
  }
  box.appendChild(row);
  backdrop.appendChild(box);

  if (cancelable) {
    backdrop.addEventListener("click", (event) => {
      if (event.target !== backdrop) return;
      closeAlert(entry, true);
    });
    installKeyListener();
  }

  openAlerts.push(entry);
  document.body.appendChild(backdrop);
  row.querySelector("button")?.focus();
}

if (Platform.OS === "web") {
  (Alert as unknown as { alert: typeof showWebAlert }).alert = showWebAlert;
}
