import { ConfigService } from '@nestjs/config';
import { JsonHttpClient } from '../../common/http/json-http.client';
import { HttpAiServerClient } from './http-ai-server.client';
import { AiTurnRequest } from '../ports/ai-server.client';

describe('HttpAiServerClient', () => {
  const turn: AiTurnRequest = { messages: [], responseLanguage: 'ko', tools: [] };
  const config = (url?: string) =>
    ({
      get: (key: string) => (key === 'AI_SERVER_URL' ? url : 'private-api-key'),
    }) as unknown as ConfigService;
  it('reports an unconfigured AI server without a fake response', async () => {
    const http = { request: jest.fn() };
    await expect(
      new HttpAiServerClient(config(), http as unknown as JsonHttpClient).generate(turn),
    ).rejects.toMatchObject({ response: { code: 'AI_NOT_CONFIGURED' } });
    expect(http.request).not.toHaveBeenCalled();
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
      ).generate(turn),
    ).rejects.toMatchObject({
      response: { code: 'AI_UNAVAILABLE', message: 'AI server is unavailable' },
    });
  });
});
