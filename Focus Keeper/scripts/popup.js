const STORAGE_KEYS = {
  filterEnabled: "focusKeeper.filterEnabled",
  hideComments: "focusKeeper.hideComments",
  hideSuggestions: "focusKeeper.hideSuggestions",
  theme: "focusKeeper.theme",
};

const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.filterEnabled]: false,
  [STORAGE_KEYS.hideComments]: true,
  [STORAGE_KEYS.hideSuggestions]: false,
  [STORAGE_KEYS.theme]: "dark",
};

let statusTimer = null;

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(payload) {
  return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendMessageToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { ok: false, reason: "No active tab found." };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    return response ?? { ok: true };
  } catch (error) {
    console.warn("Could not reach active tab:", error);
    return { ok: false, reason: "Open a YouTube video tab before using this feature." };
  }
}

function showStatus(message) {
  const status = document.getElementById("statusMessage");
  if (!status) return;

  status.hidden = false;
  status.textContent = message;

  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    status.hidden = true;
    status.textContent = "";
  }, 2800);
}

function updateSwitch(id, value) {
  const element = document.getElementById(id);
  if (element) element.classList.toggle("on", Boolean(value));
}

function applyTheme(theme) {
  document.body.classList.toggle("light", theme === "light");
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = theme === "light" ? "🌙" : "☀️";
}

function mapSwitchIdToStorage(id) {
  if (id === "sw-filter") return STORAGE_KEYS.filterEnabled;
  if (id === "sw-comments") return STORAGE_KEYS.hideComments;
  if (id === "sw-suggest") return STORAGE_KEYS.hideSuggestions;
  return null;
}

async function syncContentControls() {
  const settings = await getStorage([
    STORAGE_KEYS.hideComments,
    STORAGE_KEYS.hideSuggestions,
  ]);

  await sendMessageToActiveTab({
    type: "FOCUS_KEEPER_UPDATE_CONTROLS",
    hideComments: settings[STORAGE_KEYS.hideComments] ?? DEFAULT_SETTINGS[STORAGE_KEYS.hideComments],
    hideSuggestions: settings[STORAGE_KEYS.hideSuggestions] ?? DEFAULT_SETTINGS[STORAGE_KEYS.hideSuggestions],
  });
}

window.toggle = async function toggle(id) {
  const storageKey = mapSwitchIdToStorage(id);
  if (!storageKey) return;

  const element = document.getElementById(id);
  const nextValue = !element.classList.contains("on");
  updateSwitch(id, nextValue);
  await setStorage({ [storageKey]: nextValue });

  if (id === "sw-filter") {
    await sendMessageToActiveTab({ type: "FOCUS_KEEPER_SET_FILTER", enabled: nextValue });
  } else {
    await syncContentControls();
  }
};

window.doCapture = async function doCapture() {
  const button = document.getElementById("captureBtn");
  const label = document.getElementById("captureLabel");
  button.classList.add("capturing");
  label.textContent = "Opening Notepad";

  const result = await sendMessageToActiveTab({ type: "FOCUS_KEEPER_TOGGLE_NOTEPAD" });

  if (result?.ok === false) {
    button.classList.remove("capturing");
    label.textContent = "Open Notepad";
    showStatus(result.reason || "Could not open the notepad.");
  } else {
    window.close();
  }
};

window.openSettings = function openSettings() {
  showStatus("Settings are coming soon. The note editor and content controls are ready to use.");
};

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getStorage(Object.values(STORAGE_KEYS));
  const merged = { ...DEFAULT_SETTINGS, ...settings };

  applyTheme(merged[STORAGE_KEYS.theme]);
  updateSwitch("sw-filter", merged[STORAGE_KEYS.filterEnabled]);
  updateSwitch("sw-comments", merged[STORAGE_KEYS.hideComments]);
  updateSwitch("sw-suggest", merged[STORAGE_KEYS.hideSuggestions]);

  document.getElementById("themeToggleBtn").addEventListener("click", async () => {
    const current = document.body.classList.contains("light") ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    await setStorage({ [STORAGE_KEYS.theme]: next });
    await sendMessageToActiveTab({ type: "FOCUS_KEEPER_SET_THEME", theme: next });
  });

  document.getElementById("toggle-filter").addEventListener("click", () => {
    window.toggle("sw-filter");
  });

  document.getElementById("toggle-comments").addEventListener("click", () => {
    window.toggle("sw-comments");
  });

  document.getElementById("toggle-suggest").addEventListener("click", () => {
    window.toggle("sw-suggest");
  });

  document.getElementById("captureBtn").addEventListener("click", () => {
    window.doCapture();
  });

  document.getElementById("openSettingsBtn").addEventListener("click", () => {
    window.openSettings();
  });

  document.getElementById("contactBtn").addEventListener("click", () => {
    showStatus("Reach us at: focuskeeper@example.com");
  });

  await syncContentControls();
});
