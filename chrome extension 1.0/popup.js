const countBtn = document.getElementById("countWords");
const darkBtn = document.getElementById("toggleDark");
const result = document.getElementById("result");

// WORD COUNT
countBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "COUNT_WORDS" },
      (response) => {
        result.textContent = "Words: " + response.count;
      }
    );
  });
});

// DARK MODE
darkBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "TOGGLE_DARK" });
  });
});
