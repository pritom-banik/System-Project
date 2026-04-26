const STORAGE_KEYS = {
  filterEnabled: "focusKeeper.filterEnabled",
  focusSearch: "focusKeeper.focusSearch",
  hideComments: "focusKeeper.hideComments",
  hideSuggestions: "focusKeeper.hideSuggestions",
  theme: "focusKeeper.theme",
};

function getTimerKeys(tabId) {
  return {
    sessionAcc: `focusKeeper.session.acc.${tabId}`,
    sessionSeg: `focusKeeper.session.seg.${tabId}`,
    videoAcc:   `focusKeeper.video.acc.${tabId}`,
    videoSeg:   `focusKeeper.video.seg.${tabId}`,
    videoTitle: `focusKeeper.video.title.${tabId}`,
  };
}

const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.filterEnabled]: false,
  [STORAGE_KEYS.focusSearch]: false,
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
  if (id === "sw-focus-search") return STORAGE_KEYS.focusSearch;
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

async function toggleSwitch(id) {
  const storageKey = mapSwitchIdToStorage(id);
  if (!storageKey) return;

  const element = document.getElementById(id);
  const nextValue = !element.classList.contains("on");
  updateSwitch(id, nextValue);
  await setStorage({ [storageKey]: nextValue });

  if (id === "sw-filter") {
    await sendMessageToActiveTab({ type: "FOCUS_KEEPER_SET_FILTER", enabled: nextValue });
  } else if (id === "sw-focus-search") {
    await sendMessageToActiveTab({ type: "FOCUS_KEEPER_SET_FOCUS_SEARCH", enabled: nextValue });
  } else {
    await syncContentControls();
  }
};

async function doCapture() {
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

function formatTime(totalSeconds) {
  const s = Math.floor(Math.max(0, totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function computeTimerSeconds(acc, seg) {
  return (acc || 0) + (seg ? (Date.now() - seg) / 1000 : 0);
}

function setTimerStatus(statusId, isActive) {
  const el = document.getElementById(statusId);
  if (!el) return;
  const dot = el.querySelector(".timer-status-dot");
  const text = el.querySelector(".timer-status-text");
  if (dot) dot.classList.toggle("active", isActive);
  if (text) text.textContent = isActive ? "Active" : "Paused";
}

async function refreshTimers() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const tk = getTimerKeys(tab.id);

  const data = await getStorage([tk.sessionAcc, tk.sessionSeg, tk.videoAcc, tk.videoSeg, tk.videoTitle]);

  const sessionEl = document.getElementById("timer-session-val");
  const videoEl = document.getElementById("timer-video-val");
  const videoTitleEl = document.getElementById("timer-video-title");

  if (sessionEl) sessionEl.textContent = formatTime(computeTimerSeconds(data[tk.sessionAcc], data[tk.sessionSeg]));
  if (videoEl) videoEl.textContent = formatTime(computeTimerSeconds(data[tk.videoAcc], data[tk.videoSeg]));
  if (videoTitleEl) videoTitleEl.textContent = data[tk.videoTitle] || "No active video";

  setTimerStatus("timer-session-status", Boolean(data[tk.sessionSeg]));
  setTimerStatus("timer-video-status", Boolean(data[tk.videoSeg]));
}

async function resetTimer(accKey, segKey) {
  const data = await getStorage([segKey]);
  await setStorage({ [accKey]: 0, [segKey]: data[segKey] ? Date.now() : null });
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getStorage(Object.values(STORAGE_KEYS));
  const merged = { ...DEFAULT_SETTINGS, ...settings };

  applyTheme(merged[STORAGE_KEYS.theme]);
  updateSwitch("sw-filter", merged[STORAGE_KEYS.filterEnabled]);
  updateSwitch("sw-focus-search", merged[STORAGE_KEYS.focusSearch]);
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
    toggleSwitch("sw-filter");
  });

  document.getElementById("toggle-focus-search").addEventListener("click", () => {
    toggleSwitch("sw-focus-search");
  });

  document.getElementById("toggle-comments").addEventListener("click", () => {
    toggleSwitch("sw-comments");
  });

  document.getElementById("toggle-suggest").addEventListener("click", () => {
    toggleSwitch("sw-suggest");
  });

  document.getElementById("captureBtn").addEventListener("click", () => {
    doCapture();
  });

  document.getElementById("reset-session-btn").addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (tab?.id) {
      const tk = getTimerKeys(tab.id);
      await resetTimer(tk.sessionAcc, tk.sessionSeg);
    }
    await refreshTimers();
  });

  document.getElementById("reset-video-btn").addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (tab?.id) {
      const tk = getTimerKeys(tab.id);
      await resetTimer(tk.videoAcc, tk.videoSeg);
    }
    await refreshTimers();
  });

  document.getElementById("contactBtn").addEventListener("click", () => {
    showStatus("Reach us at: focuskeeper@example.com");
  });

  await refreshTimers();
  const timerInterval = setInterval(refreshTimers, 1000);
  window.addEventListener("unload", () => clearInterval(timerInterval));

  await syncContentControls();
});
