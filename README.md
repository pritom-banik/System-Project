# Focus Keeper

Focus Keeper is a productivity tool consisting of a Chrome extension and a local Node.js server. The extension helps users maintain focus on YouTube by filtering distracting content (e.g., hiding comments and irrelevant video suggestions) based on semantic similarity analysis. The server uses Ollama with the `bge-m3:latest` model to generate embeddings for content comparison, ensuring everything runs locally without external APIs.

## Features

- **Chrome Extension**:
  - Hide YouTube comments and video suggestions.
  - Intelligent filtering of suggested videos based on similarity to the main video.
  - Take notes on videos with inline Markdown support.
  - Dark/light theme toggle.
  - Persistent settings via Chrome storage.

- **Local Server**:
  - REST API for embedding generation and similarity scoring.
  - Cosine similarity calculation for video title comparison.
  - Runs multiple instances for load balancing (via PM2 and Nginx).

## Prerequisites

Before setting up, ensure the following are installed on your system:

- **Node.js**: Version 16 or later (download from [nodejs.org](https://nodejs.org/)).
- **Google Chrome**: Latest version (required for the extension).
- **Ollama**: For local AI model inference.
  - Install from [ollama.ai](https://ollama.ai/).
  - Pull the required model: `bge-m3:latest`.
- **Redis** (optional, for future message queue): Install via Docker or locally.
- **PM2** (optional, for production-like setup): Install globally with `npm install -g pm2`.
- **Nginx** (optional, for load balancing): Install via your OS package manager.

Verify installations:
- `node --version`
- `ollama --version`
- `ollama pull bge-m3:latest` (pull the model)

## Installation and Setup

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd "System project-main"
   ```

2. **Set Up the Server**:
   - Navigate to the server directory:
     ```bash
     cd server
     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - (Optional) For message queue support (future enhancement), install Bull and Redis:
     ```bash
     npm install bull redis
     ```
     Start Redis: `redis-server` (or via Docker: `docker run -d -p 6379:6379 redis`).

3. **Set Up the Chrome Extension**:
   - No installation needed for the extension files—they are ready to load.
   - Ensure the server is running (see below) before loading the extension, as it communicates with `http://localhost:8000`.

## Running the Application

1. **Start Ollama and the Model**:
   - Ensure Ollama is running: `ollama serve` (in a separate terminal).
   - Verify the model is available: `ollama list` (should show `bge-m3:latest`).

2. **Start the Server**:
   - In the `server/` directory:
     ```bash
     npm start
     ```
     The server will run on `http://localhost:8000` by default.
   - (Optional) For production-like setup with PM2:
     ```bash
     pm2 start ecosystem.config.js
     ```
     This starts multiple server instances (ports 8000, 8001, etc.).
   - (Optional) Configure Nginx for load balancing:
     - Copy `nginx.conf` to your Nginx config directory (e.g., `/etc/nginx/nginx.conf` on Linux).
     - Reload Nginx: `sudo nginx -s reload`.
     - The server will be accessible via Nginx (default port 80).

3. **Load the Chrome Extension**:
   - Open Chrome and go to `chrome://extensions/`.
   - Enable "Developer mode" (toggle in the top-right).
   - Click "Load unpacked".
   - Select the `Focus Keeper/` folder from the project root.
   - The extension icon should appear in the Chrome toolbar.

4. **Test the Setup**:
   - Open a YouTube video in Chrome.
   - Click the Focus Keeper extension icon to open the popup.
   - Toggle settings (e.g., hide comments, enable filtering).
   - Check the browser console (F12 > Console) for logs from the extension and server.
   - The server logs will show embedding requests and similarity scores.

## Usage

- **Extension Popup**:
  - Toggle "Filter Enabled" to activate intelligent suggestion filtering.
  - Hide comments or suggestions independently.
  - Switch themes (dark/light).
  - Settings are saved automatically.

- **On YouTube**:
  - Suggested videos are filtered based on similarity to the main video (threshold: 0.35).
  - Take notes: Click "Notes" in the popup to open a note-taking interface.
  - Notes support Markdown and are saved per video.

- **API Endpoints** (for testing/debugging):
  - `GET /`: Server status page.
  - `POST /ans`: Compare video titles (expects JSON: `{ "maintitle": "string", "title": "string" }`).
    - Response: `{ "Success": boolean, "similarity": number }`.

## Project Structure

```
System project-main/
│
├── Focus Keeper/                    # Chrome extension
│   ├── manifest.json                # Extension manifest (v3)
│   ├── popup.html                   # Extension popup UI
│   ├── style.css                    # Popup styles
│   ├── images/                      # Icons and assets
│   │   ├── logo16.png
│   │   ├── logo.png
│   │   └── logo128.png
│   └── scripts/
│       ├── background.js            # Service worker (handles API calls)
│       ├── content.js               # Content script (modifies YouTube page)
│       ├── popup.js                 # Popup logic
│       └── final.md                 # Notes on YouTube DOM manipulation
│
├── server/                          # Node.js backend
│   ├── server.js                    # Main server file (Express app)
│   ├── package.json                 # Dependencies
│   ├── ecosystem.config.js          # PM2 config for multiple instances
│   └── nginx.conf                   # Nginx config for load balancing
│
└── README.md                        # This file
```

## Troubleshooting

- **Extension not loading**: Ensure "Developer mode" is enabled in `chrome://extensions/`.
- **Server connection errors**: Check if the server is running on port 8000. Update URLs in `background.js` if needed.
- **Ollama errors**: Ensure the model `bge-m3:latest` is pulled and Ollama is running on `http://localhost:11434`.
- **Filtering not working**: Open YouTube in an incognito window or refresh the page after enabling settings.
- **Performance**: If slow, reduce server instances or check Ollama resource usage.



