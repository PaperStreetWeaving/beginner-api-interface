/*
 * Beginner API Interface — client logic
 *
 * Everything is stored in localStorage. There's no backend database.
 * The only network call is to /api/chat, which proxies to the Claude API.
 *
 * State shape (one big JSON blob under STORAGE_KEY):
 *   {
 *     activeProjectId: string | null,
 *     projects: [
 *       {
 *         id, name, model, systemPrompt, webSearch,
 *         messages: [{ id, role, text, fileIds?, toolEvents? }],
 *         files:    [{ id, name, kind, mediaType, data, size }],
 *         activeFileIds: string[]    // files attached to the next message
 *       }
 *     ]
 *   }
 */

const STORAGE_KEY = "beginner-api-interface:v1";

const MODELS = [
  { id: "claude-opus-4-7",           label: "Opus 4.7" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SYSTEM = "You are Claude, a helpful AI assistant.";

// ---------- State ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { activeProjectId: null, projects: [] };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state — localStorage might be full.", e);
    alert("Couldn't save. Your browser storage may be full (large files use a lot of space).");
  }
}

let state = loadState();

const uid = () =>
  (crypto?.randomUUID && crypto.randomUUID()) ||
  Math.random().toString(36).slice(2) + Date.now().toString(36);

function getActiveProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}

// ---------- Project ops ----------

function createProject(name = "New project") {
  const project = {
    id: uid(),
    name,
    model: DEFAULT_MODEL,
    systemPrompt: DEFAULT_SYSTEM,
    webSearch: false,
    messages: [],
    files: [],
    activeFileIds: [],
  };
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  saveState();
  render();
}

function deleteProject(id) {
  if (!confirm("Delete this project and its conversation? This can't be undone.")) return;
  state.projects = state.projects.filter(p => p.id !== id);
  if (state.activeProjectId === id) state.activeProjectId = state.projects[0]?.id ?? null;
  saveState();
  render();
}

function selectProject(id) {
  state.activeProjectId = id;
  saveState();
  render();
}

// ---------- File ops ----------

function fileKind(file) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/"))  return "image";
  return "text";
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const kind = fileKind(file);
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.onload = () => {
      let data = reader.result;
      if (kind !== "text") {
        // dataURL is "data:<mime>;base64,<...>"; strip the prefix.
        const comma = data.indexOf(",");
        data = comma >= 0 ? data.slice(comma + 1) : data;
      }
      resolve({
        id: uid(),
        name: file.name,
        kind,
        mediaType: file.type || "text/plain",
        data,
        size: file.size,
      });
    };
    if (kind === "text") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

async function attachFiles(fileList) {
  const project = getActiveProject();
  if (!project) return;
  for (const f of fileList) {
    try {
      const stored = await readFile(f);
      project.files.push(stored);
      project.activeFileIds.push(stored.id);
    } catch (e) {
      alert(`Couldn't read ${f.name}: ${e.message}`);
    }
  }
  saveState();
  render();
}

function toggleActiveFile(fileId) {
  const project = getActiveProject();
  if (!project) return;
  const i = project.activeFileIds.indexOf(fileId);
  if (i >= 0) project.activeFileIds.splice(i, 1);
  else project.activeFileIds.push(fileId);
  saveState();
  render();
}

function removeFile(fileId) {
  const project = getActiveProject();
  if (!project) return;
  project.files = project.files.filter(f => f.id !== fileId);
  project.activeFileIds = project.activeFileIds.filter(id => id !== fileId);
  saveState();
  render();
}

// ---------- Building API requests ----------

function buildApiMessages(project) {
  return project.messages.map(msg => {
    if (msg.role === "user") {
      const content = [];
      for (const fid of msg.fileIds || []) {
        const f = project.files.find(f => f.id === fid);
        if (!f) continue;
        if (f.kind === "pdf") {
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: f.data },
            title: f.name,
          });
        } else if (f.kind === "image") {
          content.push({
            type: "image",
            source: { type: "base64", media_type: f.mediaType, data: f.data },
          });
        } else {
          content.push({
            type: "text",
            text: `<file name="${f.name}">\n${f.data}\n</file>`,
          });
        }
      }
      content.push({ type: "text", text: msg.text });
      return { role: "user", content };
    }
    return { role: "assistant", content: msg.text };
  });
}

// ---------- Streaming ----------

