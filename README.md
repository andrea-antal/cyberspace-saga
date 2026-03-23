# Cyberspace Saga

A Choose Your Own Adventure-style decision journal. Map out real-life decisions as branching narratives — explore paths, weigh tradeoffs, and see where each choice leads.

## How It Works

You describe a decision you're facing. An AI interviewer asks clarifying questions to understand your values, risks, and constraints. Then it generates a branching decision tree structured like a CYOA book: fact pages summarize what's known, decision pages present choice points, scenario pages explore consequences, and ending pages describe likely outcomes.

Every page is editable. You can regenerate AI scenarios, fork alternate paths, undo/redo, and bookmark important pages. The whole journal lives in your browser's localStorage — no account required to use it.

### AI Features

AI generation uses a progressive 3-stage pipeline with streaming:
1. **Page 1** streams in immediately so you can start reading within seconds
2. **Skeleton** maps out the full tree structure in the background
3. **Page content** fills in remaining pages 2 at a time while you explore

Supports both Anthropic Claude and OpenAI models (bring your own key). Choose between Sonnet/Opus or GPT-5.4/GPT-5.4 mini in Settings. Your API key stays in your browser and is proxied to the provider — never stored on our servers.

### Sharing & Social

Publish adventures with custom slugs (e.g. `yourdomain.com/my-adventure`), share via private links (view-only or edit access), and browse a community leaderboard of top-liked stories. Set up a creator profile at `/@username` with bio and links.

### Customization

Choose from 15 cover art images across 5 themed sets, 5 color schemes (Parchment, Midnight, Rose Quartz, Forest, Obsidian), and 5 font pairings. Export adventures as JSON, Markdown, styled HTML, or PDF.

## Stack

- **Frontend**: TypeScript, vanilla DOM (no framework), Vite
- **Styling**: Custom CSS with a paper/book aesthetic, theme system
- **Fonts**: Fraunces, Playfair Display, DM Sans, Spectral, Space Mono + more (Google Fonts)
- **Backend**: Vercel Serverless Functions (TypeScript)
- **Storage**: Vercel KV (Redis) for cloud backup, sharing, likes, and profiles
- **AI**: Anthropic Claude API + OpenAI API (BYOK)
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

For local development without an API key, you can use the Claude CLI toggle in Settings (requires a Claude Max subscription and `claude` installed).

## Deploy

Push to a Vercel-connected repo. Set the KV environment variables in your Vercel project settings.

```
npm run build
```

## License

This work is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You are free to:
- **Share** — copy and redistribute the material in any medium or format
- **Adapt** — remix, transform, and build upon the material

Under the following terms:
- **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- **NonCommercial** — You may not use the material for commercial purposes.
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same license.
