console.log("Focus Keeper content script loaded");

const FOCUS_KEEPER_STORAGE = {
  hideComments: "focusKeeper.hideComments",
  hideSuggestions: "focusKeeper.hideSuggestions",
};

const NOTES_WINDOW_ID = "focus-keeper-notes-root";
const NOTES_STYLE_ID = "focus-keeper-notes-style";

let noteApp = null;
let videoInfo = [];
let saveTimer = null;

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
    if (!inCodeBlock) {
      return;
    }

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

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      html.push("<p><br></p>");
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    const checkboxMatch = line.match(/^[-*]\s+\[( |x)\]\s+(.*)$/i);
    if (checkboxMatch) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      const checked = checkboxMatch[1].toLowerCase() === "x" ? ' checked="checked"' : "";
      html.push(
        `<li><label><input type="checkbox"${checked}> ${inlineMarkdownToHtml(
          checkboxMatch[2],
        )}</label></li>`,
      );
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdownToHtml(bulletMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
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
  return Array.from(node.childNodes)
    .map((child) => nodeToMarkdown(child))
    .join("");
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  const content = nodeChildrenToMarkdown(node);

  if (tag === "strong" || tag === "b") {
    return `**${content}**`;
  }

  if (tag === "em" || tag === "i") {
    return `*${content}*`;
  }

  if (tag === "u") {
    return `<u>${content}</u>`;
  }

  if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") {
    return `\`${content}\``;
  }

  if (tag === "a") {
    const href = node.getAttribute("href") || "#";
    return `[${content}](${href})`;
  }

  if (tag === "br") {
    return "\n";
  }

  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
    const level = Number(tag.slice(1));
    return `${"#".repeat(level)} ${content.trim()}\n\n`;
  }

  if (tag === "blockquote") {
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join("\n")
      .concat("\n\n");
  }

  if (tag === "pre") {
    return `\`\`\`\n${node.textContent.replace(/\n$/, "")}\n\`\`\`\n\n`;
  }

  if (tag === "ul") {
    return Array.from(node.children)
      .map((li) => {
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox) {
          const text = li.textContent.replace(/\s+/g, " ").trim();
          return `- [${checkbox.checked ? "x" : " "}] ${text}`;
        }
        return `- ${nodeChildrenToMarkdown(li).trim()}`;
      })
      .join("\n")
      .concat("\n\n");
  }

  if (tag === "ol") {
    return Array.from(node.children)
      .map((li, index) => `${index + 1}. ${nodeChildrenToMarkdown(li).trim()}`)
      .join("\n")
      .concat("\n\n");
  }

  if (tag === "p" || tag === "div") {
    const trimmed = content.trim();
    return trimmed ? `${trimmed}\n\n` : "\n";
  }

  if (tag === "li") {
    return content;
  }

  if (tag === "label" || tag === "span") {
    return content;
  }

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

