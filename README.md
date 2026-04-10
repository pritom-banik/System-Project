# System-Project

This project connects a Chrome extension with a local Node.js server powered by Ollama using the `all-minilm:latest` model. It processes YouTube content locally by generating embeddings via Ollama.

Everything runs locally — no external APIs required.

---

## Prerequisites

Make sure the following are installed on your system:

- Node.js (v16 or later recommended)
- Google Chrome
- Ollama
- Local model **bge-m3:latest**

---

# HOW TO RUN

- You need to install Ollama in your pc.
  - For checkin ollama installation is successful run `ollama --version` 
- Then pull and run **`all-minilm:latest`** through Command Prompt
- Now Clone this repo 
- Go to server folder
  - For first time run `npm install`
  - Then run `npm start`
- Go to Chrome
  - Go to `chrome://extensions/`
  - Enable **Developer Mode**
  - Click **Load unpacked**
  - Select the `chrome extension 02` folder
- Now play youtube

## Project structure
  
```bash
project-root/
│
├── server/                    # Node.js backend
│   ├── package.json
│   └── ...
│
├── chrome extension 02/       # Chrome extension files
│   ├── manifest.json
│   └── ...
│
└── README.md
```

