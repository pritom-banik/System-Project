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
    console.log( message);
    (async () => {
      try {
        const response = await fetch("http://localhost:8000/ans", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maintitle: message.video_title,
            title: message.title,
          }),
        });

        const data = await response.json();


        console.log(`Title: ${message.title} | Score: ${data.similarity} | Success: ${data.Success}`);

        // Send the actual server result back to the content script
        sendResponse({ result: data.Success, score: data.similarity });
      } catch (error) {
        console.error("Fetch Error:", error);
        
        sendResponse({ result: true });
      }
    })();

    return true; // Keep the channel open for the async response
  }
});