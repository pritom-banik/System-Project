// import { configDotenv } from "dotenv";
// import { GoogleGenAI } from "@google/genai";

// configDotenv();

// const apiKey=process.env.GEMINI_API_KEY;

// // The client gets the API key from the environment variable `GEMINI_API_KEY`.
// const ai = new GoogleGenAI({apiKey});

// async function main() {
//   const response = await ai.models.generateContent({
//     model: "gemini-2.5-flash",
//     contents: "Explain how AI works in a few words",
//   });
//   console.log(response.text);
// }

// main();

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "" });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Explain about KUET,Bangladesh in few lines",
  });
  console.log(response.text);
}

main();