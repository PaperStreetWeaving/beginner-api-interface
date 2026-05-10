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
 *         id, name, model, systemPrompt, webSearch, thinking,
 *         files: [{ id, name, kind, mediaType, data, size }],
 *         conversations: [
 *           {
 *             id, name, createdAt,
 *             messages: [{ id, role, text, fileIds?, thinkingText?, toolEvents?, usage?, error? }],
 *             activeFileIds: string[]
 *           }
 *         ],
 *         activeConversationId
 *       }
 *     ]
 *   }
 */

const STORAGE_KEY = "beginner-api-interface:v2";
const LEGACY_STORAGE_KEYS = ["beginner-api-interface:v1"];

/*
 * Pricing is best-effort. Anthropic updates rates from time to time — always
 * check the live numbers in your console (console.anthropic.com) and the docs
 * (docs.anthropic.com). Set both to 0 to display tokens without a $ estimate.
 */
const MODELS = [
  { id: "claude-opus-4-6",            label: "Opus 4.6",       pricePerMillion: { input: 15, output: 75 }, supportsThinking: true },
  { id: "claude-opus-4-5-20251101",   label: "Opus 4.5",       pricePerMillion: { input: 15, output: 75 }, supportsThinking: true },
  { id: "claude-opus-4-1-20250805",   label: "Opus 4.1",       pricePerMillion: { input: 15, output: 75 }, supportsThinking: true },
  { id: "claude-opus-4-20250514",     label: "Opus 4",         pricePerMillion: { input: 15, output: 75 }, supportsThinking: true },
  { id: "claude-sonnet-4-6",          label: "Sonnet 4.6",     pricePerMillion: { input: 3,  output: 15 }, supportsThinking: true },
  { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5",     pricePerMillion: { input: 3,  output: 15 }, supportsThinking: true },
  { id: "claude-sonnet-4-20250514",   label: "Sonnet 4",       pricePerMillion: { input: 3,  output: 15 }, supportsThinking: true },
  { id: "claude-haiku-4-5-20251001",  label: "Haiku 4.5",      pricePerMillion: { input: 1,  output: 5  }, supportsThinking: true },
];

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SYSTEM = "You are Claude, a helpful AI assistant.";
const THINKING_BUDGET = 4096;

// ---------- State ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateState(JSON.parse(raw));
  } catch {}
  for (const legacy of LEGACY_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(legacy);
      if (raw) return migrateState(JSON.parse(raw));
    } catch {}
  }
  return { activeProjectId: null, projects: [] };
}

function migrateState(state) {
  if (!Array.isArray(state.projects)) state.projects = [];
  for (const p of state.projects) {
    if (!Array.isArray(p.conversations)) {
      const convId = uid();
      p.conversations = [{
        id: convId,
        name: "Conversation 1",
        createdAt: Date.now(),
        messages: Array.isArray(p.messages) ? p.messages : [],
        activeFileIds: Array.isArray(p.activeFileIds) ? p.activeFileIds : [],
      }];
      p.activeConversationId = convId;
      delete p.messages;
      delete p.activeFileIds;
    }
    if (!p.activeConversationId && p.conversations[0]) {
      p.activeConversationId = p.conversations[0].id;
    }
    if (typeof p.thinking !== "boolean") p.thinking = false;
  }
  return state;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state — localStorage might be full.", e);
    alert("Couldn't save. Browser storage may be full (large files use a lot of space).");
  }
}

let state = loadState();

const uid = () =>
  (crypto?.randomUUID && crypto.randomUUID()) ||
  Math.random().toString(36).slice(2) + Date.now().toString(36);

function getActiveProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}

function getActiveConversation(project = getActiveProject()) {
  if (!project) return null;
  return project.conversations.find(c => c.id === project.activeConversationId) || project.conversations[0] || null;
}

function modelInfo(id) {
  return MODELS.find(m => m.id === id) || { id, label: id, pricePerMillion: { input: 0, output: 0 }, supportsThinking: false };
}

// ---------- Project / conversation ops ----------

function createProject(name = "New project") {
  const convId = uid();
  const project = {
    id: uid(),
    name,
    model: DEFAULT_MODEL,
    systemPrompt: DEFAULT_SYSTEM,
    webSearch: false,
    thinking: false,
    files: [],
    conversations: [{
      id: convId,
      name: "Conversation 1",
      createdAt: Date.now(),
      messages: [],
      activeFileIds: [],
    }],
    activeConversationId: convId,
  };
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  saveState();
  render();
  focusAndSelect("project-name");
}

