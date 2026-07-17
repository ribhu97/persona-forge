/**
 * Manual SSE client over fetch.
 *
 * EventSource doesn't support custom Authorization headers, so we use fetch
 * with a ReadableStream to parse SSE manually.  Supports heartbeats, multi-line
 * data, partial UTF-8, abort, and reconnection via Last-Event-ID.
 */

export interface SSEEvent {
  id: string | null;
  event: string | null;
  data: string;
}

export interface SSEClientOptions {
  url: string;
  token: string;
  lastEventId?: number;
  onEvent: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export class SSEClient {
  private controller: AbortController | null = null;
  private lastEventId: number;
  private closed = false;

  constructor(private options: SSEClientOptions) {
    this.lastEventId = options.lastEventId || 0;
  }

  async connect(): Promise<void> {
    this.closed = false;
    this.controller = new AbortController();

    try {
      const response = await fetch(this.options.url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.options.token}`,
          'Accept': 'text/event-stream',
          ...(this.lastEventId > 0 ? { 'Last-Event-ID': String(this.lastEventId) } : {}),
        },
        signal: this.controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('SSE response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events (separated by \n\n)
        let sepIndex: number;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          this._parseEvent(rawEvent);
        }
      }

      this.options.onClose?.();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.options.onClose?.();
      } else {
        this.options.onError?.(err);
      }
    }
  }

  private _parseEvent(raw: string): void {
    if (raw.startsWith(':')) {
      // Heartbeat comment — ignore
      return;
    }

    let id: string | null = null;
    let event: string | null = null;
    const dataLines: string[] = [];

    for (const line of raw.split('\n')) {
      if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (id) {
      this.lastEventId = parseInt(id, 10) || this.lastEventId;
    }

    const data = dataLines.join('\n');
    if (data || event) {
      this.options.onEvent({ id, event, data });
    }
  }

  close(): void {
    this.closed = true;
    this.controller?.abort();
  }

  getLastEventId(): number {
    return this.lastEventId;
  }
}
