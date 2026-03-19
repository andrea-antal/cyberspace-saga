# Cyberspace Saga

A Choose Your Own Adventure-style decision journal. Map out real-life decisions as branching narratives — explore paths, weigh tradeoffs, and see where each choice leads.

## How It Works

You describe a decision you're facing. An AI interviewer asks clarifying questions to understand your values, risks, and constraints. Then it generates a branching decision tree structured like a CYOA book: fact pages summarize what's known, decision pages present choice points, scenario pages explore consequences, and ending pages describe likely outcomes.

Every page is editable. You can regenerate AI scenarios, fork alternate paths, undo/redo, and bookmark important pages. The whole journal lives in your browser's localStorage — no account required to use it.

### Cloud Features

Create a cloud backup with a single click to get a token. Use that token to restore your journals on any device, or share individual decisions with others (edit or view-only access).

### AI Features

AI is powered by the Anthropic Claude API (bring your own key). You choose between Sonnet (fast) and Opus (deeper analysis) in Settings. Your API key stays in your browser and is passed directly to Anthropic — it never touches our servers.

## Stack

- **Frontend**: TypeScript, vanilla DOM (no framework), Vite
- **Styling**: Custom CSS with a paper/book aesthetic
- **Fonts**: Fraunces, Inknut Antiqua, Space Grotesk, Space Mono, Open Sans (Google Fonts)
- **Backend**: Vercel Serverless Functions (TypeScript)
- **Storage**: Vercel KV (Redis) for cloud backup and sharing
- **AI**: Anthropic Claude API (claude-sonnet-4-6 / claude-opus-4-6)
- **Images**: Generated with Google Gemini

## Development

```
npm install
npm run dev
```

Add your Vercel KV credentials to `.env.local` for cloud features:

```
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

## Deploy

Push to a Vercel-connected repo. Set the KV environment variables in your Vercel project settings.

```
npm run build
```
