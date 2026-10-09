import { VoiceAiClient } from './voice-ai.client';
import { readFile } from 'fs/promises';
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));

describe('Modal voice adapter', () => {
  const config = {
    get: (key: string) => (key === 'AI_SERVER_URL' ? 'https://ai.example' : undefined),
    getOrThrow: () => 60000,
  };
  beforeEach(() => jest.mocked(readFile).mockResolvedValue(Buffer.from('test wav')));
  it('sends multipart audio and preserves recording correlation without sending user IDs upstream', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'remote',
        transcript: '메모장 열어줘',
        response: { type: 'tool_call', tool: 'app.open', arguments: { canonicalId: 'notepad' } },
      }),
    };
    const conversations = { resolve: jest.fn() };
    const result = await new VoiceAiClient(
      config as never,
      http as never,
      conversations as never,
    ).process('local.wav', 'voice_test', 'user');
    expect(result).toMatchObject({
      requestId: 'voice_test',
      transcript: '메모장 열어줘',
      type: 'tool_call',
      arguments: { canonicalId: 'notepad' },
    });
    const [url, init] = http.request.mock.calls[0];
    expect(url).toBe('https://ai.example/agent/voice');
    expect(init.body.get('audio')).toBeInstanceOf(Blob);
    expect(init.body.has('userId')).toBe(false);
    expect(init.body.has('recordingId')).toBe(false);
    expect(conversations.resolve).not.toHaveBeenCalled();
  });
  it('rejects malformed responses instead of marking recognition successful', async () => {
    const http = { request: jest.fn().mockResolvedValue({ transcript: 'oops' }) };
    await expect(
      new VoiceAiClient(config as never, http as never, {} as never).process(
        'local.wav',
        'voice_test',
        'user',
      ),
    ).rejects.toMatchObject({ response: { code: 'VOICE_PROCESSING_FAILED' } });
  });
});
