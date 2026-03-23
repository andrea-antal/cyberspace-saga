import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] as string;
  const { system, messages, model, provider, stream } = req.body;

  if (!system || !messages) {
    return res.status(400).json({ error: 'Missing system or messages' });
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  if (provider === 'openai') {
    return handleByokOpenAI(res, apiKey, system, messages, model);
  }
  if (stream) {
    return handleByokStream(res, apiKey, system, messages, model);
  }
  return handleByok(res, apiKey, system, messages, model);
}

async function streamAnthropicToSSE(
  res: VercelResponse,
  apiKey: string,
  system: string,
  messages: any[],
  model: string,
): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw { status: 401, message: 'Invalid API key' };
    if (status === 429) throw { status: 429, message: 'Rate limited — try again shortly' };
    throw { status, message: `Anthropic API error (${status})` };
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body?.getReader();
  if (!reader) throw { status: 500, message: 'No response body' };

  const decoder = new TextDecoder();
  let sentenceBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          if (event.type === 'content_block_delta' && event.delta?.text) {
            const text = event.delta.text;
            sentenceBuffer += text;

            const sentenceEnd = /([.?!\n])\s*/g;
            let match: RegExpExecArray | null;
            let lastEnd = 0;
            while ((match = sentenceEnd.exec(sentenceBuffer)) !== null) {
              lastEnd = match.index + match[0].length;
            }

            if (lastEnd > 0) {
              const sentence = sentenceBuffer.slice(0, lastEnd);
              sentenceBuffer = sentenceBuffer.slice(lastEnd);
              res.write(`data: ${JSON.stringify({ text: sentence })}\n\n`);
            }
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (sentenceBuffer.trim()) {
    res.write(`data: ${JSON.stringify({ text: sentenceBuffer })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
}

async function handleByokStream(
  res: VercelResponse,
  apiKey: string, system: string, messages: any[], model?: string,
) {
  try {
    await streamAnthropicToSSE(res, apiKey, system, messages, model || 'claude-sonnet-4-6');
  } catch (e: any) {
    if (!res.headersSent) {
      res.status(e.status || 500).json({ error: e.message || 'Internal error' });
    }
  }
}

async function handleByok(
  res: VercelResponse,
  apiKey: string, system: string, messages: any[], model?: string,
) {
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
        max_tokens: 8192,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const status = response.status;
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

async function handleByokOpenAI(
  res: VercelResponse,
  apiKey: string, system: string, messages: any[], model?: string,
) {
  try {
    const openAiMessages = [
      { role: 'system', content: system },
      ...messages,
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-5.4-mini',
        max_completion_tokens: 8192,
        messages: openAiMessages,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401) return res.status(401).json({ error: 'Invalid API key' });
      if (status === 429) return res.status(429).json({ error: 'Rate limited — try again shortly' });
      return res.status(status).json({ error: `OpenAI API error (${status})` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content });
  } catch (_e) {
    return res.status(500).json({ error: 'Internal error' });
  }
}
