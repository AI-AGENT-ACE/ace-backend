import { VoiceAiClient } from './voice-ai.client';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { readFile } from 'fs/promises';
import { UpstreamHttpError } from '../common/http/json-http.client';
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));

describe('Modal voice adapter', () => {
  const config = {
    get: (key: string) => (key === 'AI_SERVER_URL' ? 'https://ai.example' : undefined),
    getOrThrow: () => 60000,
  };
  beforeEach(() => jest.mocked(readFile).mockResolvedValue(Buffer.from('test wav')));
  it('음성 도구도 카탈로그 인자 검증과 DENY 적용 후 전달', async () => {
    const permissions = { effective: jest.fn().mockResolvedValue({ denied: true }) };
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'remote',
        transcript: '테스트',
        response: {
          type: 'tool_call',
          tool: 'file.delete',
          arguments: {
            query: { original: '대상.txt', candidates: ['대상.txt'] },
            extensions: [],
          },
        },
      }),
    };
    const client = new VoiceAiClient(
      config as never,
      http as never,
      {} as never,
      new ToolCatalog(),
      permissions as never,
    );
    expect(await client.process('local.wav', 'voice_test', 'user')).toMatchObject({
      type: 'message',
      content: '이 작업은 권한 설정에서 차단되어 있습니다.',
    });
    permissions.effective.mockResolvedValue({ denied: false });
    expect(await client.process('local.wav', 'voice_test', 'user')).toMatchObject({
      type: 'tool_call',
      tool: 'file.delete',
      arguments: { query: { original: '대상.txt', candidates: ['대상.txt'] } },
    });
    http.request.mockResolvedValue({
      conversationId: 'remote',
      transcript: '테스트',
      response: { type: 'tool_call', tool: 'system.volume.mute', arguments: { mute: 'false' } },
    });
    expect(await client.process('local.wav', 'voice_test', 'user')).toMatchObject({
      type: 'message',
      content: expect.stringContaining('아무 작업도 실행하지 않았습니다'),
    });
  });
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
      new ToolCatalog(),
      { effective: jest.fn().mockResolvedValue({ denied: false }) } as never,
    ).process('local.wav', 'voice_test', 'user');
    expect(result).toMatchObject({
      requestId: 'voice_test',
      transcript: '메모장 열어줘',
      type: 'tool_call',
      arguments: { appName: 'notepad' },
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
      new VoiceAiClient(config as never, http as never, {} as never, new ToolCatalog(), {
        effective: jest.fn().mockResolvedValue({ denied: false }),
      } as never).process('local.wav', 'voice_test', 'user'),
    ).rejects.toMatchObject({ response: { code: 'VOICE_INVALID_RESPONSE' } });
  });
  it.each([
    ['timeout', undefined, 'VOICE_TIMEOUT', 504],
    ['http', 503, 'AI_SERVER_UNAVAILABLE', 502],
    ['network', undefined, 'AI_SERVER_UNAVAILABLE', 502],
    ['invalid_json', undefined, 'VOICE_INVALID_RESPONSE', 502],
  ] as const)(
    'classifies %s without leaking upstream content',
    async (kind, status, code, statusCode) => {
      const http = { request: jest.fn().mockRejectedValue(new UpstreamHttpError(kind, status)) };
      await expect(
        new VoiceAiClient(
          config as never,
          http as never,
          {} as never,
          new ToolCatalog(),
          {} as never,
        ).process('local.wav', 'voice_test', 'user'),
      ).rejects.toMatchObject({ response: { code }, status: statusCode });
      expect(http.request).toHaveBeenCalledTimes(1);
    },
  );
});
