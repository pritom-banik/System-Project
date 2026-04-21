const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());


function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error("Vector dimension mismatch");
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Get embedding from Ollama
async function getEmbedding(title) {
  try {
    const response = await axios.post("http://localhost:11434/api/embeddings", {
      model: "bge-m3:latest", 
      prompt: title,
    });
    return response.data.embedding;
  } catch (error) {
    console.error("Ollama Request Failed:", error.message);
    throw error;
  }
}

// Save main video embedding
// app.post("/main", async (req, res) => {
//   console.log("Main title:", req.body);

//   try {
//     const embedding = await getEmbedding(req.body);
//     mainEmbedding = embedding;
//     res.json({ Success: true });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ Success: false });
//   }
// });

// Compare suggested video
app.post("/ans", async (req, res) => {
  //console.log("Suggested title:", req.body);
  const { maintitle, title } = req.body;
  console.log("Maintitle:", maintitle);
console.log("Title:", title);

  try {
    const mainEmbedding=await getEmbedding(maintitle)
    const suggestedEmbedding = await getEmbedding(title);
    const score = cosineSimilarity(mainEmbedding, suggestedEmbedding);
    console.log("Suggested title:", req.body," Similarity score:", score);
    const isValid = score >= 0.35;

    res.json({ Success: isValid, similarity: score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ Success: false });
  }
});

app.listen(port, () => {
  console.log("Server started for api");
});