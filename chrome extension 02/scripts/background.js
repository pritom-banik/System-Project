let reply = "";
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VIDEO_TITLES") {
    console.log("Received single title:", message.title);
    console.log("Received all titles:", message.data);
    const mainTitle = message.title;
    const suggestedTitles = message.data;

    //===========================================

    const myHeaders = new Headers();
    myHeaders.append(
      "x-goog-api-key",
      "AIzaSyCXV_pITGHF99LgpIaNzbcclPq2B0loQC4"
    );
    myHeaders.append("Content-Type", "application/json");

    const raw = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `You are analyzing YouTube video title similarity.

Main video title: "${mainTitle}"

Suggested video titles:
${suggestedTitles}

Task:
Return ONLY a JSON array of indices (numbers) for suggested titles that are semantically similar to the main title.

Criteria for similarity:
- Same topic or subject matter
- Same technology/tools discussed
- Same problem being solved
- Similar use case or application

Ignore titles that are:
- Different topics
- Tangentially related
- Generic recommendations

Response format (valid JSON array only):
[0, 5, 12]

Your response:`,
            },
          ],
        },
      ],
    });

    const requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: raw,
      redirect: "follow",
    };

    fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      requestOptions
    )
      .then((response) => response.json())
      .then((result) => {
        console.log(result);
        const text = result.candidates[0].content.parts[0].text;
        //reply=text;
        console.log(text);
        sendResponse({ result: text });
      })
      .catch((error) => {
        console.log("error in api fetching");
        console.error(error);
      });

    return true;
  }
});

// `You are analyzing YouTube video title similarity.

// Main video title: "${mainTitle}"

// Suggested video titles:
// ${suggestedTitles}

// Task:
// Return ONLY a JSON array of indices (numbers) for suggested titles that are semantically similar to the main title.

// Criteria for similarity:
// - Same topic or subject matter
// - Same technology/tools discussed
// - Same problem being solved
// - Similar use case or application

// Ignore titles that are:
// - Different topics
// - Tangentially related
// - Generic recommendations

// Response format (valid JSON array only):
// [0, 5, 12]

// Your response:`,
