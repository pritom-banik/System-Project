const STORAGE_KEYS = {
  filterMode: "focusKeeper.filterMode",
  filterInput: "focusKeeper.filterInput",
  hideComments: "focusKeeper.hideComments",
  hideSuggestions: "focusKeeper.hideSuggestions",
};

const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.filterMode]: "searched",
  [STORAGE_KEYS.filterInput]: "",
  [STORAGE_KEYS.hideComments]: true,
  [STORAGE_KEYS.hideSuggestions]: false,
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
  if (!status) {
    return;
  }

  status.hidden = false;
  status.textContent = message;

  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    status.hidden = true;
    status.textContent = "";
  }, 2800);
}

function updateFilterPills(mode) {
  const searched = document.getElementById("pill-searched");
  const watched = document.getElementById("pill-watched");

  searched.className = `pill ${mode === "searched" ? "pill-blue" : "pill-ghost"}`;
  watched.className = `pill ${mode === "watched" ? "pill-blue" : "pill-ghost"}`;
}

function updateSwitch(id, value) {
  const element = document.getElementById(id);
  element.classList.toggle("on", Boolean(value));
}

function mapSwitchIdToStorage(id) {
  if (id === "sw-comments") {
    return STORAGE_KEYS.hideComments;
  }

  if (id === "sw-suggest") {
    return STORAGE_KEYS.hideSuggestions;
  }

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
    hideSuggestions:
      settings[STORAGE_KEYS.hideSuggestions] ?? DEFAULT_SETTINGS[STORAGE_KEYS.hideSuggestions],
  });
}

window.setFilter = async function setFilter(mode) {
  updateFilterPills(mode);
  await setStorage({ [STORAGE_KEYS.filterMode]: mode });
};

window.toggle = async function toggle(id) {
  const storageKey = mapSwitchIdToStorage(id);
  if (!storageKey) {
    return;
  }

  const element = document.getElementById(id);
  const nextValue = !element.classList.contains("on");
  updateSwitch(id, nextValue);
  await setStorage({ [storageKey]: nextValue });
  await syncContentControls();
};

window.doCapture = async function doCapture() {
  const button = document.getElementById("captureBtn");
  const label = document.getElementById("captureLabel");
  button.classList.add("capturing");
  label.textContent = "Opening Notepad";

  const result = await sendMessageToActiveTab({ type: "FOCUS_KEEPER_TOGGLE_NOTEPAD" });

  window.setTimeout(() => {
    button.classList.remove("capturing");
    label.textContent = result?.ok === false ? "Open Notepad" : "Toggle Notepad";
  }, 400);

  if (result?.ok === false) {
    showStatus(result.reason || "Could not open the notepad.");
  }
};

window.openSettings = function openSettings() {
  showStatus("Settings are coming soon. The note editor and content controls are ready to use.");
};

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getStorage(Object.values(STORAGE_KEYS));
  const merged = { ...DEFAULT_SETTINGS, ...settings };

  updateFilterPills(merged[STORAGE_KEYS.filterMode]);
  updateSwitch("sw-comments", merged[STORAGE_KEYS.hideComments]);
  updateSwitch("sw-suggest", merged[STORAGE_KEYS.hideSuggestions]);

  const filterInput = document.getElementById("filterInput");
  filterInput.value = merged[STORAGE_KEYS.filterInput];
  filterInput.addEventListener("input", async (event) => {
    await setStorage({ [STORAGE_KEYS.filterInput]: event.target.value });
  });

  document.getElementById("pill-searched").addEventListener("click", () => {
    window.setFilter("searched");
  });

  document.getElementById("pill-watched").addEventListener("click", () => {
    window.setFilter("watched");
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

  await syncContentControls();
});