function injectNotesStyles() {
  if (document.getElementById(NOTES_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = NOTES_STYLE_ID;
  style.textContent = `
    #${NOTES_WINDOW_ID} {
      position: fixed;
      top: 110px;
      right: 28px;
      width: 440px;
      min-width: 320px;
      max-width: min(92vw, 560px);
      height: 560px;
      max-height: calc(100vh - 40px);
      background: rgba(9, 9, 11, 0.96);
      color: #fafafa;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      box-shadow:
        0 24px 60px rgba(0, 0, 0, 0.45),
        0 1px 0 rgba(255, 255, 255, 0.03) inset;
      z-index: 2147483647;
      display: none;
      overflow: hidden;
      backdrop-filter: blur(18px);
      font-family: Inter, "Segoe UI", Arial, sans-serif;
    }

    #${NOTES_WINDOW_ID}.is-open {
      display: flex;
      flex-direction: column;
    }

    #${NOTES_WINDOW_ID} * {
      box-sizing: border-box;
    }

    #${NOTES_WINDOW_ID} .fk-notes-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.01));
      cursor: move;
      user-select: none;
    }

    #${NOTES_WINDOW_ID} .fk-notes-title {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    #${NOTES_WINDOW_ID} .fk-notes-title strong {
      font-size: 14px;
      line-height: 1.2;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    #${NOTES_WINDOW_ID} .fk-notes-title span {
      font-size: 11px;
      color: rgba(250, 250, 250, 0.52);
    }

    #${NOTES_WINDOW_ID} .fk-notes-actions,
    #${NOTES_WINDOW_ID} .fk-toolbar,
    #${NOTES_WINDOW_ID} .fk-view-switch,
    #${NOTES_WINDOW_ID} .fk-footer,
    #${NOTES_WINDOW_ID} .fk-footer-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    #${NOTES_WINDOW_ID} .fk-header-btn,
    #${NOTES_WINDOW_ID} .fk-tool-btn,
    #${NOTES_WINDOW_ID} .fk-view-btn,
    #${NOTES_WINDOW_ID} .fk-footer-btn {
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(24, 24, 27, 0.92);
      color: rgba(250, 250, 250, 0.92);
      border-radius: 10px;
      min-width: 34px;
      height: 34px;
      padding: 0 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    #${NOTES_WINDOW_ID} .fk-tool-btn[data-command="heading-large"],
    #${NOTES_WINDOW_ID} .fk-tool-btn[data-command="heading-medium"] {
      font-weight: 700;
    }

    #${NOTES_WINDOW_ID} .fk-header-btn:hover,
    #${NOTES_WINDOW_ID} .fk-tool-btn:hover,
    #${NOTES_WINDOW_ID} .fk-view-btn:hover,
    #${NOTES_WINDOW_ID} .fk-footer-btn:hover {
      background: rgba(39, 39, 42, 0.98);
      border-color: rgba(255, 255, 255, 0.12);
    }

    #${NOTES_WINDOW_ID} .fk-view-btn.is-active {
      background: #fafafa;
      border-color: #fafafa;
      color: #0a0a0b;
    }

    #${NOTES_WINDOW_ID} .fk-toolbar-wrap {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(10, 10, 12, 0.9);
    }

    #${NOTES_WINDOW_ID} .fk-toolbar {
      flex-wrap: wrap;
      gap: 4px;
      padding: 6px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    #${NOTES_WINDOW_ID} .fk-view-switch {
      gap: 4px;
      padding: 6px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    #${NOTES_WINDOW_ID} .fk-header-btn {
      width: 30px;
      min-width: 30px;
      height: 30px;
      padding: 0;
      border-radius: 9px;
      font-size: 14px;
    }

    #${NOTES_WINDOW_ID} .fk-tool-btn {
      min-width: 34px;
      height: 30px;
      padding: 0 10px;
      border-radius: 8px;
      background: transparent;
      border-color: transparent;
      color: rgba(250, 250, 250, 0.78);
      font-size: 12px;
    }

    #${NOTES_WINDOW_ID} .fk-footer-btn {
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
    }

    #${NOTES_WINDOW_ID} .fk-view-btn {
      height: 30px;
      min-width: 0;
      padding: 0 14px;
      border-radius: 8px;
      background: transparent;
      border-color: transparent;
      color: rgba(250, 250, 250, 0.72);
      font-size: 12px;
      font-weight: 500;
    }

    #${NOTES_WINDOW_ID} .fk-tool-btn:hover,
    #${NOTES_WINDOW_ID} .fk-tool-btn:focus-visible,
    #${NOTES_WINDOW_ID} .fk-view-btn:hover,
    #${NOTES_WINDOW_ID} .fk-view-btn:focus-visible {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.06);
      color: rgba(250, 250, 250, 0.96);
      outline: none;
    }

    #${NOTES_WINDOW_ID} .fk-editor-wrap {
      flex: 1;
      min-height: 0;
      padding: 16px;
      overflow: hidden;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.015), rgba(255, 255, 255, 0));
    }

    #${NOTES_WINDOW_ID} .fk-rich-editor,
    #${NOTES_WINDOW_ID} .fk-markdown-editor {
      width: 100%;
      height: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.015)),
        rgba(9, 9, 11, 0.96);
      color: #fafafa;
      padding: 18px 18px 24px;
      overflow: auto;
      outline: none;
      line-height: 1.7;
      font-size: 14px;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset;
    }

    #${NOTES_WINDOW_ID} .fk-rich-editor:focus,
    #${NOTES_WINDOW_ID} .fk-markdown-editor:focus {
      border-color: rgba(255, 255, 255, 0.14);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.06),
        0 1px 0 rgba(255, 255, 255, 0.02) inset;
    }

    #${NOTES_WINDOW_ID} .fk-rich-editor[contenteditable="true"]:empty::before {
      content: attr(data-placeholder);
      color: rgba(250, 250, 250, 0.34);
    }

    #${NOTES_WINDOW_ID} .fk-markdown-editor {
      resize: none;
      font-family: "JetBrains Mono", "Consolas", "Courier New", monospace;
      display: none;
    }

    #${NOTES_WINDOW_ID}.markdown-mode .fk-rich-editor {
      display: none;
    }

    #${NOTES_WINDOW_ID}.markdown-mode .fk-markdown-editor {
      display: block;
    }

    #${NOTES_WINDOW_ID} h1,
    #${NOTES_WINDOW_ID} h2,
    #${NOTES_WINDOW_ID} h3 {
      margin: 0.9em 0 0.45em;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }

    #${NOTES_WINDOW_ID} h1 {
      font-size: 1.6rem;
      font-weight: 700;
    }

    #${NOTES_WINDOW_ID} h2 {
      font-size: 1.2rem;
      font-weight: 650;
    }

    #${NOTES_WINDOW_ID} h3 {
      font-size: 1rem;
      font-weight: 650;
    }

    #${NOTES_WINDOW_ID} p,
    #${NOTES_WINDOW_ID} ul,
    #${NOTES_WINDOW_ID} ol,
    #${NOTES_WINDOW_ID} blockquote,
    #${NOTES_WINDOW_ID} pre {
      margin: 0 0 0.9em;
    }

    #${NOTES_WINDOW_ID} blockquote {
      border-left: 2px solid rgba(255, 255, 255, 0.16);
      padding: 2px 0 2px 14px;
      color: rgba(250, 250, 250, 0.76);
    }

    #${NOTES_WINDOW_ID} pre,
    #${NOTES_WINDOW_ID} code {
      font-family: "JetBrains Mono", "Consolas", "Courier New", monospace;
    }

    #${NOTES_WINDOW_ID} code {
      padding: 1px 5px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      font-size: 0.92em;
    }

    #${NOTES_WINDOW_ID} pre {
      padding: 14px 16px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      overflow: auto;
    }

    #${NOTES_WINDOW_ID} ul,
    #${NOTES_WINDOW_ID} ol {
      padding-left: 1.3rem;
    }

    #${NOTES_WINDOW_ID} li + li {
      margin-top: 0.35rem;
    }

    #${NOTES_WINDOW_ID} .fk-footer {
      justify-content: space-between;
      padding: 12px 16px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(10, 10, 12, 0.92);
    }

    #${NOTES_WINDOW_ID}.is-minimized {
      height: auto;
    }

    #${NOTES_WINDOW_ID}.is-minimized .fk-toolbar-wrap,
    #${NOTES_WINDOW_ID}.is-minimized .fk-editor-wrap,
    #${NOTES_WINDOW_ID}.is-minimized .fk-footer {
      display: none;
    }

    #${NOTES_WINDOW_ID} .fk-footer-meta {
      font-size: 11px;
      color: rgba(250, 250, 250, 0.5);
    }

    #${NOTES_WINDOW_ID} a {
      color: #e4e4e7;
      text-underline-offset: 2px;
    }

    @media (max-width: 720px) {
      #${NOTES_WINDOW_ID} {
        top: 16px;
        right: 16px;
        left: 16px;
        width: auto;
        height: min(70vh, 560px);
        max-width: none;
      }
    }
  `;

  document.documentElement.appendChild(style);
}

function updateFooterMeta() {
  if (!noteApp) {
    return;
  }

  const source = noteApp.root.classList.contains("markdown-mode")
    ? noteApp.markdownEditor.value
    : noteApp.richEditor.innerText;

  const words = source.trim() ? source.trim().split(/\s+/).length : 0;
  noteApp.meta.textContent = `${words} words • auto-saved for this video`;
}

async function persistEditorContent() {
  if (!noteApp) {
    return;
  }

  const markdown = noteApp.root.classList.contains("markdown-mode")
    ? noteApp.markdownEditor.value
    : htmlToMarkdown(noteApp.richEditor.innerHTML);

  const html = noteApp.root.classList.contains("markdown-mode")
    ? markdownToHtml(markdown)
    : noteApp.richEditor.innerHTML;

  await saveCurrentNote({ html, markdown });
  updateFooterMeta();
}

function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    persistEditorContent().catch((error) => console.error("Failed to save note:", error));
  }, 250);
}

