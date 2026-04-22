const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 8000;

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



// Compare suggested video
app.post("/ans", async (req, res) => {
  //console.log("Suggested title:", req.body);
  const { maintitle, title } = req.body;
  console.log("Maintitle:", maintitle);
  console.log("Title:", title);

  try {
    const mainEmbedding = await getEmbedding(maintitle)
    const suggestedEmbedding = await getEmbedding(title);
    const score = cosineSimilarity(mainEmbedding, suggestedEmbedding);
    console.log("Suggested title:", req.body, " Similarity score:", score);
    const isValid = score >= 0.35;

    res.json({ Success: isValid, similarity: score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ Success: false });
  }
});



app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Focus Keeper API</title>
    </head>
    <body>
      <div class="container" style="text-align:center; padding:40px; border-radius:12px; background:linear-gradient(135deg,#667eea,#764ba2); color:white; font-family:Arial, sans-serif; box-shadow:0 8px 20px rgba(0,0,0,0.2);">
      <h1 style="margin-bottom:10px; font-size:2.5rem;"> Focus Keeper API</h1>
      <p style="font-size:1.2rem; opacity:0.9;">Your productivity companion is up and running!</p>
      <h2 style="margin-top:30px; font-size:1.5rem; color:yellow">Endpoints:${port}</h2>
      </div>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log("Focus Keeper app listening on port " + port);
});