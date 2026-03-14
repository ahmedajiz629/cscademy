# CS Academy Proxy — Next.js + Convex

A local web application that lets you write, test (Run), and submit code on
[CS Academy](https://csacademy.com) through a proxy server. Built with
**Next.js 15** (App Router) and **Convex** for real-time data.

## Architecture

```
┌───────────────────────────────────────────────────┐
│  Browser (Next.js Frontend)                       │
│  ┌─────────────┬──────────────┬──────────────────┐│
│  │ Problem List│ Code Editor  │ Input / Output   ││
│  │ (Convex)    │ (CodeMirror) │                  ││
│  └──────┬──────┴──────┬───────┴────────┬─────────┘│
│         │ Convex Queries  API Routes (fetch)      │
└─────────┼─────────────────────┼───────────────────┘
          │                     │
    ┌─────▼──────┐   ┌─────────▼──────────┐
    │ Convex DB  │   │ Next.js API Routes  │
    │ (problems, │   │ /api/csacademy/*    │
    │ submissions│   │                     │
    │ )          │   │ ┌─────────────────┐ │
    └────────────┘   │ │ CSAcademy       │ │
                     │ │ Service         │ │
                     │ │ (HTTP + WS)     │ │
                     │ └────────┬────────┘ │
                     └──────────┼──────────┘
                                │
                     ┌──────────▼──────────┐
                     │  csacademy.com      │
                     │  (API + WebSocket)  │
                     └─────────────────────┘
```

## Quick Start

```bash
# 1. Install dependencies
cd cscademy-proxy
npm install

# 2. Set up Convex (optional — problems work without it)
npx convex dev
# Follow prompts to create a new project, then copy the URL to .env.local

# 3. Configure credentials (already in .env.local)
# CSACADEMY_EMAIL=your@email.com
# CSACADEMY_PASSWORD=your_password

# 4. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. **Click "Connect"** — logs into CSAcademy using the credentials from
   `.env.local`, establishes a WebSocket connection for receiving results.

2. **Select a problem** from the dropdown on the left panel.

3. **Write your solution** in the code editor (C++ with syntax highlighting).

4. **Run Code** (`Ctrl+Enter`) — executes your code with the custom input and
   shows stdout/stderr in the output panel.

5. **Submit Solution** (`Ctrl+Shift+Enter`) — submits your code for official
   evaluation and shows the score and per-test results.

## Project Structure

```
cscademy-proxy/
├── app/
│   ├── layout.tsx          # Root layout with Convex provider
│   ├── page.tsx            # Main IDE page
│   ├── globals.css         # Tailwind + custom styles
│   ├── providers.tsx       # Convex client provider
│   └── api/csacademy/
│       ├── login/route.ts  # POST: login to CSAcademy
│       ├── run/route.ts    # POST: run code with custom input
│       └── submit/route.ts # POST: submit for evaluation
├── components/
│   ├── CodeEditor.tsx      # CodeMirror 6 editor
│   ├── ProblemPanel.tsx    # Problem selector & description
│   └── OutputPanel.tsx     # Output display with score
├── convex/
│   ├── schema.ts           # DB schema (problems, submissions)
│   ├── problems.ts         # Problem CRUD + seed function
│   └── submissions.ts      # Submission tracking
├── lib/
│   └── csacademy.ts        # CSAcademy API service (login, WS, run, submit)
├── .env.local              # Credentials & Convex URL
└── package.json
```

## Keyboard Shortcuts

| Shortcut             | Action          |
| -------------------- | --------------- |
| `Ctrl + Enter`       | Run code        |
| `Ctrl + Shift + Enter` | Submit solution |

## Adding Problems

Edit the `DEFAULT_PROBLEMS` array in `app/page.tsx` or use the Convex dashboard
to add problems to the database. Each problem needs:

- `slug` — unique identifier
- `name` — display name
- `contestTaskId` — CSAcademy task ID (from the URL)
- `referer` — full CSAcademy task URL
- `description`, `starterCode`, `sampleInput`, `sampleOutput`

## Convex Setup (Optional)

Convex provides real-time database and is used for persistent problem/submission
storage. The app works without Convex (uses hardcoded problems).

```bash
npx convex dev
# Creates a Convex project and gives you a deployment URL
# Add to .env.local:
# NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
```

Then seed problems:
```bash
npx convex run problems:seed
```
