import { JsonHttpClient } from './json-http.client';

describe('bounded AI audio transport', () => {
  const client = new JsonHttpClient({ getOrThrow: () => 1000 } as never);
  afterEach(() => jest.restoreAllMocks());
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
