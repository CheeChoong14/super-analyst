# Data Analyst

Upload any CSV file and get an AI-generated interactive HTML report — powered by Claude Managed Agents.

## How it works

1. Drop a CSV file onto the upload page
2. The backend uploads your file to Anthropic, spins up a managed agent with pandas + plotly, and streams live progress back to you
3. The agent analyzes your data, writes Python scripts, generates Plotly charts, and produces a self-contained `report.html`
4. The report renders directly in your browser — no file to open or download

## Stack

- **Frontend**: Next.js 15 App Router + Tailwind CSS
- **Backend**: Next.js API route with SSE streaming (`/api/analyze`)
- **AI**: Anthropic Managed Agents (`managed-agents-2026-04-01` beta)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Add your API key

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

```bash
npx vercel --prod
```

Add `ANTHROPIC_API_KEY` as an environment variable in your Vercel project settings.

> **Note:** The analysis can take 2–5 minutes. The API route is configured with `maxDuration = 300` (5 min). This requires **Vercel Pro** — the Hobby plan caps at 60 seconds.

## Project structure

```
src/
├── app/
│   ├── page.tsx              # Upload UI + inline report viewer
│   ├── layout.tsx
│   └── api/
│       └── analyze/
│           └── route.ts      # Streaming backend (SSE)
```

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (server-side only, never exposed to the browser) |