function switchEditorMode(mode) {
  if (!noteApp) {
    return;
  }

  const isMarkdown = mode === "markdown";
  noteApp.root.classList.toggle("markdown-mode", isMarkdown);
  noteApp.richTab.classList.toggle("is-active", !isMarkdown);
  noteApp.markdownTab.classList.toggle("is-active", isMarkdown);

  if (isMarkdown) {
    noteApp.markdownEditor.value = htmlToMarkdown(noteApp.richEditor.innerHTML);
    noteApp.markdownEditor.focus();
  } else {
    noteApp.richEditor.innerHTML = markdownToHtml(noteApp.markdownEditor.value);
    noteApp.richEditor.focus();
  }

  queueSave();
}

function insertChecklist() {
  document.execCommand("insertHTML", false, '<ul><li><label><input type="checkbox"> New task</label></li></ul>');
}

function formatSelection(command) {
  if (!noteApp || noteApp.root.classList.contains("markdown-mode")) {
    return;
  }

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
    if (url) {
      document.execCommand("createLink", false, url);
    }
  } else if (command === "remove-format") {
    document.execCommand("removeFormat", false);
  } else {
    document.execCommand(command, false);
  }

  queueSave();
}

function downloadMarkdown() {
  if (!noteApp) {
    return;
  }

  const markdown = noteApp.root.classList.contains("markdown-mode")
    ? noteApp.markdownEditor.value
    : htmlToMarkdown(noteApp.richEditor.innerHTML);

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "focus-keeper-notes.md";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

async function copyMarkdown() {
  if (!noteApp) {
    return;
  }

  const markdown = noteApp.root.classList.contains("markdown-mode")
    ? noteApp.markdownEditor.value
    : htmlToMarkdown(noteApp.richEditor.innerHTML);

  try {
    await navigator.clipboard.writeText(markdown);
    noteApp.meta.textContent = "Markdown copied to clipboard";
  } catch (error) {
    console.error("Clipboard copy failed:", error);
  }
}

function clampToViewport() {
  if (!noteApp) {
    return;
  }

  const rect = noteApp.root.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  const nextLeft = Math.min(Math.max(rect.left, 8), maxLeft);
  const nextTop = Math.min(Math.max(rect.top, 8), maxTop);
  noteApp.root.style.left = `${nextLeft}px`;
  noteApp.root.style.top = `${nextTop}px`;
  noteApp.root.style.right = "auto";
}

function attachDragBehavior(header, root) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) {
      return;
    }

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
    if (!dragging) {
      return;
    }

    const width = root.offsetWidth;
    const height = root.offsetHeight;
    const nextLeft = Math.min(Math.max(event.clientX - offsetX, 8), window.innerWidth - width - 8);
    const nextTop = Math.min(Math.max(event.clientY - offsetY, 8), window.innerHeight - height - 8);

    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
  });

  const stopDrag = (event) => {
    if (!dragging) {
      return;
    }

    dragging = false;
    if (event?.pointerId !== undefined) {
      header.releasePointerCapture(event.pointerId);
    }
  };

  header.addEventListener("pointerup", stopDrag);
  header.addEventListener("pointercancel", stopDrag);
}

