console.log("Focus Keeper content script loaded");

const FOCUS_KEEPER_STORAGE = {
  hideComments: "focusKeeper.hideComments",
  hideSuggestions: "focusKeeper.hideSuggestions",
  filterEnabled: "focusKeeper.filterEnabled",
  theme: "focusKeeper.theme",
};

const NOTES_WINDOW_ID = "focus-keeper-notes-root";
const NOTES_STYLE_ID = "focus-keeper-notes-style";

let noteApp = null;
let videoInfo = [];
let saveTimer = null;
let filterEnabled = false;
const filteredElements = new Map();

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(payload) {
  return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

function getCurrentVideoKey() {
  const url = new URL(window.location.href);
  const videoId = url.searchParams.get("v");
  return videoId ? `focusKeeper.notes.${videoId}` : `focusKeeper.notes.${url.pathname}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdownToHtml(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  html = html.replace(/<u>(.*?)<\/u>/g, "<u>$1</u>");
  return html;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const html = [];
  let listType = null;
  let inCodeBlock = false;
  let codeBuffer = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
    html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
    codeBuffer = [];
    inCodeBlock = false;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeList();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) { codeBuffer.push(line); continue; }

    if (!line.trim()) { closeList(); html.push("<p><br></p>"); continue; }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    const checkboxMatch = line.match(/^[-*]\s+\[( |x)\]\s+(.*)$/i);
    if (checkboxMatch) {
      if (listType !== "ul") { closeList(); listType = "ul"; html.push("<ul>"); }
      const checked = checkboxMatch[1].toLowerCase() === "x" ? ' checked="checked"' : "";
      html.push(`<li><label><input type="checkbox"${checked}> ${inlineMarkdownToHtml(checkboxMatch[2])}</label></li>`);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (listType !== "ul") { closeList(); listType = "ul"; html.push("<ul>"); }
      html.push(`<li>${inlineMarkdownToHtml(bulletMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listType !== "ol") { closeList(); listType = "ol"; html.push("<ol>"); }
      html.push(`<li>${inlineMarkdownToHtml(orderedMatch[1])}</li>`);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      closeList();
      html.push(`<blockquote>${inlineMarkdownToHtml(quoteMatch[1])}</blockquote>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }

  closeList();
  flushCodeBlock();
  return html.join("");
}

function nodeChildrenToMarkdown(node) {
  return Array.from(node.childNodes).map((child) => nodeToMarkdown(child)).join("");
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const content = nodeChildrenToMarkdown(node);

  if (tag === "strong" || tag === "b") return `**${content}**`;
  if (tag === "em" || tag === "i") return `*${content}*`;
  if (tag === "u") return `<u>${content}</u>`;
  if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") return `\`${content}\``;
  if (tag === "a") { const href = node.getAttribute("href") || "#"; return `[${content}](${href})`; }
  if (tag === "br") return "\n";

  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
    return `${"#".repeat(Number(tag.slice(1)))} ${content.trim()}\n\n`;
  }

  if (tag === "blockquote") {
    return content.split("\n").filter(Boolean).map((line) => `> ${line}`).join("\n").concat("\n\n");
  }

  if (tag === "pre") return `\`\`\`\n${node.textContent.replace(/\n$/, "")}\n\`\`\`\n\n`;

  if (tag === "ul") {
    return Array.from(node.children).map((li) => {
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (checkbox) {
        const text = li.textContent.replace(/\s+/g, " ").trim();
        return `- [${checkbox.checked ? "x" : " "}] ${text}`;
      }
      return `- ${nodeChildrenToMarkdown(li).trim()}`;
    }).join("\n").concat("\n\n");
  }

  if (tag === "ol") {
    return Array.from(node.children)
      .map((li, index) => `${index + 1}. ${nodeChildrenToMarkdown(li).trim()}`)
      .join("\n").concat("\n\n");
  }

  if (tag === "p" || tag === "div") {
    const trimmed = content.trim();
    return trimmed ? `${trimmed}\n\n` : "\n";
  }

  if (tag === "li" || tag === "label" || tag === "span") return content;

  return content;
}

function htmlToMarkdown(html) {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = html;
  return Array.from(doc.body.childNodes)
    .map((node) => nodeToMarkdown(node))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getCurrentNoteData() {
  const storageKey = getCurrentVideoKey();
  const stored = await getStorage([storageKey]);
  return stored[storageKey] || { html: "", markdown: "" };
}

async function saveCurrentNote(payload) {
  const storageKey = getCurrentVideoKey();
  await setStorage({ [storageKey]: payload });
}

// ── NOTEPAD STYLES ──────────────────────────────────────────────────────────

function injectNotesStyles() {
  if (document.getElementById(NOTES_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = NOTES_STYLE_ID;
  style.textContent = `
    #${NOTES_WINDOW_ID} {
      --nk-bg: #0e0e10;
      --nk-header: rgba(255,255,255,0.02);
      --nk-border: rgba(255,255,255,0.09);
      --nk-text: #f4f4f5;
      --nk-muted: rgba(244,244,245,0.42);
      --nk-btn-bg: rgba(255,255,255,0.04);
      --nk-btn-bg-hover: rgba(255,255,255,0.09);
      --nk-btn-border: rgba(255,255,255,0.09);
      --nk-btn-border-hover: rgba(255,255,255,0.18);
      --nk-editor-bg: rgba(255,255,255,0.02);
      --nk-editor-border: rgba(255,255,255,0.07);
      --nk-editor-border-focus: rgba(255,255,255,0.14);
      --nk-sep: rgba(255,255,255,0.08);
      --nk-code-bg: rgba(255,255,255,0.07);
      --nk-pre-bg: rgba(255,255,255,0.04);
      --nk-quote-border: rgba(255,255,255,0.18);
      --nk-shadow: 0 20px 60px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.04) inset;
    }

    #${NOTES_WINDOW_ID}.fk-light {
      --nk-bg: #ffffff;
      --nk-header: rgba(0,0,0,0.02);
      --nk-border: rgba(0,0,0,0.09);
      --nk-text: #111111;
      --nk-muted: rgba(17,17,17,0.45);
      --nk-btn-bg: rgba(0,0,0,0.04);
      --nk-btn-bg-hover: rgba(0,0,0,0.08);
      --nk-btn-border: rgba(0,0,0,0.09);
      --nk-btn-border-hover: rgba(0,0,0,0.2);
      --nk-editor-bg: rgba(0,0,0,0.02);
      --nk-editor-border: rgba(0,0,0,0.08);
      --nk-editor-border-focus: rgba(0,0,0,0.18);
      --nk-sep: rgba(0,0,0,0.1);
      --nk-code-bg: rgba(0,0,0,0.06);
      --nk-pre-bg: rgba(0,0,0,0.03);
      --nk-quote-border: rgba(0,0,0,0.2);
      --nk-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.8) inset;
    }

    #${NOTES_WINDOW_ID} {
      position: fixed;
      top: 110px;
      right: 28px;
      width: 420px;
      min-width: 300px;
      height: 520px;
      min-height: 300px;
      max-height: calc(100vh - 40px);
      background: var(--nk-bg);
      color: var(--nk-text);
      border: 1px solid var(--nk-border);
      border-radius: 14px;
      box-shadow: var(--nk-shadow);
      z-index: 2147483647;
      display: none;
      overflow: hidden;
      resize: both;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      transition: background .2s, border-color .2s, color .2s;
    }

    #${NOTES_WINDOW_ID}.is-open {
      display: flex;
      flex-direction: column;
    }

    #${NOTES_WINDOW_ID} * { box-sizing: border-box; }

    /* Header */
    #${NOTES_WINDOW_ID} .fk-notes-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 11px 14px;
      border-bottom: 1px solid var(--nk-border);
      background: var(--nk-header);
      cursor: move;
      user-select: none;
      flex-shrink: 0;
    }

    #${NOTES_WINDOW_ID} .fk-notes-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #${NOTES_WINDOW_ID} .fk-notes-title strong {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--nk-text);
    }

    #${NOTES_WINDOW_ID} .fk-notes-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    #${NOTES_WINDOW_ID} .fk-header-btn {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1px solid var(--nk-btn-border);
      background: var(--nk-btn-bg);
      color: var(--nk-muted);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .15s, border-color .15s, color .15s;
    }

    #${NOTES_WINDOW_ID} .fk-header-btn:hover {
      background: var(--nk-btn-bg-hover);
      border-color: var(--nk-btn-border-hover);
      color: var(--nk-text);
    }

    /* Toolbar */
    #${NOTES_WINDOW_ID} .fk-toolbar-wrap {
      padding: 7px 10px;
      border-bottom: 1px solid var(--nk-border);
      background: var(--nk-header);
      flex-shrink: 0;
    }

    #${NOTES_WINDOW_ID} .fk-toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 2px;
    }

    #${NOTES_WINDOW_ID} .fk-toolbar-sep {
      width: 1px;
      height: 16px;
      background: var(--nk-sep);
      margin: 0 3px;
      flex-shrink: 0;
    }

    #${NOTES_WINDOW_ID} .fk-tool-btn {
      height: 27px;
      min-width: 27px;
      padding: 0 7px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--nk-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background .12s, color .12s, border-color .12s;
      white-space: nowrap;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
    }

    #${NOTES_WINDOW_ID} .fk-tool-btn:hover {
      background: var(--nk-btn-bg-hover);
      border-color: var(--nk-btn-border);
      color: var(--nk-text);
    }

    #${NOTES_WINDOW_ID} .fk-tool-btn[data-command="bold"] { font-weight: 700; }
    #${NOTES_WINDOW_ID} .fk-tool-btn[data-command="italic"] { font-style: italic; }
    #${NOTES_WINDOW_ID} .fk-tool-btn[data-command="underline"] { text-decoration: underline; }
    #${NOTES_WINDOW_ID} .fk-tool-btn[data-command="heading-large"],
    #${NOTES_WINDOW_ID} .fk-tool-btn[data-command="heading-medium"] { font-weight: 700; font-size: 11px; }

    /* Editor */
    #${NOTES_WINDOW_ID} .fk-editor-wrap {
      flex: 1;
      min-height: 0;
      padding: 10px;
      overflow: hidden;
    }

    #${NOTES_WINDOW_ID} .fk-rich-editor {
      width: 100%;
      height: 100%;
      border: 1px solid var(--nk-editor-border);
      border-radius: 10px;
      background: var(--nk-editor-bg);
      color: var(--nk-text);
      padding: 14px 16px 20px;
      overflow-y: auto;
      outline: none;
      line-height: 1.7;
      font-size: 14px;
      transition: border-color .15s;
    }

    #${NOTES_WINDOW_ID} .fk-rich-editor:focus {
      border-color: var(--nk-editor-border-focus);
    }

    #${NOTES_WINDOW_ID} .fk-rich-editor[contenteditable="true"]:empty::before {
      content: attr(data-placeholder);
      color: var(--nk-muted);
      pointer-events: none;
    }

    /* Typography inside editor */
    #${NOTES_WINDOW_ID} h1, #${NOTES_WINDOW_ID} h2, #${NOTES_WINDOW_ID} h3 {
      margin: 0.8em 0 0.4em;
      line-height: 1.25;
      letter-spacing: -0.02em;
      color: var(--nk-text);
    }
    #${NOTES_WINDOW_ID} h1 { font-size: 1.5rem; font-weight: 700; }
    #${NOTES_WINDOW_ID} h2 { font-size: 1.15rem; font-weight: 650; }
    #${NOTES_WINDOW_ID} h3 { font-size: 1rem; font-weight: 650; }

    #${NOTES_WINDOW_ID} p, #${NOTES_WINDOW_ID} ul,
    #${NOTES_WINDOW_ID} ol, #${NOTES_WINDOW_ID} blockquote,
    #${NOTES_WINDOW_ID} pre { margin: 0 0 0.8em; }

    #${NOTES_WINDOW_ID} blockquote {
      border-left: 2px solid var(--nk-quote-border);
      padding: 2px 0 2px 12px;
      color: var(--nk-muted);
    }

    #${NOTES_WINDOW_ID} pre,
    #${NOTES_WINDOW_ID} code { font-family: "JetBrains Mono", "Consolas", monospace; }

    #${NOTES_WINDOW_ID} code {
      padding: 1px 5px;
      border-radius: 5px;
      background: var(--nk-code-bg);
      font-size: 0.9em;
    }

    #${NOTES_WINDOW_ID} pre {
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--nk-pre-bg);
      border: 1px solid var(--nk-editor-border);
      overflow: auto;
    }

    #${NOTES_WINDOW_ID} ul, #${NOTES_WINDOW_ID} ol { padding-left: 1.3rem; }
    #${NOTES_WINDOW_ID} li + li { margin-top: 0.3rem; }

    #${NOTES_WINDOW_ID} a { color: #93c5fd; text-underline-offset: 2px; }
    #${NOTES_WINDOW_ID}.fk-light a { color: #2563eb; }

    /* Footer */
    #${NOTES_WINDOW_ID} .fk-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 10px 9px;
      border-top: 1px solid var(--nk-border);
      background: var(--nk-header);
      flex-shrink: 0;
    }

    #${NOTES_WINDOW_ID} .fk-footer-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    #${NOTES_WINDOW_ID} .fk-footer-btn {
      height: 27px;
      padding: 0 10px;
      border-radius: 7px;
      border: 1px solid var(--nk-btn-border);
      background: var(--nk-btn-bg);
      color: var(--nk-muted);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      transition: background .12s, border-color .12s, color .12s;
      white-space: nowrap;
    }

    #${NOTES_WINDOW_ID} .fk-footer-btn:hover {
      background: var(--nk-btn-bg-hover);
      border-color: var(--nk-btn-border-hover);
      color: var(--nk-text);
    }

    #${NOTES_WINDOW_ID} .fk-footer-btn.fk-btn-danger:hover {
      background: rgba(239,68,68,0.12);
      border-color: rgba(239,68,68,0.28);
      color: #fca5a5;
    }

    #${NOTES_WINDOW_ID} .fk-footer-meta {
      font-size: 10px;
      color: var(--nk-muted);
      letter-spacing: 0.01em;
    }

    /* Minimized */
    #${NOTES_WINDOW_ID}.is-minimized { height: auto !important; min-height: 0; }
    #${NOTES_WINDOW_ID}.is-minimized .fk-toolbar-wrap,
    #${NOTES_WINDOW_ID}.is-minimized .fk-editor-wrap,
    #${NOTES_WINDOW_ID}.is-minimized .fk-footer { display: none; }

    @media (max-width: 720px) {
      #${NOTES_WINDOW_ID} {
        top: 16px; right: 16px; left: 16px;
        width: auto !important;
        height: min(70vh, 520px);
      }
    }
  `;

  document.documentElement.appendChild(style);
}

// ── NOTEPAD LOGIC ────────────────────────────────────────────────────────────

function updateFooterMeta() {
  if (!noteApp) return;
  const text = noteApp.richEditor.innerText;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  noteApp.meta.textContent = `${words} words`;
}

async function persistEditorContent() {
  if (!noteApp) return;
  const html = noteApp.richEditor.innerHTML;
  const markdown = htmlToMarkdown(html);
  await saveCurrentNote({ html, markdown });
  updateFooterMeta();
}

function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    persistEditorContent().catch((error) => console.error("Failed to save note:", error));
  }, 250);
}

function insertChecklist() {
  document.execCommand("insertHTML", false, '<ul><li><label><input type="checkbox"> New task</label></li></ul>');
}

function formatSelection(command) {
  if (!noteApp) return;

  noteApp.richEditor.focus();

  if (command === "heading-large") {
    document.execCommand("formatBlock", false, "h1");
  } else if (command === "heading-medium") {
    document.execCommand("formatBlock", false, "h2");
  } else if (command === "quote") {
    document.execCommand("formatBlock", false, "blockquote");
  } else if (command === "code-block") {
    document.execCommand("formatBlock", false, "pre");
  } else if (command === "checklist") {
    insertChecklist();
  } else if (command === "link") {
    const url = window.prompt("Enter a URL");
    if (url) document.execCommand("createLink", false, url);
  } else if (command === "remove-format") {
    document.execCommand("removeFormat", false);
  } else {
    document.execCommand(command, false);
  }

  queueSave();
}

function downloadNotes() {
  if (!noteApp) return;
  const text = noteApp.richEditor.innerText;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "focus-keeper-notes.txt";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

async function copyText() {
  if (!noteApp) return;
  try {
    await navigator.clipboard.writeText(noteApp.richEditor.innerText);
    noteApp.meta.textContent = "Copied ✓";
    window.setTimeout(updateFooterMeta, 2000);
  } catch (error) {
    console.error("Clipboard copy failed:", error);
  }
}

function clampToViewport() {
  if (!noteApp) return;
  const rect = noteApp.root.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  noteApp.root.style.left = `${Math.min(Math.max(rect.left, 8), maxLeft)}px`;
  noteApp.root.style.top = `${Math.min(Math.max(rect.top, 8), maxTop)}px`;
  noteApp.root.style.right = "auto";
}

function attachDragBehavior(header, root) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    dragging = true;
    const rect = root.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.right = "auto";
    header.setPointerCapture(event.pointerId);
  });

  header.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    root.style.left = `${Math.min(Math.max(event.clientX - offsetX, 8), window.innerWidth - width - 8)}px`;
    root.style.top = `${Math.min(Math.max(event.clientY - offsetY, 8), window.innerHeight - height - 8)}px`;
  });

  const stopDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    if (event?.pointerId !== undefined) header.releasePointerCapture(event.pointerId);
  };

  header.addEventListener("pointerup", stopDrag);
  header.addEventListener("pointercancel", stopDrag);
}