async function streamChat(payload, onEvent) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch {}
    throw new Error(body.error || `Server returned ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data:")) continue;
      try { onEvent(JSON.parse(line.slice(5).trim())); } catch {}
    }
  }
}

// ---------- Sending a message ----------

let isSending = false;

async function sendMessage(text) {
  const project = getActiveProject();
  if (!project || !text.trim() || isSending) return;

  const userMsg = {
    id: uid(),
    role: "user",
    text: text.trim(),
    fileIds: [...project.activeFileIds],
  };
  project.messages.push(userMsg);
  project.activeFileIds = [];

  const assistantMsg = {
    id: uid(),
    role: "assistant",
    text: "",
    toolEvents: [],
  };
  project.messages.push(assistantMsg);

  isSending = true;
  saveState();
  render();

  try {
    await streamChat(
      {
        model: project.model,
        system: project.systemPrompt || DEFAULT_SYSTEM,
        messages: buildApiMessages(project).slice(0, -1), // drop the empty assistant turn
        useWebSearch: !!project.webSearch,
      },
      (event) => {
        if (event.type === "text") {
          assistantMsg.text += event.text;
          updateAssistantBubble(assistantMsg);
        } else if (event.type === "tool_use") {
          assistantMsg.toolEvents.push({ name: event.name, query: event.query });
          updateAssistantBubble(assistantMsg);
        } else if (event.type === "error") {
          assistantMsg.error = event.error;
          updateAssistantBubble(assistantMsg);
        }
      }
    );
  } catch (e) {
    assistantMsg.error = e.message;
    updateAssistantBubble(assistantMsg);
  } finally {
    isSending = false;
    saveState();
    updateSendButton();
  }
}

// ---------- Rendering ----------

const $ = (id) => document.getElementById(id);

function render() {
  renderSidebar();
  renderProject();
}

function renderSidebar() {
  const list = $("project-list");
  list.innerHTML = "";
  for (const p of state.projects) {
    const div = document.createElement("div");
    div.className = "project-item" + (p.id === state.activeProjectId ? " active" : "");
    div.dataset.id = p.id;
    div.innerHTML = `<span class="name"></span>`;
    div.querySelector(".name").textContent = p.name || "Untitled";
    div.addEventListener("click", () => selectProject(p.id));
    list.appendChild(div);
  }
}

function renderProject() {
  const project = getActiveProject();
  $("empty-state").hidden = !!project;
  $("project-view").hidden = !project;
  if (!project) return;

  $("project-name").value = project.name;

  const select = $("model-select");
  select.innerHTML = "";
  for (const m of MODELS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === project.model) opt.selected = true;
    select.appendChild(opt);
  }
  // If the saved model isn't in the list (e.g. user swapped it out), preserve it.
  if (!MODELS.find(m => m.id === project.model)) {
    const opt = document.createElement("option");
    opt.value = project.model;
    opt.textContent = project.model;
    opt.selected = true;
    select.appendChild(opt);
  }

  $("web-search-toggle").checked = !!project.webSearch;
  $("system-prompt").value = project.systemPrompt || "";

  renderMessages();
  renderFilesBar();
  renderFileLibrary();
  updateSendButton();
}

function renderMessages() {
  const project = getActiveProject();
  const conv = $("conversation");
  conv.innerHTML = "";
  for (const msg of project.messages) {
    conv.appendChild(buildMessageNode(msg, project));
  }
  conv.scrollTop = conv.scrollHeight;
}

function buildMessageNode(msg, project) {
  const wrap = document.createElement("div");
  wrap.className = `message ${msg.role}`;
  wrap.dataset.id = msg.id;

  const role = document.createElement("div");
  role.className = "role";
  role.textContent = msg.role === "user" ? "You" : "Claude";
  wrap.appendChild(role);

  const body = document.createElement("div");
  body.className = "body";
  wrap.appendChild(body);
  fillMessageBody(body, msg);

  if (msg.role === "user" && msg.fileIds?.length) {
    const files = document.createElement("div");
    files.className = "files";
    for (const fid of msg.fileIds) {
      const f = project.files.find(f => f.id === fid);
      if (!f) continue;
      const chip = document.createElement("span");
      chip.className = "file-chip";
      chip.textContent = f.name;
      files.appendChild(chip);
    }
    wrap.appendChild(files);
  }

  return wrap;
}

function fillMessageBody(body, msg) {
  body.innerHTML = "";
  if (msg.toolEvents?.length) {
    for (const ev of msg.toolEvents) {
      const note = document.createElement("div");
      note.className = "tool-event";
      note.textContent = ev.name === "web_search" && ev.query
        ? `🌐 Searching the web for "${ev.query}"…`
        : `🔧 Used tool: ${ev.name}`;
      body.appendChild(note);
    }
  }
  if (msg.text) {
    const text = document.createElement("div");
    text.textContent = msg.text;
    body.appendChild(text);
  } else if (msg.role === "assistant" && !msg.error) {
    const cursor = document.createElement("div");
    cursor.className = "tool-event";
    cursor.textContent = "…";
    body.appendChild(cursor);
  }
  if (msg.error) {
    const err = document.createElement("div");
    err.className = "error";
    err.textContent = msg.error;
    body.appendChild(err);
  }
}

function updateAssistantBubble(msg) {
  const node = document.querySelector(`[data-id="${msg.id}"] .body`);
  if (!node) return renderMessages();
  fillMessageBody(node, msg);
  const conv = $("conversation");
  conv.scrollTop = conv.scrollHeight;
}

function renderFilesBar() {
  const project = getActiveProject();
  const bar = $("files-bar");
  const ul = $("active-files");
  ul.innerHTML = "";
  bar.hidden = project.activeFileIds.length === 0;
  for (const fid of project.activeFileIds) {
    const f = project.files.find(f => f.id === fid);
    if (!f) continue;
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = f.name;
    const x = document.createElement("button");
    x.textContent = "×";
    x.title = "Remove from message";
    x.addEventListener("click", () => toggleActiveFile(fid));
    li.appendChild(name);
    li.appendChild(x);
    ul.appendChild(li);
  }
}

function renderFileLibrary() {
  const project = getActiveProject();
  const ul = $("file-library");
  ul.innerHTML = "";
  if (project.files.length === 0) {
    const li = document.createElement("li");
    li.className = "muted small";
    li.textContent = "No files yet. Click the 📎 in the composer to upload.";
    ul.appendChild(li);
    return;
  }
  for (const f of project.files) {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = project.activeFileIds.includes(f.id);
    cb.addEventListener("change", () => toggleActiveFile(f.id));
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = f.name;
    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.textContent = `${f.kind} · ${formatSize(f.size)}`;
    const rm = document.createElement("button");
    rm.className = "ghost";
    rm.textContent = "Remove";
    rm.addEventListener("click", () => removeFile(f.id));
    li.appendChild(cb);
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(rm);
    ul.appendChild(li);
  }
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function updateSendButton() {
  $("send-btn").disabled = isSending;
  $("send-btn").textContent = isSending ? "…" : "Send";
}

function autosizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 240) + "px";
}

// ---------- Wire it up ----------

function init() {
  $("new-project-btn").addEventListener("click", () => createProject());

  $("project-name").addEventListener("change", (e) => {
    const project = getActiveProject();
    if (!project) return;
    project.name = e.target.value.trim() || "Untitled";
    saveState();
    renderSidebar();
  });

  $("model-select").addEventListener("change", (e) => {
    const project = getActiveProject();
    if (!project) return;
    project.model = e.target.value;
    saveState();
  });

  $("web-search-toggle").addEventListener("change", (e) => {
    const project = getActiveProject();
    if (!project) return;
    project.webSearch = e.target.checked;
    saveState();
  });

  $("system-prompt").addEventListener("change", (e) => {
    const project = getActiveProject();
    if (!project) return;
    project.systemPrompt = e.target.value;
    saveState();
  });

  $("settings-btn").addEventListener("click", () => $("settings-dialog").showModal());

  $("delete-project-btn").addEventListener("click", () => {
    if (state.activeProjectId) deleteProject(state.activeProjectId);
  });

  $("attach-btn").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", async (e) => {
    if (e.target.files.length) await attachFiles(Array.from(e.target.files));
    e.target.value = "";
  });

  const prompt = $("prompt");
  prompt.addEventListener("input", () => autosizeTextarea(prompt));
  prompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("composer").requestSubmit();
    }
  });

  $("composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = prompt.value;
    if (!text.trim() || isSending) return;
    prompt.value = "";
    autosizeTextarea(prompt);
    await sendMessage(text);
  });

  if (!state.projects.length) createProject("My first project");
  else render();
}

document.addEventListener("DOMContentLoaded", init);
