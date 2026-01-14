console.log('Background script loaded');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYZE_VIDEOS') {
    analyzeWithGemini(request.currentTitle, request.suggestedTitles)
      .then(relevantVideos => {
        sendResponse({ relevantVideos });
      })
      .catch(error => {
        console.error('Gemini API error:', error);
        sendResponse({ relevantVideos: [] });
      });
    return true; // Keep channel open for async response
  }
});

// Analyze videos using Gemini API
async function analyzeWithGemini(currentTitle, suggestedTitles) {
  try {
    // Get API key from storage
    const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
    
    if (!geminiApiKey) {
      console.error('No Gemini API key found. Please set it in the extension popup.');
      return [];
    }

    const prompt = `You are analyzing YouTube video recommendations.

Current video being watched: "${currentTitle}"

Suggested videos:
${suggestedTitles.map((title, i) => `${i + 1}. ${title}`).join('\n')}

Task: Identify which suggested videos are highly relevant and aligned with the current video's topic, theme, or subject matter.

Return ONLY a JSON array of the exact titles of relevant videos. If none are relevant, return an empty array.

Example format:
["Video title 1", "Video title 3"]

Important:
- Only include videos that are directly related to the current video's topic
- Match the titles EXACTLY as provided
- Return only the JSON array, no other text`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.error('No response from Gemini');
      return [];
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }

    const relevantVideos = JSON.parse(jsonText);
    
    if (!Array.isArray(relevantVideos)) {
      console.error('Invalid response format from Gemini');
      return [];
    }

    return relevantVideos;

  } catch (error) {
    console.error('Error in analyzeWithGemini:', error);
    return [];
  }
}