function trapEditorKeyboardEvents(element) {
  const stopEvent = (event) => event.stopPropagation();
  element.addEventListener("keydown", stopEvent);
  element.addEventListener("keyup", stopEvent);
  element.addEventListener("keypress", stopEvent);
}

function buildNotesWindow() {
  if (noteApp?.root) return noteApp;

  injectNotesStyles();

  const root = document.createElement("section");
  root.id = NOTES_WINDOW_ID;
  root.setAttribute("aria-label", "Focus Keeper notes");

  root.innerHTML = `
    <div class="fk-notes-header">
      <div class="fk-notes-title">
        <strong>Video Notes</strong>
      </div>
      <div class="fk-notes-actions">
        <button class="fk-header-btn" type="button" data-action="minimize" title="Minimize">−</button>
        <button class="fk-header-btn" type="button" data-action="close" title="Close">✕</button>
      </div>
    </div>
    <div class="fk-toolbar-wrap">
      <div class="fk-toolbar">
        <button class="fk-tool-btn" type="button" data-command="bold" title="Bold">B</button>
        <button class="fk-tool-btn" type="button" data-command="italic" title="Italic">I</button>
        <button class="fk-tool-btn" type="button" data-command="underline" title="Underline">U</button>
        <div class="fk-toolbar-sep"></div>
        <button class="fk-tool-btn" type="button" data-command="heading-large" title="Heading 1">H1</button>
        <button class="fk-tool-btn" type="button" data-command="heading-medium" title="Heading 2">H2</button>
        <div class="fk-toolbar-sep"></div>
        <button class="fk-tool-btn" type="button" data-command="insertUnorderedList" title="Bullet list">• List</button>
        <button class="fk-tool-btn" type="button" data-command="insertOrderedList" title="Numbered list">1. List</button>
        <button class="fk-tool-btn" type="button" data-command="checklist" title="Checklist">☑ Task</button>
        <div class="fk-toolbar-sep"></div>
        <button class="fk-tool-btn" type="button" data-command="quote" title="Blockquote">" Quote</button>
        <button class="fk-tool-btn" type="button" data-command="code-block" title="Code block">&lt;/&gt; Code</button>
        <button class="fk-tool-btn" type="button" data-command="link" title="Add link">🔗 Link</button>
        <div class="fk-toolbar-sep"></div>
        <button class="fk-tool-btn" type="button" data-command="undo" title="Undo">↺</button>
        <button class="fk-tool-btn" type="button" data-command="redo" title="Redo">↻</button>
      </div>
    </div>
    <div class="fk-editor-wrap">
      <div class="fk-rich-editor" contenteditable="true" spellcheck="true"
           data-placeholder="Write key takeaways, timestamps, ideas…"></div>
    </div>
    <div class="fk-footer">
      <div class="fk-footer-actions">
        <button class="fk-footer-btn" type="button" data-action="copy-text">Copy Text</button>
        <button class="fk-footer-btn" type="button" data-action="download-notes">Download</button>
        <button class="fk-footer-btn fk-btn-danger" type="button" data-action="clear-note">Clear</button>
      </div>
      <div class="fk-footer-meta">0 words</div>
    </div>
  `;

  document.body.appendChild(root);

  const header = root.querySelector(".fk-notes-header");
  const richEditor = root.querySelector(".fk-rich-editor");
  const meta = root.querySelector(".fk-footer-meta");
  const minimizeButton = root.querySelector('[data-action="minimize"]');

  attachDragBehavior(header, root);

  root.querySelectorAll(".fk-tool-btn").forEach((button) => {
    button.addEventListener("click", () => formatSelection(button.dataset.command));
  });

  root.querySelector('[data-action="close"]').addEventListener("click", () => {
    root.classList.remove("is-open");
  });

  minimizeButton.addEventListener("click", () => {
    const minimized = root.classList.toggle("is-minimized");
    minimizeButton.textContent = minimized ? "+" : "−";
    minimizeButton.title = minimized ? "Restore" : "Minimize";
  });

  root.querySelector('[data-action="copy-text"]').addEventListener("click", copyText);
  root.querySelector('[data-action="download-notes"]').addEventListener("click", downloadNotes);
  root.querySelector('[data-action="clear-note"]').addEventListener("click", async () => {
    if (!window.confirm("Clear all notes for this video?")) return;
    richEditor.innerHTML = "";
    await persistEditorContent();
  });

  richEditor.addEventListener("input", queueSave);
  trapEditorKeyboardEvents(richEditor);

  root.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"]')) queueSave();
  });

  noteApp = { root, richEditor, meta };

  window.addEventListener("resize", clampToViewport);

  return noteApp;
}

