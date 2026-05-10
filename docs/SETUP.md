# Setup Guide — From Zero to Running

This guide assumes you've never deployed something to Vercel and have only basic GitHub experience. If that's you, you're in the right place. Total time: about 10 minutes once you have your accounts.

---

## What you'll need

Three free things — sign up before you start so you don't have to stop mid-deploy:

1. **A GitHub account** — sign up at [github.com](https://github.com) if you don't have one.
2. **A Vercel account** — sign up at [vercel.com](https://vercel.com) using **"Continue with GitHub"**. Vercel is what hosts the actual website.
3. **An Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com/) → **Settings → API Keys → Create Key**.
   - **Important:** Anthropic charges per use (it's not free). You'll need to add a payment method and a small amount of credit (usually $5 minimum) at **Plans & Billing** before the API actually works. A casual chat costs fractions of a cent — but you do need credits on file.

Keep your API key somewhere safe (a password manager is ideal). It starts with `sk-ant-` and you'll paste it once during setup.

---

## Step 1: Fork this repo

Forking = making your own copy of someone else's GitHub repo, under your account. Your copy is yours to change.

1. Make sure you're logged into GitHub.
2. At the top right of the [main repo page](https://github.com/crmccarthy79-ai/beginner-api-interface), click the **Fork** button.
3. On the next screen, leave the defaults as-is and click **Create fork**.
4. You'll land on YOUR copy. The URL will say `github.com/YOUR_USERNAME/beginner-api-interface`.

That's your copy. Anything you change there won't affect the original.

---

## Step 2: Deploy it on Vercel

You have two paths. Pick whichever feels easier.

### Easy path — Deploy button

On your forked repo's README (the page you forked to), click the orange **Deploy with Vercel** button. It pre-fills everything for you, then jumps to step 4 below (the env var).

### Manual path

1. Go to [vercel.com/new](https://vercel.com/new).
2. You'll see a list of your GitHub repos. Find **beginner-api-interface** (your fork) and click **Import**.
   - First time only: Vercel will ask permission to read your GitHub repos. Allow it.

### The Configure Project screen (both paths land here)

3. Most defaults are fine. The only thing you need to set is the environment variable:
4. Find the **Environment Variables** section (on the same screen). Add one:
   - **Name:** `ANTHROPIC_API_KEY` ← exactly that, all caps, with the underscore
   - **Value:** paste your API key from Anthropic (the one starting with `sk-ant-`)
5. Click **Deploy**.
6. Wait ~30 seconds. You'll see a confetti animation when it's done.
7. Click the preview thumbnail or the URL link to open your live site. The URL looks like `your-project-xyz123.vercel.app`.

That's it — your copy is live on the internet.

---

## Step 3: First chat

Open your Vercel URL. The app should load immediately:

1. A new project is auto-created. Click the project name at the top of the main pane to rename it.
2. Type a message in the box at the bottom and press **Enter**.
3. Watch the response stream in.

If something didn't work, jump to **Common gotchas** below.

---

## Common gotchas

**"ANTHROPIC_API_KEY is not set" or 500 errors when sending a message.**
You either skipped the env var, named it wrong, or added it after the deploy finished. Fix it:
- Vercel dashboard → your project → **Settings → Environment Variables**
- Make sure the name is exactly `ANTHROPIC_API_KEY` (no typos, no extra spaces)
- Save, then go to **Deployments → most recent → ⋯ menu → Redeploy**

**"Insufficient credits" or 401 errors.**
Anthropic doesn't give free usage out of the box. Go to [console.anthropic.com](https://console.anthropic.com/) → **Plans & Billing** → add a payment method and a small credit balance.

**My API key has spaces or weird characters.**
You probably copied it with extra whitespace. Regenerate the key on the Anthropic console, copy carefully, and paste into the Vercel env var.

**I made a code change. How do I deploy it?**
Push to your forked GitHub repo (commit + push to `main`). Vercel auto-deploys whenever you push. Takes about 30 seconds.

**I want to start over.**
In Vercel: dashboard → your project → **Settings → scroll to Delete Project**. Your GitHub fork stays safe — only the deployment is removed. You can re-import it any time.

---

## What next?

Once it works, the fun part — making it yours.

- **Change the colors and theme** — edit `public/styles.css`, look at the `:root` section near the top. Change one variable, the whole UI updates.
- **Change the default model** — edit `DEFAULT_MODEL` in `public/app.js`.
- **Add a custom system prompt** — set `DEFAULT_SYSTEM` in `public/app.js`, OR set it per-project in the **Settings** dialog inside the running app.
- **Add or remove models** — the `MODELS` array in `public/app.js` is the source of truth. Each entry has an `id`, `label`, and pricing.

Each of these is a one-line change. Push to GitHub when you're done; Vercel redeploys automatically.

---

## Local development (optional)

If you want to play with the code on your own computer without deploying every time:

```bash
git clone https://github.com/YOUR_USERNAME/beginner-api-interface.git
cd beginner-api-interface
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # paste your real key

# On macOS with Homebrew Python, install uv first:
brew install uv

# Then:
npx vercel dev
```

That gives you a localhost server with hot-reload.

---

## Stuck?

- **App loads but messages fail** — open browser dev tools (right-click → Inspect → Console tab) and look for red errors.
- **Can't find your Vercel URL** — [vercel.com](https://vercel.com) → Dashboard → click your project → the URL is at the top.
- **Truly stuck** — open an issue on the [original repo](https://github.com/crmccarthy79-ai/beginner-api-interface/issues) with what you tried and the error you saw. Be specific; "it's broken" is hard to debug.
