const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const port = 8000;

app.use(cors());
app.use(express.text());

let mainEmbedding = null;

// Cosine similarity
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
  const response = await axios.post("http://localhost:11434/api/embeddings", {
    model: "all-minilm",
    prompt: title
  });

  return response.data.embedding;
}

// Save main video embedding
app.post("/main", async (req, res) => {
  try {
    console.log("Main title:", req.body);
    mainEmbedding = await getEmbedding(req.body);
    res.json({ Success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ Success: false });
  }
});

// Compare suggested video
app.post("/ans", async (req, res) => {
  try {
    console.log("Suggested title:", req.body);

    if (!mainEmbedding) {
      return res.status(400).json({ Success: false, message: "Main title not set" });
    }


    const suggestedEmbedding = await getEmbedding(req.body);

    const score = cosineSimilarity(mainEmbedding, suggestedEmbedding);
    console.log("Similarity score:", score);

    const isValid = score >= 0.15;

    res.json({ Success: isValid, similarity: score });

  } catch (err) {
    console.error(err);
    res.status(500).json({ Success: false });
  }
});

app.listen(port, () => {
  console.log("Server started for api");
});