async function loadNotesIntoEditor() {
  const app = buildNotesWindow();
  const note = await getCurrentNoteData();
  app.richEditor.innerHTML = note.html || markdownToHtml(note.markdown || "");
  updateFooterMeta();
}

async function toggleNotepad() {
  await loadNotesIntoEditor();
  noteApp.root.classList.toggle("is-open");

  if (noteApp.root.classList.contains("is-open")) {
    noteApp.richEditor.focus();
    clampToViewport();
  }
}

// ── CONTENT CONTROLS ─────────────────────────────────────────────────────────

function applyContentControls({ hideComments, hideSuggestions }) {
  const comments = document.querySelector("#comments");
  if (comments) comments.style.display = hideComments ? "none" : "";

  ["#secondary", "#related", ".ytp-ce-element", ".ytp-endscreen-content"].forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.style.display = hideSuggestions ? "none" : "";
    });
  });
}

async function hydrateContentControls() {
  const settings = await getStorage([
    FOCUS_KEEPER_STORAGE.hideComments,
    FOCUS_KEEPER_STORAGE.hideSuggestions,
  ]);

  applyContentControls({
    hideComments: settings[FOCUS_KEEPER_STORAGE.hideComments] ?? true,
    hideSuggestions: settings[FOCUS_KEEPER_STORAGE.hideSuggestions] ?? false,
  });
}

