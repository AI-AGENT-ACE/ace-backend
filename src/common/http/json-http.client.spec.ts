import { JsonHttpClient } from './json-http.client';

describe('bounded AI audio transport', () => {
  const client = new JsonHttpClient({ getOrThrow: () => 1000 } as never);
  afterEach(() => jest.restoreAllMocks());
  it('classifies HTTP, invalid JSON and network errors without response text', async () => {
    const mocked = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('private upstream detail', { status: 503 }));
    await expect(client.request('https://ai.example/agent/voice')).rejects.toMatchObject({
      kind: 'http',
      status: 503,
      message: 'Upstream request failed',
    });
    mocked.mockResolvedValue(new Response('not json'));
    await expect(client.request('https://ai.example/agent/voice')).rejects.toMatchObject({
      kind: 'invalid_json',
    });
    mocked.mockRejectedValue(new TypeError('private network detail'));
    await expect(client.request('https://ai.example/agent/voice')).rejects.toMatchObject({
      kind: 'network',
      message: 'Upstream request failed',
    });
  });
  it('classifies deadline cancellation as timeout', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await expect(client.request('https://ai.example/agent/voice', {}, 5)).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
  it('accepts WAV bytes without attempting JSON parsing', async () => {
    const bytes = Buffer.alloc(44);
    bytes.write('RIFF');
    bytes.write('WAVE', 8);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } }));
    expect(await client.wav('https://ai.example/tts', { method: 'POST' }, 1000)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example/tts',
      expect.objectContaining({ redirect: 'error' }),
    );
  });
  it('rejects non-audio and excessive responses', async () => {
    const mocked = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    await expect(client.wav('https://ai.example/tts', {}, 1000)).rejects.toThrow('audio type');
    mocked.mockResolvedValue(
      new Response('x', {
        headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(9 * 1024 * 1024) },
      }),
    );
    await expect(client.wav('https://ai.example/tts', {}, 1000)).rejects.toThrow('too large');
  });
});
