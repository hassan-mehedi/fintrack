import { fetch as expoFetch } from 'expo/fetch';

import { API_URL, ApiError, getAccessToken, refreshSession } from './api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

function toUIMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text', text: m.text }],
  }));
}

async function openStream(messages: ChatMessage[]) {
  return expoFetch(`${API_URL}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({ messages: toUIMessages(messages) }),
  });
}

// Streams the assistant reply, invoking onDelta with the text so far
export async function streamChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void
): Promise<string> {
  let response = await openStream(messages);
  if (response.status === 401 && (await refreshSession())) {
    response = await openStream(messages);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? `Request failed (${response.status})`);
  }
  if (!response.body) {
    throw new ApiError(0, 'Streaming not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as { type: string; delta?: string; errorText?: string };
          if (chunk.type === 'text-delta' && chunk.delta) {
            text += chunk.delta;
            onDelta(text);
          } else if (chunk.type === 'error') {
            throw new ApiError(0, chunk.errorText ?? 'Assistant error');
          }
        } catch (err) {
          if (err instanceof ApiError) throw err;
          // Ignore malformed keep-alive lines
        }
      }
    }
  }

  return text;
}