async function hydrateFilterState() {
  const settings = await getStorage([
    FOCUS_KEEPER_STORAGE.filterEnabled,
    FOCUS_KEEPER_STORAGE.theme,
  ]);
  filterEnabled = settings[FOCUS_KEEPER_STORAGE.filterEnabled] ?? false;
  const theme = settings[FOCUS_KEEPER_STORAGE.theme] ?? "dark";
  if (noteApp?.root) {
    noteApp.root.classList.toggle("fk-light", theme === "light");
  }
}

// ── VIDEO FILTERING ───────────────────────────────────────────────────────────

function getYouTubeVideoTitle() {
  const metaTitle = document.querySelector('meta[name="title"]');
  return metaTitle ? metaTitle.content : null;
}

const videoTitle = getYouTubeVideoTitle();
console.log("YouTube Video Title:", videoTitle);

chrome.runtime.sendMessage({ type: "VIDEO_TITLE", title: videoTitle });

function extractVideoInfo() {
  const videos = document.querySelectorAll("yt-lockup-view-model");
  return [...videos].map((video) => {
    const titleLink = video.querySelector("a.ytLockupMetadataViewModelTitle");
    const titleText = titleLink
      ? (titleLink.getAttribute("title") || titleLink.innerText.trim())
      : null;
    return { dom: video, title: titleText, link: titleLink ? titleLink.href : null };
  });
}

