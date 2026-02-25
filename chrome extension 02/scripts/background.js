chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VIDEO_TITLE") {
    fetch("http://localhost:8000/main", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: message.title,
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Response:", data);
      })
      .catch((error) => console.error("Error:", error));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NEW_VIDEO") {
    let isValid = true;
    fetch("http://localhost:8000/ans", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: message.title,
    })
      .then((response) => response.json())
      .then((data) => {
        // Now you can safely store it in a variable
         isValid = data.Success;
        console.log(isValid, "=>", message.title);
      })
      .catch((error) => console.error("Error:", error));
  }
});