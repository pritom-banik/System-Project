chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VIDEO_TITLE") {
    (async () => {
      try {
        const response = await fetch("http://localhost:8000/main", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: message.title,
        });

        const data = await response.json();
        console.log("Response:", data);
      } catch (error) {
        console.error("Error:", error);
      }
    })();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NEW_VIDEO") {
    let isValid = true;
    (async () => {
      try {
        const response = await fetch("http://localhost:8000/ans", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: message.title,
        });

        const data = await response.json();
        if(!data.Success){
          isValid = false;
        }
        console.log(isValid, "=>", message.title);
      } catch (error) {
        console.error("Error:", error);
      }

      if (isValid) {
        sendResponse({ result: true });
      } else {
        sendResponse({ result: false });
      }
    })();

    return true;
  }
});