import { Platform } from 'react-native';

function normalizeSseRaw(raw: string): string {
  return raw.replace(/\r\n/g, '\n');
}

/** Processa blocos SSE acumulados (event + data). */
export function parseSseBlocks(
  raw: string,
  onEvent: (event: string, dataLine: string) => void,
): string {
  const normalized = normalizeSseRaw(raw);
  const blocks = normalized.split(/\n\n+/);
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    const lines = block.split('\n');
    let event = 'message';
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLine += line.slice(5).trim();
      }
    }

    if (dataLine) onEvent(event, dataLine);
  }

  return remainder;
}

type SsePostOptions = {
  url: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
  onEvent: (event: string, dataLine: string) => void;
};

/**
 * POST com resposta SSE — XMLHttpRequest no native (fetch.body.getReader
 * não está disponível de forma fiável no React Native).
 */
export function postSse(options: SsePostOptions): Promise<void> {
  const { url, headers, body, signal, onEvent } = options;

  if (Platform.OS === 'web' && typeof ReadableStream !== 'undefined') {
    return postSseViaFetch(options);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'content-type') {
        xhr.setRequestHeader(key, value);
      }
    }

    let lastIndex = 0;
    let buffer = '';
    let settled = false;

    const consume = () => {
      const chunk = xhr.responseText.slice(lastIndex);
      if (!chunk) return;
      lastIndex = xhr.responseText.length;
      buffer += chunk;
      buffer = parseSseBlocks(buffer, onEvent);
    };

    const finish = (ok: boolean, err?: Error & { status?: number }) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      signal?.removeEventListener('abort', onAbort);
      if (ok) {
        consume();
        resolve();
      } else {
        reject(err ?? new Error('Falha de rede durante streaming.'));
      }
    };

    const onAbort = () => {
      xhr.abort();
    };

    signal?.addEventListener('abort', onAbort);

    // Android/RN: onprogress falha; readyState 3 + poll garante chunks parciais.
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
        consume();
      }
    };
    xhr.onprogress = consume;

    const pollTimer = setInterval(consume, 48);

    xhr.onload = () => {
      if (xhr.status >= 400) {
        finish(
          false,
          Object.assign(new Error(xhr.responseText.slice(0, 280) || `Erro ${xhr.status}`), {
            status: xhr.status,
          }),
        );
        return;
      }
      finish(true);
    };
    xhr.onerror = () => finish(false);
    xhr.onabort = () => {
      finish(false, Object.assign(new Error('AbortError'), { name: 'AbortError' }));
    };

    xhr.send(body);
  });
}

async function postSseViaFetch(options: SsePostOptions): Promise<void> {
  const { url, headers, body, signal, onEvent } = options;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw Object.assign(new Error(errText.slice(0, 280) || `Erro ${res.status}`), {
      status: res.status,
    });
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Streaming indisponível neste dispositivo.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseBlocks(buffer, onEvent);
  }
}

/** Deixa o React Native pintar um frame antes de finalizar o stream. */
export function flushStreamRender(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
