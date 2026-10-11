import { ConfigService } from '@nestjs/config';
import { JsonHttpClient } from '../../common/http/json-http.client';
import { HttpAiServerClient } from './http-ai-server.client';
import { AiTurnRequest } from '../ports/ai-server.client';

describe('HttpAiServerClient', () => {
  const turn: AiTurnRequest = {
    userId: 'user',
    conversationId: 'owned-conversation',
    messages: [{ role: 'USER', content: '안녕' }],
    responseLanguage: 'ko',
    tools: [],
  };
  const conversations = {
    lookup: jest.fn().mockResolvedValue('remote-conversation'),
    remember: jest.fn(),
    title: jest.fn().mockResolvedValue('AI가 생성한 제목'),
  };
  beforeEach(() => jest.clearAllMocks());
  const config = (url?: string) =>
    ({
      get: (key: string) =>
        key === 'AI_SERVER_URL' ? url : key === 'AI_SERVER_API_KEY' ? 'private-api-key' : 120000,
    }) as unknown as ConfigService;
  it('reports an unconfigured AI server without a fake response', async () => {
    const http = { request: jest.fn() };
    await expect(
      new HttpAiServerClient(
        config(),
        http as unknown as JsonHttpClient,
        conversations as never,
      ).generate(turn),
    ).rejects.toMatchObject({ response: { code: 'AI_NOT_CONFIGURED' } });
    expect(http.request).not.toHaveBeenCalled();
  });
  it('omits the first remote ID, persists the returned ID and retrieves its title', async () => {
    conversations.lookup.mockResolvedValueOnce(undefined);
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'new-remote',
        response: { type: 'message', content: '안녕하세요' },
      }),
    };
    const response = await new HttpAiServerClient(
      config('https://ai.example'),
      http as never,
      conversations as never,
    ).generate(turn);
    expect(JSON.parse(http.request.mock.calls[0][1].body)).toEqual({ message: '안녕' });
    expect(conversations.remember).toHaveBeenCalledWith(
      'user',
      'owned-conversation',
      'https://ai.example',
      'new-remote',
    );
    expect(conversations.title).toHaveBeenCalledWith(
      'https://ai.example',
      'new-remote',
      expect.any(Object),
      undefined,
    );
    expect(response).toMatchObject({ title: 'AI가 생성한 제목', content: '안녕하세요' });
  });
  it('prefers an inline title if the AI server adds it to the envelope', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'remote-conversation',
        title: '응답 제목',
        response: { type: 'message', content: '답변' },
      }),
    };
    const response = await new HttpAiServerClient(
      config('https://ai.example'),
      http as never,
      conversations as never,
    ).generate(turn);
    expect(response.title).toBe('응답 제목');
    expect(conversations.title).not.toHaveBeenCalled();
  });
  it('rejects unexpected tool names', async () => {
    const http = {
      request: jest
        .fn()
        .mockResolvedValue({ toolCalls: [{ id: 'call-1', tool: 'shell.execute', arguments: {} }] }),
    };
    await expect(
      new HttpAiServerClient(
        config('http://127.0.0.1:8000'),
        http as unknown as JsonHttpClient,
        conversations as never,
      ).generate(turn),
    ).rejects.toMatchObject({ response: { code: 'AI_INVALID_RESPONSE' } });
  });
  it('sanitizes transport errors that contain authorization details', async () => {
    const http = {
      request: jest.fn().mockRejectedValue(new Error('Authorization: Bearer private-api-key')),
    };
    await expect(
      new HttpAiServerClient(
        config('http://127.0.0.1:8000'),
        http as unknown as JsonHttpClient,
        conversations as never,
      ).generate(turn),
    ).rejects.toMatchObject({
      response: { code: 'AI_UNAVAILABLE', message: 'AI server is unavailable' },
    });
  });
  it('uses the Modal text envelope and converts app aliases into validated backend arguments', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'remote-conversation',
        response: {
          type: 'tool_call',
          tool: 'app.open',
          arguments: { original: '메모장', canonicalId: 'notepad', candidates: ['notepad'] },
        },
      }),
    };
    const response = await new HttpAiServerClient(
      config('https://ai.example'),
      http as never,
      conversations as never,
    ).generate(turn);
    expect(response.toolCalls[0]).toMatchObject({
      tool: 'app.open',
      arguments: { appName: 'notepad' },
    });
    expect(http.request).toHaveBeenCalledWith(
      'https://ai.example/agent/text',
      expect.objectContaining({
        body: JSON.stringify({ conversationId: 'remote-conversation', message: '안녕' }),
      }),
      120000,
    );
  });
  it('maps denied results to failure and does not pretend the tool succeeded', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({ type: 'message', content: '취소했습니다.' }),
    };
    const request: AiTurnRequest = {
      ...turn,
      toolResults: [{ callId: 'call', tool: 'app.open' as never, status: 'DENIED' }],
    };
    await new HttpAiServerClient(
      config('https://ai.example'),
      http as never,
      conversations as never,
    ).generate(request);
    const body = JSON.parse(http.request.mock.calls[0][1].body);
    expect(body).toMatchObject({ status: 'failure', error: { status: 'DENIED' } });
    expect(http.request.mock.calls[0][0]).toBe('https://ai.example/agent/tool-result');
  });
  it('refuses cross-conversation responses', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'other',
        response: { type: 'message', content: 'private' },
      }),
    };
    await expect(
      new HttpAiServerClient(
        config('https://ai.example'),
        http as never,
        conversations as never,
      ).generate(turn),
    ).rejects.toMatchObject({ response: { code: 'AI_INVALID_RESPONSE' } });
  });
  it('does not execute unsupported tools or sequences', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'remote-conversation',
        response: {
          type: 'tool_sequence',
          steps: [
            { id: 'a', tool: 'app.open', arguments: {} },
            { id: 'b', tool: 'app.close', arguments: {} },
          ],
        },
      }),
    };
    const client = new HttpAiServerClient(
      config('https://ai.example'),
      http as never,
      conversations as never,
    );
    expect((await client.generate(turn)).toolCalls).toEqual([]);
    http.request.mockResolvedValue({
      conversationId: 'remote-conversation',
      response: { type: 'tool_call', tool: 'shell.execute', arguments: {} },
    });
    expect((await client.generate(turn)).toolCalls).toEqual([]);
  });
});
