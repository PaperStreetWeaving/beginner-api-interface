# Beginner API Interface

A clean, ready-to-deploy chat UI for the Claude API. No accounts, no database — just deploy to Vercel with your API key and start chatting. Designed as a starting point: clone it, deploy it, and customize from there.

**What you get:**

- Sidebar with multiple **projects**, each with its own conversation, system prompt, and model.
- **Model switcher** — Opus, Sonnet, or Haiku (or anything else you wire up).
- **Web search** — toggle it on per project; Claude searches the web when it needs to.
- **File library** — upload PDFs, images, or text/code files and attach them to your messages.
- **Streaming** responses — text appears as Claude writes it.
- Everything is saved in your browser (`localStorage`). No login, no Supabase, no backend storage.

The whole thing is ~600 lines of code across 4 files. Read it. Change it. Make it yours.

---

## Setup — the 5-minute path

You'll need:

- A GitHub account
- A Vercel account (free) — sign up at [vercel.com](https://vercel.com) with your GitHub
- A Claude API key — get one at [console.anthropic.com](https://console.anthropic.com/) → **Settings → API Keys**

Then:

1. **Fork this repo** to your own GitHub account. (Click the **Fork** button at the top of this page.)
2. Go to [vercel.com/new](https://vercel.com/new) and click **Import** next to your fork.
3. Vercel will ask if you want to add Environment Variables. Add one:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your API key from Anthropic (starts with `sk-ant-…`)
4. Click **Deploy**. Wait ~30 seconds.
5. Vercel gives you a URL like `your-project.vercel.app`. Open it. Start chatting.

Done. That's the whole deployment.

> **If you forgot to add the env var:** Vercel dashboard → your project → **Settings → Environment Variables** → add `ANTHROPIC_API_KEY` → then **Deployments** → most recent → **Redeploy**.

---

## Local development

```bash
git clone https://github.com/YOUR_USERNAME/beginner-api-interface.git
cd beginner-api-interface

# Create a .env file with your key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Run it locally
npx vercel dev
```

Then open `http://localhost:3000`.

(`npx vercel dev` will prompt you to link to a Vercel project the first time — pick the one you deployed above, or create a new one. It'll then read `.env` automatically.)

---

## How the code is organized

```
beginner-api-interface/
├── api/
│   └── chat.py          ← Serverless endpoint. Proxies to Anthropic & streams back.
├── public/
│   ├── index.html       ← The page skeleton (sidebar + main pane).
│   ├── styles.css       ← All styling.
│   └── app.js           ← All client logic (projects, files, streaming).
├── vercel.json          ← Tells Vercel how to route requests.
├── requirements.txt     ← Just `anthropic` (the Python SDK).
└── README.md            ← You are here.
```

That's everything. There's no build step, no framework, no bundler. Open the files in any editor and you can read the whole thing in 15 minutes.

### What the API does

[`api/chat.py`](api/chat.py) is a single Python serverless function. It accepts a POST with the conversation history, calls `client.messages.stream(...)`, and forwards the model's text deltas back to the browser over Server-Sent Events. If you toggle web search on, it adds Anthropic's [`web_search` server tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool) to the request — Anthropic handles the actual searching.

### What the client does

[`public/app.js`](public/app.js) keeps everything in `localStorage` under one key: a list of projects, each with messages and files. When you hit Send, it builds an Anthropic-style messages array (with `image`, `document`, and `text` content blocks for any attached files) and POSTs it to `/api/chat`, then renders the streamed text into the conversation as it arrives.

---

## Customizing

**Add or change models** — edit the `MODELS` array at the top of [`public/app.js`](public/app.js). Use any Claude model ID from [the API docs](https://docs.anthropic.com/en/docs/about-claude/models).

**Change the default system prompt** — the `DEFAULT_SYSTEM` constant in `app.js`, or just edit it per-project from the **Settings** dialog.

**Tweak the look** — everything theme-related lives in CSS variables at the top of [`public/styles.css`](public/styles.css). Colors, spacing, sidebar width — change one variable, the whole UI updates.

**Add another tool** — in `api/chat.py`, the `tools` array is where Anthropic's server tools (web_search, code_execution, etc.) get added. To add **client-side** tools, you'd handle `content_block_start` events of type `tool_use` in the stream handler and extend the client's event loop.

---

## What this isn't

This is a reference, not a product. On purpose, it doesn't include:

- **Authentication** — anyone with the URL can use it. If you deploy publicly, your API key pays the bill. Either keep the URL private, add password protection in Vercel (paid), or add auth yourself.
- **Cross-device sync** — `localStorage` is per-browser. Open it on your phone and you start fresh.
- **Conversation export** — if you want to save chats elsewhere, export them yourself from `localStorage` (DevTools → Application → Local Storage).
- **Markdown rendering** — assistant output is plain text. Add [marked](https://github.com/markedjs/marked) or [remark](https://github.com/remarkjs/remark) if you want code blocks, lists, etc. rendered.
- **Token counting / cost display** — the API returns usage info (you'll see it in the network tab) but the UI doesn't surface it.

Each of these is a small extension. The point of this repo is to give you something simple that works, so you can add what you need without fighting the existing code.

---

## License

MIT. Take it, fork it, ship it.
