let darkMode = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // WORD COUNTER
  if (request.action === "COUNT_WORDS") {
    const text = document.body.innerText;
    const words = text.trim().split(/\s+/).length;
    sendResponse({ count: words });
  }

  // DARK MODE
  if (request.action === "TOGGLE_DARK") {
    if (!darkMode) {
      document.body.style.backgroundColor = "#121212";
      document.body.style.color = "white";
    } else {
      document.body.style.backgroundColor = "";
      document.body.style.color = "";
    }
    darkMode = !darkMode;
  }

});
