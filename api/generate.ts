import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  const { system, messages, model } = req.body;
  if (!system || !messages) {
    return res.status(400).json({ error: 'Missing system or messages' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 4096,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      // Return generic error messages to avoid leaking upstream details
      if (status === 401) return res.status(401).json({ error: 'Invalid API key' });
      if (status === 429) return res.status(429).json({ error: 'Rate limited — try again shortly' });
      return res.status(status).json({ error: `Anthropic API error (${status})` });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    return res.status(200).json({ content });
  } catch (_e) {
    return res.status(500).json({ error: 'Internal error' });
  }
}
