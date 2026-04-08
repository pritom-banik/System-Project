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
        return true;
      }
    })();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NEW_VIDEO") {
    // We immediately execute the async function
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
        
        // This log will appear in the BACKGROUND script console
        console.log(`Title: ${message.title} | Score: ${data.similarity} | Success: ${data.Success}`);
        
        // Send the actual server result back to the content script
        sendResponse({ result: data.Success, score: data.similarity });
      } catch (error) {
        console.error("Fetch Error:", error);
        // Default to showing the video if the server is down
        sendResponse({ result: true }); 
      }
    })();

    return true; // Keep the channel open for the async response
  }
});