function renameProject(id) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;
  const next = prompt("Rename project:", project.name);
  if (next === null) return;
  project.name = next.trim() || project.name;
  saveState();
  render();
}

function deleteProject(id) {
  if (!confirm("Delete this project and all its conversations? This can't be undone.")) return;
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

function createConversation(name) {
  const project = getActiveProject();
  if (!project) return;
  const conv = {
    id: uid(),
    name: name || `Conversation ${project.conversations.length + 1}`,
    createdAt: Date.now(),
    messages: [],
    activeFileIds: [],
  };
  project.conversations.unshift(conv);
  project.activeConversationId = conv.id;
  saveState();
  render();
  focusAndSelect("conv-name");
}

function renameConversation(convId) {
  const project = getActiveProject();
  if (!project) return;
  const conv = project.conversations.find(c => c.id === convId);
  if (!conv) return;
  const next = prompt("Rename conversation:", conv.name);
  if (next === null) return;
  conv.name = next.trim() || conv.name;
  saveState();
  render();
}

function selectConversation(convId) {
  const project = getActiveProject();
  if (!project) return;
  project.activeConversationId = convId;
  saveState();
  render();
}

function deleteConversation(convId) {
  const project = getActiveProject();
  if (!project) return;
  if (!confirm("Delete this conversation? This can't be undone.")) return;
  project.conversations = project.conversations.filter(c => c.id !== convId);
  if (project.conversations.length === 0) {
    createConversation();
    return;
  }
  if (project.activeConversationId === convId) {
    project.activeConversationId = project.conversations[0].id;
  }
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
  const conv = getActiveConversation(project);
  if (!project || !conv) return;
  for (const f of fileList) {
    try {
      const stored = await readFile(f);
      project.files.push(stored);
      conv.activeFileIds.push(stored.id);
    } catch (e) {
      alert(`Couldn't read ${f.name}: ${e.message}`);
    }
  }
  saveState();
  render();
}

function toggleActiveFile(fileId) {
  const conv = getActiveConversation();
  if (!conv) return;
  const i = conv.activeFileIds.indexOf(fileId);
  if (i >= 0) conv.activeFileIds.splice(i, 1);
  else conv.activeFileIds.push(fileId);
  saveState();
  render();
}

function removeFile(fileId) {
  const project = getActiveProject();
  if (!project) return;
  project.files = project.files.filter(f => f.id !== fileId);
  for (const c of project.conversations) {
    c.activeFileIds = c.activeFileIds.filter(id => id !== fileId);
  }
  saveState();
  render();
}

// ---------- Building API requests ----------

function buildApiMessages(project, conv) {
  return conv.messages.map(msg => {
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
    return { role: "assistant", content: msg.text || " " };
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

// ---------- Sending / regenerating ----------

let isSending = false;

async function generateAssistant() {
  const project = getActiveProject();
  const conv = getActiveConversation(project);
  if (!project || !conv || isSending) return;
  if (conv.messages.length === 0 || conv.messages[conv.messages.length - 1].role !== "user") return;

  const assistantMsg = {
    id: uid(),
    role: "assistant",
    text: "",
    thinkingText: "",
    toolEvents: [],
    usage: null,
  };
  conv.messages.push(assistantMsg);

  isSending = true;
  saveState();
  render();

  try {
    await streamChat(
      {
        model: project.model,
        system: project.systemPrompt || DEFAULT_SYSTEM,
        messages: buildApiMessages(project, conv).slice(0, -1),
        useWebSearch: !!project.webSearch,
        thinking: !!project.thinking,
      },
      (event) => {
        if (event.type === "text") {
          assistantMsg.text += event.text;
          updateAssistantBubble(assistantMsg);
        } else if (event.type === "thinking") {
          assistantMsg.thinkingText += event.text;
          updateAssistantBubble(assistantMsg);
        } else if (event.type === "tool_use") {
          assistantMsg.toolEvents.push({ name: event.name, query: event.query });
          updateAssistantBubble(assistantMsg);
        } else if (event.type === "done") {
          assistantMsg.usage = event.usage;
          updateAssistantBubble(assistantMsg);
          updateConversationUsageBar();
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

async function sendMessage(text) {
  const conv = getActiveConversation();
  if (!conv || !text.trim() || isSending) return;
  conv.messages.push({
    id: uid(),
    role: "user",
    text: text.trim(),
    fileIds: [...conv.activeFileIds],
  });
  conv.activeFileIds = [];
  await generateAssistant();
}

async function regenerateMessage(messageId) {
  const conv = getActiveConversation();
  if (!conv || isSending) return;
  const idx = conv.messages.findIndex(m => m.id === messageId);
  if (idx < 0 || conv.messages[idx].role !== "assistant") return;
  conv.messages = conv.messages.slice(0, idx);
  saveState();
  render();
  await generateAssistant();
}

function deleteMessage(messageId) {
  const conv = getActiveConversation();
  if (!conv) return;
  conv.messages = conv.messages.filter(m => m.id !== messageId);
  saveState();
  render();
}

function copyMessage(messageId) {
  const conv = getActiveConversation();
  const msg = conv?.messages.find(m => m.id === messageId);
  if (!msg) return;
  navigator.clipboard.writeText(msg.text || "").then(
    () => flashToast("Copied"),
    () => flashToast("Couldn't copy", true)
  );
}

// ---------- Token counting / cost ----------

function estimateCost(tokens, perMillion) {
  if (!perMillion) return 0;
  return (tokens / 1_000_000) * perMillion;
}

function conversationTotals(project, conv) {
  let input = 0, output = 0;
  for (const m of conv.messages) {
    if (m.usage) {
      input += m.usage.input_tokens || 0;
      output += m.usage.output_tokens || 0;
    }
  }
  const info = modelInfo(project.model);
  const cost = estimateCost(input, info.pricePerMillion.input) + estimateCost(output, info.pricePerMillion.output);
  return { input, output, cost };
}

function formatTokens(n) {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function formatCost(cost) {
  if (!cost) return "";
  if (cost < 0.01) return `~$${cost.toFixed(4)}`;
  if (cost < 1)    return `~$${cost.toFixed(3)}`;
  return `~$${cost.toFixed(2)}`;
}

function messageUsageLabel(msg, project) {
  if (!msg.usage) return "";
  const info = modelInfo(project.model);
  const cost = estimateCost(msg.usage.input_tokens, info.pricePerMillion.input) +
               estimateCost(msg.usage.output_tokens, info.pricePerMillion.output);
  const tokens = `${formatTokens(msg.usage.input_tokens)} in · ${formatTokens(msg.usage.output_tokens)} out`;
  const dollars = formatCost(cost);
  return dollars ? `${tokens} · ${dollars}` : tokens;
}

// ---------- Export ----------

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(s) {
  return (s || "untitled").replace(/[^\w\-]+/g, "_").slice(0, 60);
}

function exportConversationJson() {
  const project = getActiveProject();
  const conv = getActiveConversation(project);
  if (!project || !conv) return;
  const data = {
    exportedAt: new Date().toISOString(),
    project: project.name,
    conversation: conv.name,
    model: project.model,
    systemPrompt: project.systemPrompt,
    settings: { webSearch: project.webSearch, thinking: project.thinking },
    messages: conv.messages.map(m => ({
      role: m.role,
      text: m.text,
      thinkingText: m.thinkingText || undefined,
      attachedFiles: (m.fileIds || []).map(id => project.files.find(f => f.id === id)?.name).filter(Boolean),
      usage: m.usage || undefined,
    })),
    totals: conversationTotals(project, conv),
  };
  downloadFile(`${safeFilename(conv.name)}.json`, JSON.stringify(data, null, 2), "application/json");
}

function exportConversationMarkdown() {
  const project = getActiveProject();
  const conv = getActiveConversation(project);
  if (!project || !conv) return;
  const totals = conversationTotals(project, conv);
  let md = `# ${project.name} — ${conv.name}\n\n`;
  md += `*Exported ${new Date().toLocaleString()} · Model: \`${project.model}\`*\n\n`;
  if (project.systemPrompt) md += `## System\n\n${project.systemPrompt}\n\n`;
  md += `---\n\n`;
  for (const m of conv.messages) {
    md += `## ${m.role === "user" ? "You" : "Claude"}\n\n`;
    if (m.fileIds?.length) {
      const names = m.fileIds.map(id => project.files.find(f => f.id === id)?.name).filter(Boolean);
      if (names.length) md += `*Attached: ${names.join(", ")}*\n\n`;
    }
    if (m.thinkingText) {
      md += `<details><summary>Thinking</summary>\n\n${m.thinkingText}\n\n</details>\n\n`;
    }
    md += `${m.text || ""}\n\n`;
    if (m.usage) md += `*${messageUsageLabel(m, project)}*\n\n`;
  }
  md += `---\n\n*Total: ${totals.input} in · ${totals.output} out${totals.cost ? ` · ${formatCost(totals.cost)}` : ""}*\n`;
  downloadFile(`${safeFilename(conv.name)}.md`, md, "text/markdown");
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
    const isActive = p.id === state.activeProjectId;

    const item = document.createElement("div");
    item.className = "project-item" + (isActive ? " active" : "");

    const headRow = document.createElement("div");
    headRow.className = "project-head-row";

    const head = document.createElement("button");
    head.className = "project-head";
    head.innerHTML = `<span class="caret">${isActive ? "▾" : "▸"}</span><span class="name"></span>`;
    head.querySelector(".name").textContent = p.name || "Untitled";
    head.addEventListener("click", () => selectProject(p.id));
    head.addEventListener("dblclick", (e) => { e.preventDefault(); renameProject(p.id); });
    headRow.appendChild(head);

    const renameBtn = document.createElement("button");
    renameBtn.className = "row-action";
    renameBtn.textContent = "✏️";
    renameBtn.title = "Rename project";
    renameBtn.addEventListener("click", (e) => { e.stopPropagation(); renameProject(p.id); });
    headRow.appendChild(renameBtn);

    item.appendChild(headRow);

    if (isActive) {
      const subList = document.createElement("div");
      subList.className = "conv-list";

      const newBtn = document.createElement("button");
      newBtn.className = "conv-new";
      newBtn.textContent = "+ New chat";
      newBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        createConversation();
      });
      subList.appendChild(newBtn);

      for (const c of p.conversations) {
        const row = document.createElement("div");
        row.className = "conv-row";

        const ci = document.createElement("button");
        ci.className = "conv-item" + (c.id === p.activeConversationId ? " active" : "");
        ci.textContent = c.name || "Untitled";
        ci.addEventListener("click", (e) => {
          e.stopPropagation();
          selectConversation(c.id);
        });
        ci.addEventListener("dblclick", (e) => { e.preventDefault(); renameConversation(c.id); });
        row.appendChild(ci);

        const rename = document.createElement("button");
        rename.className = "row-action";
        rename.textContent = "✏️";
        rename.title = "Rename conversation";
        rename.addEventListener("click", (e) => { e.stopPropagation(); renameConversation(c.id); });
        row.appendChild(rename);

        subList.appendChild(row);
      }

      item.appendChild(subList);
    }

    list.appendChild(item);
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
  if (!MODELS.find(m => m.id === project.model)) {
    const opt = document.createElement("option");
    opt.value = project.model;
    opt.textContent = project.model;
    opt.selected = true;
    select.appendChild(opt);
  }

  $("web-search-toggle").checked = !!project.webSearch;

  const thinkingToggle = $("thinking-toggle");
  const supports = modelInfo(project.model).supportsThinking;
  thinkingToggle.checked = !!project.thinking && supports;
  thinkingToggle.disabled = !supports;
  thinkingToggle.parentElement.title = supports ? "Extended thinking" : "This model doesn't support extended thinking";

  $("system-prompt").value = project.systemPrompt || "";

  const conv = getActiveConversation(project);
  $("conv-name").value = conv?.name || "";

  renderMessages();
  renderFilesBar();
  renderFileLibrary();
  updateConversationUsageBar();
  updateSendButton();
}

function renderMessages() {
  const project = getActiveProject();
  const conv = getActiveConversation(project);
  const wrap = $("conversation");
  wrap.innerHTML = "";
  if (!conv) return;
  if (conv.messages.length === 0) {
    const hint = document.createElement("div");
    hint.className = "empty-conv";
    hint.textContent = "No messages yet. Say hi 👋";
    wrap.appendChild(hint);
    return;
  }
  for (const msg of conv.messages) {
    wrap.appendChild(buildMessageNode(msg, project, conv));
  }
  wrap.scrollTop = wrap.scrollHeight;
}

function buildMessageNode(msg, project, conv) {
  const wrap = document.createElement("div");
  wrap.className = `message ${msg.role}`;
  wrap.dataset.id = msg.id;

  const head = document.createElement("div");
  head.className = "msg-head";
  head.innerHTML = `<span class="role"></span><span class="usage"></span>`;
  head.querySelector(".role").textContent = msg.role === "user" ? "You" : "Claude";
  head.querySelector(".usage").textContent = msg.role === "assistant" ? messageUsageLabel(msg, project) : "";
  wrap.appendChild(head);

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

  const actions = document.createElement("div");
  actions.className = "msg-actions";

  const copyBtn = mkActionBtn("📋", "Copy", () => copyMessage(msg.id));
  actions.appendChild(copyBtn);

  if (msg.role === "assistant") {
    const isLast = conv.messages[conv.messages.length - 1]?.id === msg.id;
    if (isLast && !isSending) {
      actions.appendChild(mkActionBtn("🔄", "Regenerate", () => regenerateMessage(msg.id)));
    }
  }

  actions.appendChild(mkActionBtn("🗑", "Delete", () => deleteMessage(msg.id)));
  wrap.appendChild(actions);

  return wrap;
}

function mkActionBtn(icon, title, onClick) {
  const b = document.createElement("button");
  b.className = "msg-action";
  b.title = title;
  b.textContent = icon;
  b.addEventListener("click", onClick);
  return b;
}

function fillMessageBody(body, msg) {
  body.innerHTML = "";
  if (msg.thinkingText) {
    const det = document.createElement("details");
    det.className = "thinking";
    const sum = document.createElement("summary");
    sum.textContent = "💭 Thinking";
    det.appendChild(sum);
    const inner = document.createElement("div");
    inner.className = "thinking-content";
    inner.textContent = msg.thinkingText;
    det.appendChild(inner);
    body.appendChild(det);
  }
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
  const node = document.querySelector(`[data-id="${msg.id}"]`);
  if (!node) return renderMessages();
  const body = node.querySelector(".body");
  fillMessageBody(body, msg);
  const usageNode = node.querySelector(".usage");
  if (usageNode) usageNode.textContent = messageUsageLabel(msg, getActiveProject());
  const conv = $("conversation");
  conv.scrollTop = conv.scrollHeight;
}

function updateConversationUsageBar() {
  const project = getActiveProject();
  const conv = getActiveConversation(project);
  const bar = $("conv-usage");
  if (!project || !conv) { bar.textContent = ""; return; }
  const t = conversationTotals(project, conv);
  if (!t.input && !t.output) { bar.textContent = ""; return; }
  const parts = [`${formatTokens(t.input)} in`, `${formatTokens(t.output)} out`];
  if (t.cost) parts.push(formatCost(t.cost));
  bar.textContent = parts.join(" · ");
}

function renderFilesBar() {
  const conv = getActiveConversation();
  const project = getActiveProject();
  const bar = $("files-bar");
  const ul = $("active-files");
  ul.innerHTML = "";
  if (!conv) { bar.hidden = true; return; }
  bar.hidden = conv.activeFileIds.length === 0;
  for (const fid of conv.activeFileIds) {
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
  const conv = getActiveConversation(project);
  const ul = $("file-library");
  ul.innerHTML = "";
  if (project.files.length === 0) {
    const li = document.createElement("li");
    li.className = "muted small";
    li.textContent = "No files yet. Click 📎 in the composer to upload.";
    ul.appendChild(li);
    return;
  }
  for (const f of project.files) {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = conv?.activeFileIds.includes(f.id) || false;
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

function focusAndSelect(id) {
  queueMicrotask(() => {
    const el = $(id);
    if (el) { el.focus(); el.select(); }
  });
}

function flashToast(text, isError = false) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  clearTimeout(flashToast._t);
  flashToast._t = setTimeout(() => { el.hidden = true; }, 1500);
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

  $("conv-name").addEventListener("change", (e) => {
    const conv = getActiveConversation();
    if (!conv) return;
    conv.name = e.target.value.trim() || "Untitled";
    saveState();
    renderSidebar();
  });

  $("model-select").addEventListener("change", (e) => {
    const project = getActiveProject();
    if (!project) return;
    project.model = e.target.value;
    saveState();
    renderProject();
  });

  $("web-search-toggle").addEventListener("change", (e) => {
    const project = getActiveProject();
    if (!project) return;
    project.webSearch = e.target.checked;
    saveState();
  });

  $("thinking-toggle").addEventListener("change", (e) => {
    const project = getActiveProject();
    if (!project) return;
    project.thinking = e.target.checked;
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

  $("delete-conv-btn").addEventListener("click", () => {
    const project = getActiveProject();
    if (project?.activeConversationId) deleteConversation(project.activeConversationId);
  });

  // Export menu (toggle a small popover with two options)
  const exportBtn = $("export-btn");
  const exportMenu = $("export-menu");
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.hidden = !exportMenu.hidden;
  });
  document.addEventListener("click", () => { exportMenu.hidden = true; });
  exportMenu.addEventListener("click", (e) => e.stopPropagation());
  $("export-json").addEventListener("click", () => { exportMenu.hidden = true; exportConversationJson(); });
  $("export-md").addEventListener("click",   () => { exportMenu.hidden = true; exportConversationMarkdown(); });

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
