import { AiConversationsService } from './ai-conversations.service';

describe('AI conversation ownership and persistence', () => {
  it('returns no remote ID for a first text turn without creating an empty AI conversation', async () => {
    const prisma = {
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'owned' }) },
      aiConversation: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ remoteId: 'generated' }),
      },
    };
    const http = { request: jest.fn() };
    const service = new AiConversationsService(prisma as never, http as never);
    expect(await service.lookup('user', 'owned', 'https://ai.example')).toBeUndefined();
    await service.remember('user', 'owned', 'https://ai.example', 'generated');
    expect(prisma.aiConversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { conversationId: 'owned', serverUrl: 'https://ai.example', remoteId: 'generated' },
        update: {},
      }),
    );
    expect(http.request).not.toHaveBeenCalled();
  });
  it('rejects a concurrent first response with a different saved ID', async () => {
    const prisma = {
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'owned' }) },
      aiConversation: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ remoteId: 'winner' }),
      },
    };
    await expect(
      new AiConversationsService(prisma as never, {} as never).remember(
        'user',
        'owned',
        'https://ai.example',
        'loser',
      ),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
  });
  it('selects only the title matching the trusted remote ID and tolerates unavailable metadata', async () => {
    const http = {
      request: jest.fn().mockResolvedValue([
        { conversationId: 'other', title: '다른 사용자 제목' },
        { conversationId: 'owned', title: '서울 여행 준비' },
      ]),
    };
    const service = new AiConversationsService({} as never, http as never);
    expect(await service.title('https://ai.example', 'owned', {})).toBe('서울 여행 준비');
    expect(await service.title('https://ai.example', 'missing', {})).toBeUndefined();
    http.request.mockRejectedValueOnce(new Error('unavailable'));
    expect(await service.title('https://ai.example', 'owned', {})).toBeUndefined();
  });
  it('checks ownership before using a stored remote ID', async () => {
    const prisma = {
      conversation: { findFirst: jest.fn().mockResolvedValue(null) },
      aiConversation: { findUnique: jest.fn() },
    };
    const http = { request: jest.fn() };
    await expect(
      new AiConversationsService(prisma as never, http as never).resolve(
        'attacker',
        'other',
        'https://ai.example',
        {},
        120000,
      ),
    ).rejects.toMatchObject({ response: { code: 'CONVERSATION_NOT_FOUND' } });
    expect(http.request).not.toHaveBeenCalled();
    expect(prisma.aiConversation.findUnique).not.toHaveBeenCalled();
  });
  it('reuses persisted IDs after adapter restart without creating a new remote conversation', async () => {
    const prisma = {
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'owned' }) },
      aiConversation: { findUnique: jest.fn().mockResolvedValue({ remoteId: 'persisted' }) },
    };
    const http = { request: jest.fn() };
    expect(
      await new AiConversationsService(prisma as never, http as never).resolve(
        'user',
        'owned',
        'https://ai.example',
        {},
        120000,
      ),
    ).toBe('persisted');
    expect(http.request).not.toHaveBeenCalled();
  });
});
