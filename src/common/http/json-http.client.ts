import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JsonHttpClient {
  constructor(private readonly config: ConfigService) {}

  async request(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<unknown> {
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(),
      timeoutMs ?? this.config.getOrThrow<number>('EXTERNAL_API_TIMEOUT_MS'),
    );
    try {
      const response = await fetch(url, { ...init, signal: abort.signal, redirect: 'error' });
      if (!response.ok || !response.body) throw new Error('Upstream request failed');
      const maximum = 512 * 1024;
      if (Number(response.headers.get('content-length')) > maximum)
        throw new Error('Upstream response too large');
      const reader = response.body.getReader();
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > maximum) throw new Error('Upstream response too large');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  }
}