function filterExistingVideos() {
  const allVideoInfo = extractVideoInfo();
  allVideoInfo.forEach((element) => {
    if (!element.title) return;
    if (!videoInfo.includes(element.title)) videoInfo.push(element.title);
    if (filteredElements.has(element.dom)) return;

    chrome.runtime.sendMessage(
      { type: "NEW_VIDEO", video_title: videoTitle, title: element.title },
      (response) => {
        if (response?.result === false) {
          const el = element.dom;
          el.style.transition = "transform 0.4s ease, opacity 0.4s ease";
          el.style.transform = "translateX(100%)";
          el.style.opacity = "0";
          setTimeout(() => { el.style.display = "none"; }, 400);
          filteredElements.set(element.dom, true);
        }
      },
    );
  });
}

const observer = new MutationObserver(() => {
  const allVideoInfo = extractVideoInfo();

  allVideoInfo.forEach((element) => {
    if (element.title && !videoInfo.includes(element.title)) {
      videoInfo.push(element.title);

      if (filterEnabled) {
        chrome.runtime.sendMessage(
          { type: "NEW_VIDEO", video_title: videoTitle, title: element.title },
          (response) => {
            const keepVideo = response?.result;
            if (keepVideo === false) {
              const el = element.dom;
              el.style.transition = "transform 1s ease, opacity 1s ease";
              el.style.transform = "translateX(100%)";
              el.style.opacity = "0";
              setTimeout(() => { el.style.display = "none"; }, 400);
              filteredElements.set(element.dom, true);
            }
          },
        );
      }
    }
  });

  hydrateContentControls().catch((error) => console.error("Control sync failed:", error));
});

observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener("yt-navigate-finish", () => {
  videoInfo = [];
  hydrateContentControls().catch((error) => console.error("Control sync failed:", error));
  if (noteApp?.root?.classList.contains("is-open")) {
    loadNotesIntoEditor().catch((error) => console.error("Failed to reload notes:", error));
  }
});

// ── MESSAGE HANDLERS ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FOCUS_KEEPER_TOGGLE_NOTEPAD") {
    toggleNotepad()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("Notepad toggle failed:", error);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message.type === "FOCUS_KEEPER_UPDATE_CONTROLS") {
    applyContentControls({
      hideComments: Boolean(message.hideComments),
      hideSuggestions: Boolean(message.hideSuggestions),
    });
    sendResponse({ ok: true });
  }

  if (message.type === "FOCUS_KEEPER_SET_FILTER") {
    filterEnabled = Boolean(message.enabled);
    if (!filterEnabled) {
      filteredElements.forEach((_, dom) => {
        dom.style.transition = "";
        dom.style.transform = "";
        dom.style.opacity = "";
        dom.style.display = "";
      });
    } else {
      filteredElements.forEach((_, dom) => { dom.style.display = "none"; });
      filterExistingVideos();
    }
    sendResponse({ ok: true });
  }

  if (message.type === "FOCUS_KEEPER_SET_THEME") {
    if (noteApp?.root) {
      noteApp.root.classList.toggle("fk-light", message.theme === "light");
    }
    sendResponse({ ok: true });
  }

  return false;
});

// ── INIT ──────────────────────────────────────────────────────────────────────

hydrateContentControls().catch((error) => console.error("Initial control sync failed:", error));
hydrateFilterState().catch((error) => console.error("Initial filter sync failed:", error));
