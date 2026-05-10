# Beginner API Interface

A clean, ready-to-deploy chat UI for the Claude API. No accounts, no database — just deploy to Vercel with your API key and start chatting. Designed as a starting point: clone it, deploy it, and customize from there.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcrmccarthy79-ai%2Fbeginner-api-interface&env=ANTHROPIC_API_KEY&envDescription=Your%20Anthropic%20API%20key&envLink=https%3A%2F%2Fconsole.anthropic.com%2Fsettings%2Fkeys&project-name=beginner-api-interface&repository-name=beginner-api-interface)

One click → fork to your GitHub → deploy on Vercel. You'll be prompted for your Anthropic API key during setup; that's the only thing you need.

![Beginner API Interface screenshot](docs/screenshot.png)

**What you get:**

- **Projects** in the sidebar, each holding multiple **conversations** (just like Claude.ai).
- **Model switcher** — Opus, Sonnet, and Haiku across the 4.x line. Add or remove models with one line of code.
- **Web search** — toggle it on per project; Claude searches the web when it needs to.
- **Extended thinking** — toggle it on for complex reasoning. Thinking is shown collapsed above the response.
- **File library** — upload PDFs, images, or text/code files and attach them to your messages.
- **Streaming** responses — text appears as Claude writes it.
- **Token + cost counters** — per message and cumulative for the conversation. Estimated dollars based on published pricing.
- **Message actions** — copy, regenerate, delete on hover.
- **Export conversations** as Markdown or JSON.
- **Everything saved in your browser** (`localStorage`). No login, no Supabase, no backend storage.

The whole thing is ~1,000 lines of code across 4 files. Read it. Change it. Make it yours.

---

> **First time deploying anything to Vercel?** Read [docs/SETUP.md](docs/SETUP.md) — a step-by-step guide with no shortcuts and no assumed knowledge.

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

# If you're on a Mac with Homebrew Python, install uv first
# (Vercel's Python runtime needs it to install dependencies):
brew install uv

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
│   ├── chat.py          ← Serverless endpoint. Proxies to Anthropic & streams back.
│   └── requirements.txt ← Python deps for the function (just `anthropic`).
├── public/
│   ├── index.html       ← The page skeleton (sidebar + main pane + dialogs).
│   ├── styles.css       ← All styling. Theme via CSS variables at the top.
│   └── app.js           ← All client logic (projects, conversations, files, streaming).
├── vercel.json          ← Tells Vercel how to route requests.
└── README.md            ← You are here.
```

That's everything. There's no build step, no framework, no bundler.

### What the API does

[`api/chat.py`](api/chat.py) is a single Python serverless function. It accepts a POST with the conversation history and configuration, calls `client.messages.stream(...)`, and forwards events back to the browser over Server-Sent Events:

- `text` — model output deltas
- `thinking` — extended thinking deltas (when enabled)
- `tool_use` — when the model invokes a server tool (like web search)
- `done` — final message with token usage
- `error` — anything that went wrong

If you toggle web search on, it adds Anthropic's [`web_search` server tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool). If you toggle thinking on, it adds the `thinking` parameter with a 4k token budget.

### What the client does

[`public/app.js`](public/app.js) keeps everything in `localStorage` under one key: a list of projects, each with its own conversations, files, and settings. When you hit Send, it builds an Anthropic-style messages array (with `image`, `document`, and `text` content blocks for any attached files) and POSTs it to `/api/chat`, then renders the streamed events into the conversation as they arrive.

---

## A note on cost estimates

The dollar amounts shown next to each message and at the top of each conversation are **estimates** based on Anthropic's published per-million-token pricing at the time this code was written. They're meant to give you a quick sense of "is this conversation expensive?" — they are *not* a substitute for real billing data.

Anthropic occasionally updates pricing (and adds prompt caching, batching discounts, and other features that affect real cost). The single source of truth for what you actually pay is your [Anthropic Console](https://console.anthropic.com/) — check usage there and [the official pricing page](https://www.anthropic.com/pricing) before relying on these numbers for anything real.

To update the prices used in this UI: open [`public/app.js`](public/app.js), find the `MODELS` array near the top, and edit each model's `pricePerMillion: { input, output }`. Set both to `0` if you'd rather just see token counts without any dollar estimate.

---

## Customizing

**Add or change models** — edit the `MODELS` array at the top of [`public/app.js`](public/app.js). Each entry needs an `id` (the API model ID), a `label` (what shows in the dropdown), `pricePerMillion` (for the cost estimate), and `supportsThinking` (whether to enable the thinking toggle for it).

**Change the default system prompt** — the `DEFAULT_SYSTEM` constant in `app.js`, or just edit it per-project in the **Settings** dialog.

**Tweak the look** — everything theme-related lives in CSS variables at the top of [`public/styles.css`](public/styles.css). Colors, spacing, sidebar width — change one variable, the whole UI updates. Auto-respects your OS dark/light setting.

**Tune the thinking budget** — `THINKING_BUDGET` constants in both `app.js` and `chat.py`. Higher = more reasoning headroom, but more tokens.

**Add another tool** — in `api/chat.py`, the `tools` array is where Anthropic's server tools (web_search, code_execution, etc.) get added. To add **client-side** tools, you'd handle `content_block_start` events of type `tool_use` in the stream handler and extend the client's event loop.

---

## What this isn't

This is a reference, not a product. On purpose, it doesn't include:

- **Authentication** — anyone with the URL can use it. If you deploy publicly, your API key pays the bill. Either keep the URL private, add password protection in Vercel (paid), or add auth yourself.
- **Cross-device sync** — `localStorage` is per-browser. Open it on your phone and you start fresh. (Use the export buttons to move conversations.)
- **Markdown rendering** — assistant output is plain text. Add [marked](https://github.com/markedjs/marked) or [remark](https://github.com/remarkjs/remark) if you want code blocks, lists, etc. rendered.
- **Prompt caching / batch / files API** — these are Anthropic features that can save real money on long contexts. Worth adding if your conversations get long.

Each of these is a small extension. The point of this repo is to give you something simple that works, so you can add what you need without fighting the existing code.

---

## License

MIT. Take it, fork it, ship it.
