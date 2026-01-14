
console.log("Background service worker started......");


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VIDEO_TITLES") {
    console.log("Received video title:", message.title);
    console.log("Received video titles:", message.data);

    generateSummary(message.title,message.data)
      .then((result) => {
        console.log("Gemini response:", result);
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        console.error("!!!!!!!!!Gemini error:", error);
        sendResponse({ success: false, error: error.message });
      });


    return true;
  }
});


async function generateSummary(videoTitle,titles) {
  const API_KEY = "AIzaSyDp54uOFr0ufnzp43J_ncDep0E2Cc57vFc"; 

  const prompt = `
Summarize the following YouTube video titles in a short paragraph:

${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const data = await response.json();

  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
}
