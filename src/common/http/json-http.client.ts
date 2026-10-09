import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JsonHttpClient {
  constructor(private readonly config: ConfigService) {}

  async request(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<unknown> {
    return JSON.parse((await this.read(url, init, timeoutMs, false)).toString('utf8')) as unknown;
  }

  async wav(url: string, init: RequestInit, timeoutMs: number): Promise<Buffer> {
    const bytes = await this.read(url, init, timeoutMs, true);
    if (
      bytes.length < 44 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE'
    )
      throw new Error('Invalid upstream WAV');
    return bytes;
  }

  private async read(
    url: string,
    init: RequestInit,
    timeoutMs: number | undefined,
    audio: boolean,
  ) {
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(),
      timeoutMs ?? this.config.getOrThrow<number>('EXTERNAL_API_TIMEOUT_MS'),
    );
    try {
      const signal = init.signal ? AbortSignal.any([init.signal, abort.signal]) : abort.signal;
      const response = await fetch(url, { ...init, signal, redirect: 'error' });
      if (!response.ok || !response.body) throw new Error('Upstream request failed');
      if (audio && !response.headers.get('content-type')?.toLowerCase().startsWith('audio/wav'))
        throw new Error('Invalid upstream audio type');
      const maximum = audio ? 8 * 1024 * 1024 : 512 * 1024;
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
      return Buffer.concat(chunks);
    } finally {
      clearTimeout(timeout);
    }
  }
}
