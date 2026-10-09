import { AgentService } from './agent.service';

describe('saved-message generation and cancellation', () => {
  function harness() {
    const conversations = { active: jest.fn(), applyAiTitle: jest.fn() };
    const messages = {
      append: jest.fn(),
      list: jest
        .fn()
        .mockResolvedValue({ items: [{ id: 'saved', role: 'USER', content: '안녕' }] }),
    };
    const ai = {
      generate: jest.fn().mockResolvedValue({ content: '응답', toolCalls: [], title: 'AI 제목' }),
    };
    const responses = { deliver: jest.fn() };
    const service = new AgentService(
      conversations as never,
      messages as never,
      ai as never,
      { build: jest.fn().mockResolvedValue({}) } as never,
      responses as never,
      { track: (_: unknown, fn: () => unknown) => fn() } as never,
    );
    return { service, conversations, messages, ai, responses };
  }
  const input = {
    conversationId: 'conversation',
    messageId: 'saved',
    content: '안녕',
    attachmentIds: [],
  };
  it('reuses a saved user message without duplicating it and forwards a future AI title', async () => {
    const { service, messages, conversations } = harness();
    await service.turn('user', input);
    expect(messages.append).not.toHaveBeenCalled();
    expect(conversations.applyAiTitle).toHaveBeenCalledWith('user', 'conversation', 'AI 제목');
  });
  it('does not persist or deliver a late AI reply after cancellation', async () => {
    const { service, ai, responses, conversations } = harness();
    const abort = new AbortController();
    ai.generate.mockImplementation(async () => {
      abort.abort();
      return { content: 'late', toolCalls: [] };
    });
    await expect(service.turn('user', input, abort.signal)).rejects.toThrow();
    expect(responses.deliver).not.toHaveBeenCalled();
    expect(conversations.applyAiTitle).not.toHaveBeenCalled();
  });
  it('rejects an unrelated saved message', async () => {
    const { service, ai } = harness();
    await expect(service.turn('user', { ...input, messageId: 'other' })).rejects.toMatchObject({
      response: { code: 'CONFLICT' },
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });
});