function trapEditorKeyboardEvents(element) {
  const stopEvent = (event) => {
    event.stopPropagation();
  };

  element.addEventListener("keydown", stopEvent);
  element.addEventListener("keyup", stopEvent);
  element.addEventListener("keypress", stopEvent);
}

function buildNotesWindow() {
  if (noteApp?.root) {
    return noteApp;
  }

  injectNotesStyles();

  const root = document.createElement("section");
  root.id = NOTES_WINDOW_ID;
  root.setAttribute("aria-label", "Focus Keeper notes");

  root.innerHTML = `
    <div class="fk-notes-header">
      <div class="fk-notes-title">
        <strong>Video Notes</strong>
        <span>Draggable note space that stays beside your video</span>
      </div>
      <div class="fk-notes-actions">
        <button class="fk-header-btn" type="button" data-action="minimize" title="Minimize">-</button>
        <button class="fk-header-btn" type="button" data-action="close" title="Close">X</button>
      </div>
    </div>
    <div class="fk-toolbar-wrap">
      <div class="fk-toolbar">
        <button class="fk-tool-btn" type="button" data-command="bold" title="Bold"><strong>B</strong></button>
        <button class="fk-tool-btn" type="button" data-command="italic" title="Italic"><em>I</em></button>
        <button class="fk-tool-btn" type="button" data-command="underline" title="Underline"><u>U</u></button>
        <button class="fk-tool-btn" type="button" data-command="heading-large" title="Heading 1">H1</button>
        <button class="fk-tool-btn" type="button" data-command="heading-medium" title="Heading 2">H2</button>
        <button class="fk-tool-btn" type="button" data-command="insertUnorderedList" title="Bullet list">List</button>
        <button class="fk-tool-btn" type="button" data-command="insertOrderedList" title="Numbered list">1.</button>
        <button class="fk-tool-btn" type="button" data-command="checklist" title="Checklist">Task</button>
        <button class="fk-tool-btn" type="button" data-command="quote" title="Quote">Quote</button>
        <button class="fk-tool-btn" type="button" data-command="code-block" title="Code block">Code</button>
        <button class="fk-tool-btn" type="button" data-command="link" title="Add link">Link</button>
        <button class="fk-tool-btn" type="button" data-command="undo" title="Undo">↺</button>
        <button class="fk-tool-btn" type="button" data-command="redo" title="Redo">↻</button>
      </div>
      <div class="fk-view-switch">
        <button class="fk-view-btn is-active" type="button" data-mode="rich">Rich Text</button>
        <button class="fk-view-btn" type="button" data-mode="markdown">Markdown</button>
      </div>
    </div>
    <div class="fk-editor-wrap">
      <div class="fk-rich-editor" contenteditable="true" spellcheck="true" data-placeholder="Write key takeaways, timestamps, ideas, and action items here..."></div>
      <textarea class="fk-markdown-editor" spellcheck="true" placeholder="Write or paste Markdown here..."></textarea>
    </div>
    <div class="fk-footer">
      <div class="fk-footer-actions">
        <button class="fk-footer-btn" type="button" data-action="copy-markdown">Copy Markdown</button>
        <button class="fk-footer-btn" type="button" data-action="download-markdown">Download .md</button>
        <button class="fk-footer-btn" type="button" data-action="clear-note">Clear</button>
      </div>
      <div class="fk-footer-meta">0 words • auto-saved for this video</div>
    </div>
  `;

  document.body.appendChild(root);

  const header = root.querySelector(".fk-notes-header");
  const richEditor = root.querySelector(".fk-rich-editor");
  const markdownEditor = root.querySelector(".fk-markdown-editor");
  const richTab = root.querySelector('[data-mode="rich"]');
  const markdownTab = root.querySelector('[data-mode="markdown"]');
  const meta = root.querySelector(".fk-footer-meta");
  const minimizeButton = root.querySelector('[data-action="minimize"]');

  attachDragBehavior(header, root);

  root.querySelectorAll(".fk-tool-btn").forEach((button) => {
    button.addEventListener("click", () => formatSelection(button.dataset.command));
  });

  root.querySelectorAll(".fk-view-btn").forEach((button) => {
    button.addEventListener("click", () => switchEditorMode(button.dataset.mode));
  });

  root.querySelector('[data-action="close"]').addEventListener("click", () => {
    root.classList.remove("is-open");
  });

  minimizeButton.addEventListener("click", () => {
    const minimized = root.classList.toggle("is-minimized");
    minimizeButton.textContent = minimized ? "+" : "-";
    minimizeButton.title = minimized ? "Restore" : "Minimize";
  });

  root.querySelector('[data-action="copy-markdown"]').addEventListener("click", copyMarkdown);
  root.querySelector('[data-action="download-markdown"]').addEventListener("click", downloadMarkdown);
  root.querySelector('[data-action="clear-note"]').addEventListener("click", async () => {
    const confirmed = window.confirm("Clear all notes for this video?");
    if (!confirmed) {
      return;
    }

    richEditor.innerHTML = "";
    markdownEditor.value = "";
    await persistEditorContent();
  });

  richEditor.addEventListener("input", queueSave);
  markdownEditor.addEventListener("input", queueSave);
  trapEditorKeyboardEvents(richEditor);
  trapEditorKeyboardEvents(markdownEditor);

  root.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"]')) {
      queueSave();
    }
  });

  noteApp = {
    root,
    richEditor,
    markdownEditor,
    richTab,
    markdownTab,
    meta,
  };

  window.addEventListener("resize", clampToViewport);

  return noteApp;
}

async function loadNotesIntoEditor() {
  const app = buildNotesWindow();
  const note = await getCurrentNoteData();
  app.richEditor.innerHTML = note.html || markdownToHtml(note.markdown || "");
  app.markdownEditor.value = note.markdown || htmlToMarkdown(app.richEditor.innerHTML);
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

function applyContentControls({ hideComments, hideSuggestions }) {
  const comments = document.querySelector("#comments");
  if (comments) {
    comments.style.display = hideComments ? "none" : "";
  }

  const selectors = [
    "#secondary",
    "#related",
    ".ytp-ce-element",
    ".ytp-endscreen-content",
  ];

  selectors.forEach((selector) => {
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
    const titleEl = video.querySelector("a.yt-lockup-metadata-view-model__title");

    return {
      dom: video,
      title: titleEl ? titleEl.textContent.trim() : null,
      link: titleEl ? titleEl.href : null,
    };
  });
}

const observer = new MutationObserver(() => {
  const allVideoInfo = extractVideoInfo();

  allVideoInfo.forEach((element, index) => {
    if (element.title && !videoInfo.includes(element.title)) {
      videoInfo.push(element.title);
      console.log(index, "New video found:", element.title);
      chrome.runtime.sendMessage(
        {
          type: "NEW_VIDEO",
          title: element.title,
        },
        (response) => {
          const keepVideo = response?.result;
          if (keepVideo === false) {
            element.dom.style.display = "none";
          }
        },
      );
    }
  });

  hydrateContentControls().catch((error) => console.error("Control sync failed:", error));
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

document.addEventListener("yt-navigate-finish", () => {
  videoInfo = [];
  hydrateContentControls().catch((error) => console.error("Control sync failed:", error));
  if (noteApp?.root?.classList.contains("is-open")) {
    loadNotesIntoEditor().catch((error) => console.error("Failed to reload notes:", error));
  }
});

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

  return false;
});

hydrateContentControls().catch((error) => console.error("Initial control sync failed:", error));
